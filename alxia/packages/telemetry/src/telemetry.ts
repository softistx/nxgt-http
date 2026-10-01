import { alxia, type RequestContext } from '@alxia/core';
import {
	continuing,
	createTelemetry,
	type SpanScope,
	type Telemetry,
	type TelemetryOptions,
	withTelemetry,
} from '@nxgt/telemetry';
import {
	HTTP_ROUTE,
	HTTP_STATUS,
	requestAttributes,
	serverFailed,
} from './attributes';

interface Hooks {
	/**
	 * Whether a request gets a span. Every one does by default: a library
	 * that decides which requests do not matter hides the one that did.
	 */
	readonly traced?: (ctx: RequestContext) => boolean;
	/** The span's name before routing. `"<METHOD> <path>"` by default, then `"<METHOD> <route>"`. */
	readonly spanName?: (ctx: RequestContext) => string;
	/** Whether the response says `traceparent` back, so a caller can find the trace. Off by default. */
	readonly traceResponse?: boolean;
}

/**
 * A telemetry built from `service` and `@nxgt/telemetry`'s options, and
 * installed; or one handed over as `instance`, adopted and not closed.
 */
export type TelemetryPluginOptions =
	| (Hooks &
			TelemetryOptions & {
				/** The service name: everything groups by it. */
				readonly service: string;
				readonly instance?: undefined;
			})
	| (Hooks & {
			readonly instance: Telemetry;
			readonly service?: undefined;
	  });

/**
 * One server span per request, with [`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry),
 * as a plugin.
 *
 * The span is opened by an `around` hook, so it holds everything the
 * request runs — the hooks, the handler, what they await, the `onResponse`
 * hooks — and every log written with `createLogger` inside it carries its
 * trace id. An inbound `traceparent` continues its trace; an unusable one
 * starts a fresh trace. The span is named for the route, `GET /users/:id`,
 * once routing has matched. Only a 5xx marks it an error.
 *
 * Routes declared after the plugin read the span as `span`, and the
 * telemetry as `telemetry`.
 *
 * ```ts
 * const tracing = telemetry({ service: 'checkout', exporters: [otlpExporter({ endpoint })] });
 * const app = alxia().use(tracing).get(...);
 * app.onStop(() => tracing.telemetry.close());
 * ```
 */
export function telemetry(options: TelemetryPluginOptions) {
	const instance =
		options.instance ?? createTelemetry(options.service, options).install();
	const traced = guarded(options.traced ?? (() => true), () => true);
	const spanName = guarded(options.spanName ?? defaultName, defaultName);
	const scopes = new WeakMap<Request, SpanScope>();

	const plugin = alxia()
		.around((ctx, next) => {
			if (!traced(ctx)) return next();
			return withTelemetry(instance, () =>
				continuing(
					ctx.request.headers.get('traceparent'),
					spanName(ctx),
					{
						kind: 'server',
						attributes: requestAttributes(ctx.url, ctx.request.method, ctx.ip),
					},
					async (scope) => {
						scopes.set(ctx.request, scope);
						let response: Response;
						try {
							response = await next();
						} finally {
							// Even a request that failed was routed, and the route is the name.
							if (ctx.route !== undefined) {
								scope.name = `${ctx.request.method} ${ctx.route}`;
								scope.attribute(HTTP_ROUTE, ctx.route);
							}
						}
						record(scope, response.status, ctx.error);
						if (options.traceResponse) {
							try {
								response.headers.set('traceparent', scope.traceparent());
							} catch {
								// An immutable response keeps its headers; the span is what matters.
							}
						}
						return response;
					},
				),
			);
		})
		.derive(({ request }) => ({
			/** The server span around this request; `undefined` when `traced` said no. */
			span: scopes.get(request),
			telemetry: instance,
		}));

	return Object.assign(plugin, { telemetry: instance });
}

/**
 * The status, and the failure. A route's error is recorded as the span's
 * exception, but only a 5xx makes it an error: a 401 a guard answered is
 * the server working.
 */
function record(scope: SpanScope, status: number, error: unknown): void {
	if (error !== undefined) {
		const before = scope.status;
		scope.fail(error);
		if (!serverFailed(status)) scope.status = before;
	}
	scope.attribute(HTTP_STATUS, status);
	if (serverFailed(status) && scope.status === 'ok') scope.status = 'error';
}

function defaultName(ctx: RequestContext): string {
	return `${ctx.request.method} ${ctx.url.pathname}`;
}

/** A hook, and what to answer when it throws: observability never costs the request. */
function guarded<T>(
	hook: (ctx: RequestContext) => T,
	fallback: (ctx: RequestContext) => T,
): (ctx: RequestContext) => T {
	return (ctx) => {
		try {
			return hook(ctx);
		} catch {
			return fallback(ctx);
		}
	};
}

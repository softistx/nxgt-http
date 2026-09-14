/**
 * The runtime behind `hono.ts`. Each route is registered on a Hono app as
 * `[...middlewares, validator, handler]`: the validator reads the parameters
 * and the body with the validators of `operations.ts`, hands the results
 * to `c.req.valid()`, and answers every issue at once when there is one.
 */
import type { Context, Hono, MiddlewareHandler, Next } from 'hono';
import {
	type SchemaIssue,
	toIssues,
	type ValidationFailure,
	type ValidationIssue,
	type ValidationTarget,
	validationErrorHandler,
} from './errors';
import type { Api, ApiOptions, ApiSpec, Method, Routes } from './types';

/** What the engine asks of a validator: Zod's `safeParse`. */
export interface Validator {
	safeParse(
		value: unknown,
	):
		| { success: true; data: unknown }
		| { success: false; error: { issues: readonly SchemaIssue[] } };
}

export interface RuntimeMedia {
	readonly kind: 'json' | 'form' | 'text' | 'binary';
	readonly schema?: Validator;
}

/** An entry of the `operations` table in `operations.ts`. */
export interface RuntimeOperation {
	readonly method: Method;
	readonly path: string;
	readonly honoPath: string;
	readonly tags: readonly string[];
	readonly parameters: readonly {
		readonly name: string;
		readonly in: 'path' | 'query' | 'header';
		readonly list: boolean;
		readonly explode: boolean;
	}[];
	readonly param: Validator;
	readonly query: Validator;
	readonly header: Validator;
	readonly body?: {
		readonly required: boolean;
		readonly content: { readonly [mediaType: string]: RuntimeMedia };
	};
	readonly responses: {
		readonly [status: number]: { readonly [mediaType: string]: RuntimeMedia };
	};
}

/** The `operations` table, keyed by `operationId`. */
export type OperationTable = {
	readonly [operationId: string]: RuntimeOperation;
};

const METHODS: readonly Method[] = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
	'query',
];

/** Stands for the validator in a chain; the engine swaps it out. */
const VALIDATE: MiddlewareHandler = async () => {
	throw new Error(
		'routes.validate marks where a routes chain validates the request; it cannot run anywhere else',
	);
};

type Settings = ApiOptions & { prefix?: string; tag?: string };
type Handler = (c: Context, next: Next) => unknown;
type App = Hono<any, any, any>;
/** What `addValidatedData` takes: whatever the validator returned. */
type Validated = Parameters<Context['req']['addValidatedData']>[1];

/** Every route the engine put on an app, in order, for the shadowing check. */
const onApp = new WeakMap<
	object,
	{ method: Method; path: string; label: string }[]
>();

/**
 * One registry for a spec: `routes(app)` for each app or module, then
 * `assertComplete()`. `hono.ts` calls it with the spec's table.
 */
export function createApi<S extends ApiSpec>(
	operations: OperationTable,
	defaults: ApiOptions = {},
): Api<S> {
	const done = new Set<string>();
	const byRoute = new Map<string, string>();
	for (const [id, operation] of Object.entries(operations)) {
		byRoute.set(`${operation.method} ${operation.path}`, id);
	}
	const label = (id: string, operation: RuntimeOperation): string =>
		`${id} (${operation.method.toUpperCase()} ${operation.path})`;

	const register = (
		app: App,
		id: string,
		chain: unknown[],
		settings: Settings,
	): void => {
		const operation = operations[id];
		if (!operation) throw new Error(`${id} is not an operationId of the spec`);
		const name = label(id, operation);
		if (done.has(id)) throw new Error(`${name} already has a route`);
		if (settings.tag !== undefined && !operation.tags.includes(settings.tag)) {
			throw new Error(`${name} is not tagged ${settings.tag}`);
		}
		const handler = chain.at(-1);
		const middlewares = chain.slice(0, -1) as MiddlewareHandler[];
		if (typeof handler !== 'function' || handler === VALIDATE) {
			throw new Error(`${name}: the last argument must be the handler`);
		}
		const marker = middlewares.indexOf(VALIDATE);
		if (marker !== middlewares.lastIndexOf(VALIDATE)) {
			throw new Error(`${name}: routes.validate appears twice`);
		}
		const path = localPath(operation, settings.prefix, name);
		const routes = onApp.get(app) ?? [];
		for (const earlier of routes) {
			if (earlier.method === operation.method && shadows(earlier.path, path)) {
				throw new Error(
					`${name} would never be reached: ${earlier.label}, registered before it, matches ${path} first. Register ${id} before it`,
				);
			}
		}
		const at = marker < 0 ? middlewares.length : marker;
		// Hono's overloads type a literal chain; this one is built at runtime.
		const on = app.on as unknown as (
			method: string,
			path: string,
			...handlers: MiddlewareHandler[]
		) => unknown;
		on.call(
			app,
			operation.method.toUpperCase(),
			path,
			...middlewares.slice(0, at),
			validation(id, operation, settings),
			...middlewares.slice(marker < 0 ? at : at + 1),
			reply(id, operation, handler as Handler, settings),
		);
		routes.push({ method: operation.method, path, label: name });
		onApp.set(app, routes);
		done.add(id);
	};

	const make = (app: App, settings: Settings): Record<string, unknown> => {
		const routes: Record<string, unknown> = {
			validate: VALIDATE,
			with: (options: ApiOptions) => make(app, { ...settings, ...options }),
			operation: (id: string, ...chain: unknown[]) => {
				register(app, id, chain, settings);
				return routes;
			},
		};
		for (const method of METHODS) {
			routes[method] = (path: string, ...chain: unknown[]) => {
				const id = byRoute.get(`${method} ${path}`);
				if (id === undefined) {
					throw new Error(
						`The spec has no ${method.toUpperCase()} ${path} operation`,
					);
				}
				register(app, id, chain, settings);
				return routes;
			};
		}
		return routes;
	};

	const missing = (tag?: string): string[] =>
		Object.entries(operations)
			.filter(
				([id, operation]) =>
					!done.has(id) && (tag === undefined || operation.tags.includes(tag)),
			)
			.map(([id]) => id);

	return {
		routes: <Prefix extends string>(app: App, options: Settings = {}) =>
			make(app, { ...defaults, ...options }) as unknown as Routes<
				S,
				never,
				Prefix
			>,
		missing,
		assertComplete(tag?: string) {
			const left = missing(tag);
			if (left.length === 0) return;
			throw new Error(
				`${left.length} operation(s)${tag === undefined ? '' : ` tagged ${tag}`} have no route:\n${left
					.map((id) => `  ${label(id, operations[id] as RuntimeOperation)}`)
					.join('\n')}`,
			);
		},
	};
}

/** The operation's Hono path on an app mounted at `prefix`. */
function localPath(
	operation: RuntimeOperation,
	prefix: string | undefined,
	name: string,
): string {
	if (!prefix) return operation.honoPath;
	const mount = prefix.replace(/\{([^}]+)\}/g, ':$1').replace(/\/$/, '');
	const path = operation.honoPath;
	if (path !== mount && !path.startsWith(`${mount}/`)) {
		throw new Error(
			`${name}: its path ${operation.path} is not under the prefix ${prefix}`,
		);
	}
	return path.slice(mount.length) || '/';
}

/**
 * Whether a request for `later` would always reach `earlier` first: Hono
 * tries routes in the order they were registered, so `/employees/:id`
 * registered before `/employees/me` answers for it.
 */
function shadows(earlier: string, later: string): boolean {
	const a = earlier.split('/');
	const b = later.split('/');
	if (a.length !== b.length) return false;
	for (const [i, segment] of a.entries()) {
		if (segment !== b[i] && !segment.startsWith(':')) return false;
	}
	return true;
}

function validation(
	id: string,
	operation: RuntimeOperation,
	settings: Settings,
): MiddlewareHandler {
	return async (c, next) => {
		const issues: ValidationIssue[] = [];
		const check: Check = (target, validator, value) => {
			const result = validator.safeParse(value);
			if (!result.success) {
				issues.push(...toIssues(target, result.error.issues));
			} else if (target !== 'body') {
				c.req.addValidatedData(target, result.data as Validated);
			}
		};
		check('param', operation.param, c.req.param());
		check('query', operation.query, readQuery(c, operation));
		check('header', operation.header, readHeaders(c, operation));
		if (operation.body) await readBody(c, operation.body, issues, check);
		if (issues.length > 0) {
			return fail(c, settings, {
				kind: 'request',
				operationId: id,
				method: operation.method,
				path: operation.path,
				issues,
			});
		}
		await next();
	};
}

type Check = (
	target: ValidationTarget,
	validator: Validator,
	value: unknown,
) => void;

/** Declared query parameters: a string each, or every value of a list. */
function readQuery(
	c: Context,
	operation: RuntimeOperation,
): Record<string, unknown> {
	const query: Record<string, unknown> = {};
	for (const param of operation.parameters) {
		if (param.in !== 'query') continue;
		const value =
			param.list && param.explode
				? c.req.queries(param.name)
				: param.list
					? c.req.query(param.name)?.split(',')
					: c.req.query(param.name);
		if (value !== undefined) query[param.name] = value;
	}
	return query;
}

/** Declared headers, keyed lowercased; a list split on commas. */
function readHeaders(
	c: Context,
	operation: RuntimeOperation,
): Record<string, unknown> {
	const headers: Record<string, unknown> = {};
	for (const param of operation.parameters) {
		if (param.in !== 'header') continue;
		const value = c.req.header(param.name);
		if (value === undefined) continue;
		headers[param.name.toLowerCase()] = param.list
			? value.split(',').map((item) => item.trim())
			: value;
	}
	return headers;
}

const mediaType = (header: string): string =>
	(header.split(';')[0] ?? '').trim().toLowerCase();

/** The declared media type for `type`: itself, else `type/*`, else `*\/*`. */
function match(
	content: { readonly [mediaType: string]: RuntimeMedia },
	type: string,
): RuntimeMedia | undefined {
	for (const [key, media] of Object.entries(content)) {
		if (key.toLowerCase() === type) return media;
	}
	return content[`${type.split('/')[0]}/*`] ?? content['*/*'];
}

const targetOf = (kind: RuntimeMedia['kind'] | undefined): ValidationTarget =>
	kind === 'json' ? 'json' : kind === 'form' ? 'form' : 'body';

async function readBody(
	c: Context,
	body: NonNullable<RuntimeOperation['body']>,
	issues: ValidationIssue[],
	check: Check,
): Promise<void> {
	const declared = Object.keys(body.content).join(', ');
	const target = targetOf(Object.values(body.content)[0]?.kind);
	const absent = (at: ValidationTarget): void => {
		if (body.required) {
			issues.push({
				target: at,
				path: [],
				code: 'missing_body',
				message: `A request body is required: ${declared}`,
			});
		} else if (at === 'json' || at === 'form') {
			c.req.addValidatedData(at, undefined as unknown as Validated);
		}
	};
	const header = c.req.header('content-type');
	if (header === undefined) {
		if ((await c.req.text()) === '') absent(target);
		else {
			issues.push({
				target,
				path: [],
				code: 'invalid_content_type',
				message: `A request body needs a Content-Type: ${declared}`,
			});
		}
		return;
	}
	const type = mediaType(header);
	const media = match(body.content, type);
	if (!media) {
		issues.push({
			target,
			path: [],
			code: 'invalid_content_type',
			message: `Content-Type ${type} is not one of ${declared}`,
		});
		return;
	}
	switch (media.kind) {
		case 'json': {
			const text = await c.req.text();
			if (text === '') return absent('json');
			let value: unknown;
			try {
				value = JSON.parse(text);
			} catch {
				issues.push({
					target: 'json',
					path: [],
					code: 'invalid_json',
					message: 'The request body is not valid JSON',
				});
				return;
			}
			if (media.schema) check('json', media.schema, value);
			else c.req.addValidatedData('json', value as Validated);
			return;
		}
		case 'form': {
			const value = await c.req.parseBody({ all: true });
			if (media.schema) check('form', media.schema, value);
			else c.req.addValidatedData('form', value);
			return;
		}
		case 'text':
			if (media.schema) check('body', media.schema, await c.req.text());
			return;
		default:
			return;
	}
}

async function fail(
	c: Context,
	settings: Settings,
	failure: ValidationFailure,
): Promise<Response> {
	const answer = await settings.onValidationError?.(failure, c);
	return answer instanceof Response
		? answer
		: validationErrorHandler(failure, c);
}

function reply(
	id: string,
	operation: RuntimeOperation,
	handler: Handler,
	settings: Settings,
): MiddlewareHandler {
	return async (c, next) => {
		const response = await handler(c, next);
		if (!settings.validateResponses || !(response instanceof Response)) {
			return response as Response | undefined;
		}
		const issues = await checkReply(id, operation, response);
		if (issues.length === 0) return response;
		return fail(c, settings, {
			kind: 'response',
			operationId: id,
			method: operation.method,
			path: operation.path,
			status: response.status,
			issues,
		});
	};
}

async function checkReply(
	id: string,
	operation: RuntimeOperation,
	response: Response,
): Promise<ValidationIssue[]> {
	const issue = (code: string, message: string): ValidationIssue[] => [
		{ target: 'response', path: [], code, message },
	];
	const declared = operation.responses[response.status];
	if (!declared) {
		return issue(
			'undeclared_status',
			`${id} declares no ${response.status} reply`,
		);
	}
	const types = Object.keys(declared);
	if (types.length === 0) return [];
	const header = response.headers.get('content-type');
	const media =
		header === null ? undefined : match(declared, mediaType(header));
	if (!media) {
		return issue(
			'invalid_content_type',
			`A ${response.status} reply of ${id} is ${types.join(' or ')}, not ${header ?? 'untyped'}`,
		);
	}
	if (!media.schema || (media.kind !== 'json' && media.kind !== 'text')) {
		return [];
	}
	const text = await response.clone().text();
	let value: unknown = text;
	if (media.kind === 'json') {
		try {
			value = JSON.parse(text);
		} catch {
			return issue('invalid_json', 'The reply body is not valid JSON');
		}
	}
	const result = media.schema.safeParse(value);
	return result.success ? [] : toIssues('response', result.error.issues);
}

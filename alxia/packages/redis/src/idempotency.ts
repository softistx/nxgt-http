import { alxia, type BaseContext } from '@alxia/core';
import {
	bindIdempotency,
	defineIdempotency,
	GuardError,
} from '@nxgt/redis-guard';
import type { RedisClient } from 'bun';
import { z } from 'zod';

export interface IdempotencyOptions {
	/** Names the keys it stores. */
	readonly name: string;
	/** Seconds a finished response is kept and replayed. A day by default. */
	readonly ttl?: number;
	/** Milliseconds a running request holds its key unless renewed. `@nxgt/redis-guard`'s 10 s by default. */
	readonly lease?: number;
	/** Milliseconds a repeat waits for the first to finish before a 409. None by default. */
	readonly wait?: number;
	/** The methods it guards. `POST` and `PATCH` by default: the others are idempotent already. */
	readonly methods?: readonly string[];
	/** The header the key is read from. `Idempotency-Key` by default. */
	readonly header?: string;
	/** Whether a guarded request without a key is refused, with a 400. Off by default. */
	readonly required?: boolean;
	/**
	 * Whose key it is: keys are scoped by the route and by this, so two
	 * clients choosing the same key never see each other's response. The
	 * client's address by default; a user id when there is one.
	 */
	readonly scope?: (ctx: BaseContext) => string | undefined;
}

/** The body of a refusal. */
export interface IdempotencyErrorBody {
	readonly error:
		| 'idempotency_key_missing'
		| 'idempotency_key_invalid'
		| 'idempotency_in_progress'
		| 'idempotency_key_reused';
	/** Seconds until a running request should be over: with `idempotency_in_progress`. */
	readonly retryAfter?: number;
}

const Stored = z.object({
	status: z.number().int(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	body: z.string(),
});
type Stored = z.infer<typeof Stored>;

/** Headers a replay never repeats: a session cookie belongs to one response. */
const UNSTORED_HEADERS = new Set(['set-cookie', 'date', 'content-length']);

const KEY = /^[\x21-\x7e]{1,255}$/;

/** A response that is answered and not kept: a 5xx, a stream. */
class Unstored extends Error {
	readonly response: Response;
	constructor(response: Response) {
		super('unstored');
		this.response = response;
	}
}

/**
 * Idempotent routes, as a plugin, with `@nxgt/redis-guard`: a `POST` or
 * `PATCH` carrying an `Idempotency-Key` runs once per key, and every repeat
 * gets the first response back, marked `Idempotent-Replayed: true` — across
 * every process sharing the Redis. Routes declared after it are guarded.
 *
 * A repeat while the first still runs is a 409, and the same key with
 * another request — method, path or body — a 422: both are part of every
 * guarded route's type. A 5xx, or a stream, is answered and not kept: the
 * key is free again.
 *
 * ```ts
 * app.use(idempotency(redis.client, { name: 'payments' })).post('/payments', ...);
 * ```
 */
export function idempotency(client: RedisClient, options: IdempotencyOptions) {
	const methods = new Set(options.methods ?? ['POST', 'PATCH']);
	const header = options.header ?? 'idempotency-key';
	const scope = options.scope ?? ((ctx: BaseContext) => ctx.ip);
	const bound = bindIdempotency(
		client,
		defineIdempotency({
			name: options.name,
			key: (key: string) => key,
			ttl: options.ttl ?? 86_400,
			...(options.lease === undefined ? {} : { lease: options.lease }),
			schema: Stored,
		}),
	);
	const refuse = (
		error: IdempotencyErrorBody['error'],
		retryAfter?: number,
	) => {
		const body: IdempotencyErrorBody =
			retryAfter === undefined ? { error } : { error, retryAfter };
		return body;
	};

	return alxia().wrap(async (ctx, next) => {
		const { request, reply } = ctx;
		if (!methods.has(request.method)) return next();
		const key = request.headers.get(header);
		if (key === null) {
			return options.required
				? reply(400, refuse('idempotency_key_missing'))
				: next();
		}
		if (!KEY.test(key)) return reply(400, refuse('idempotency_key_invalid'));

		const body = new Uint8Array(await request.clone().arrayBuffer());
		const head = new TextEncoder().encode(
			`${request.method} ${ctx.url.pathname}${ctx.url.search}\n`,
		);
		const fingerprint = new Uint8Array(head.length + body.length);
		fingerprint.set(head);
		fingerprint.set(body, head.length);
		const id = `${ctx.route}:${scope(ctx) ?? 'anyone'}:${key}`;

		try {
			const { value, replayed } = await bound.run(
				id,
				async () => store(await next()),
				{
					fingerprint,
					...(options.wait === undefined ? {} : { wait: options.wait }),
				},
			);
			return restore(value, replayed);
		} catch (error) {
			if (error instanceof Unstored) return error.response;
			if (error instanceof GuardError && error.code === 'IN_PROGRESS') {
				const retryAfter = Math.max(
					1,
					Math.ceil((error.retryAfter ?? 0) / 1000),
				);
				return reply(409, refuse('idempotency_in_progress', retryAfter), {
					headers: { 'retry-after': String(retryAfter) },
				});
			}
			if (error instanceof GuardError && error.code === 'MISMATCH') {
				return reply(422, refuse('idempotency_key_reused'));
			}
			throw error;
		}
	});
}

async function store(response: Response): Promise<Stored> {
	if (
		response.status >= 500 ||
		response.headers.get('content-type')?.startsWith('text/event-stream')
	) {
		throw new Unstored(response);
	}
	const headers: [string, string][] = [];
	for (const [name, value] of response.headers) {
		if (!UNSTORED_HEADERS.has(name)) headers.push([name, value]);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		status: response.status,
		headers,
		body: Buffer.from(bytes).toString('base64'),
	};
}

function restore(stored: Stored, replayed: boolean): Response {
	const headers = new Headers(stored.headers);
	if (replayed) headers.set('idempotent-replayed', 'true');
	const body = Buffer.from(stored.body, 'base64');
	return new Response(
		stored.status === 204 || stored.status === 304 ? null : body,
		{ status: stored.status, headers },
	);
}

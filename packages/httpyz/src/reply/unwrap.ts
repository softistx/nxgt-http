import { ReplyStatusError } from '../errors/errors';

/**
 * The data of a reply with one of `statuses`, narrowed to theirs; any other
 * reply throws a `ReplyStatusError`.
 *
 * ```ts
 * const employee = unwrap(await http.get('/employees/{id}', { param: { id }, responses }), 200);
 * ```
 */
export function unwrap<
	R extends { readonly status: number; readonly data: unknown },
	S extends R['status'],
>(reply: R, ...statuses: [S, ...S[]]): Extract<R, { status: S }>['data'] {
	if (!(statuses as readonly number[]).includes(reply.status)) {
		throw new ReplyStatusError(reply, statuses);
	}
	return reply.data as Extract<R, { status: S }>['data'];
}

/** The members of a reply union with a 2xx status: all of it when its status is any number. */
export type Success<R> = R extends { readonly status: infer S extends number }
	? number extends S
		? R
		: `${S}` extends `2${string}`
			? R
			: never
	: never;

/**
 * The data of a 2xx reply, narrowed to the success statuses the call
 * declares; any other reply throws a `ReplyStatusError`.
 *
 * ```ts
 * const employee = ok(await http.get('/employees/{id}', { param: { id }, responses }));
 * ```
 */
export function ok<
	R extends { readonly status: number; readonly data: unknown },
>(reply: R): Success<R>['data'] {
	if (reply.status < 200 || reply.status > 299) {
		throw new ReplyStatusError(reply, []);
	}
	return reply.data as Success<R>['data'];
}

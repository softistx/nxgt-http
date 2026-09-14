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

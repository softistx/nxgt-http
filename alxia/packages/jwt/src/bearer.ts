import {
	alxia,
	check,
	type InferOutput,
	type StandardSchemaV1,
	type ValidationIssue,
} from '@alxia/core';
import type { Jwt, JwtClaims, VerifyResult } from './jwt';

export interface BearerOptions<Schema extends StandardSchemaV1 | undefined> {
	readonly jwt: Jwt;
	/** Checks the claims: what the routes behind the guard read as `user`. */
	readonly schema?: Schema;
	/** Reads the token from this cookie when no `Authorization` header carries one. */
	readonly cookie?: string;
}

/** The body of the 401. */
export interface UnauthorizedBody {
	readonly error: 'unauthorized';
	readonly reason:
		| 'missing'
		| Exclude<VerifyResult, { ok: true }>['reason']
		| 'claims';
	readonly issues?: readonly ValidationIssue[];
}

type User<Schema> = Schema extends StandardSchemaV1
	? InferOutput<Schema>
	: JwtClaims;

/**
 * A guard, as a plugin: every route declared after it needs a valid token —
 * `Authorization: Bearer <token>`, or a cookie — and reads its claims,
 * checked by `schema`, as `user`. Without one, a 401, which is part of
 * each such route's type.
 *
 * ```ts
 * app.use(bearer({ jwt, schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }) }))
 *    .get('/me', ({ user, reply }) => reply(200, user));
 * ```
 */
export function bearer<Schema extends StandardSchemaV1 | undefined = undefined>(
	options: BearerOptions<Schema>,
) {
	const refuse = (
		reason: UnauthorizedBody['reason'],
		issues?: readonly ValidationIssue[],
	) => {
		const body: UnauthorizedBody =
			issues === undefined
				? { error: 'unauthorized', reason }
				: { error: 'unauthorized', reason, issues };
		return body;
	};
	return alxia().derive(async ({ request, reply }) => {
		const header = request.headers.get('authorization');
		let token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
		if (token === undefined && options.cookie !== undefined) {
			const cookies = new Bun.CookieMap(request.headers.get('cookie') ?? '');
			token = cookies.get(options.cookie) ?? undefined;
		}
		const challenge = { headers: { 'www-authenticate': 'Bearer' } };
		if (token === undefined) return reply(401, refuse('missing'), challenge);
		const verified = await options.jwt.verify(token);
		if (!verified.ok) return reply(401, refuse(verified.reason), challenge);
		if (options.schema === undefined) {
			return { user: verified.claims as User<Schema> };
		}
		const checked = await check(options.schema, verified.claims, 'headers');
		if (!checked.ok)
			return reply(401, refuse('claims', checked.issues), challenge);
		return { user: checked.value as User<Schema> };
	});
}

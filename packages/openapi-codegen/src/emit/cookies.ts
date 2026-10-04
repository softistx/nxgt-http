/**
 * What becomes of a cookie parameter outside `alxia.ts`, which validates it.
 * The client files leave it out: a client does not set cookies, the browser
 * or its cookie jar sends them. `hono.ts` routes the operation without
 * validating it: `@nxgt/openapi-hono` does not read cookies.
 */
import type { OperationIR } from '../ir/types';
import type { EmitContext } from './context';

/** `` `session` `` or `` `session` and `theme` ``. */
const names = (operation: OperationIR): string => {
	const quoted = operation.cookies.map((cookie) => `\`${cookie.name}\``);
	return quoted.length === 1
		? (quoted[0] ?? '')
		: `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
};

/** One warning per file group an operation's cookies are not enforced in. */
export function warnCookies(ctx: EmitContext): void {
	for (const operation of ctx.ir.operations) {
		const [first] = operation.cookies;
		if (first === undefined) continue;
		const which = operation.cookies.length === 1 ? 'cookie' : 'cookies';
		const at = { file: first.location.file, pointer: first.location.pointer };
		ctx.warnings.push({
			severity: 'warning',
			code: 'ignored',
			message: `${operation.operationId}: types.ts, zod.ts, operations.ts and paths.ts leave out its ${which} ${names(operation)}: a client does not set cookies, the browser or its cookie jar sends them`,
			...at,
		});
		if (ctx.options.hono) {
			ctx.warnings.push({
				severity: 'warning',
				code: 'not_enforced',
				message: `${operation.operationId}: hono.ts routes it without validating its ${which} ${names(operation)}: read ${operation.cookies.length === 1 ? 'it' : 'them'} with getCookie() from hono/cookie`,
				...at,
			});
		}
	}
}

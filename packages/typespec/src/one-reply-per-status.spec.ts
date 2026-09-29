/**
 * One reply per status: the program in `test/programs/` declares replies the
 * emitter would merge, and the unions it keeps. The blog fixture, which the
 * other specs emit, passes the check.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';

function checked(path: string) {
	const main = fileURLToPath(new URL(path, import.meta.url));
	return compile(NodeHost, main, { noEmit: true });
}

const lost = (operation: string, status: string) => ({
	code: '@nxgt/typespec/duplicate-status-reply',
	severity: 'error' as const,
	message: `${operation} declares a reply without a body and one with a body of status ${status}: the emitter merges them into one, and the reply without a body is lost. Declare the one the route sends.`,
});

it('refuses a reply without a body beside one with a body, and warns of two bodies', async () => {
	const program = await checked('../test/programs/one-reply-per-status.tsp');
	expect(
		program.diagnostics.map(({ code, severity, message }) => ({
			code,
			severity,
			message,
		})),
	).toEqual([
		lost('stock', '400-499'),
		lost('list', '401'),
		{
			code: '@nxgt/typespec/merged-status-reply',
			severity: 'warning' as const,
			message:
				"create declares two replies with a body of status 409: the emitter merges their bodies under the first one's description. Declare the one the route sends.",
		},
		lost('probe', '200'),
		lost('read', '401'),
	]);
});

it('passes the blog fixture', async () => {
	const program = await checked('../test/fixtures/blog/main.tsp');
	expect(program.diagnostics).toEqual([]);
});

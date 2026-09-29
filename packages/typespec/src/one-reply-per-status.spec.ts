/**
 * One reply per status: the program in `test/programs/` declares two replies
 * the emitter would merge, and two unions it keeps. The blog fixture, which
 * the other specs emit, passes the check.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';

function checked(path: string) {
	const main = fileURLToPath(new URL(path, import.meta.url));
	return compile(NodeHost, main, { noEmit: true });
}

it('refuses two replies of one status, and keeps unions of bodies', async () => {
	const program = await checked('../test/programs/one-reply-per-status.tsp');
	expect(
		program.diagnostics.map(({ code, message }) => ({ code, message })),
	).toEqual([
		{
			code: '@nxgt/typespec/duplicate-status-reply',
			message:
				'list declares two replies of status 401: the emitter merges them into one, and a reply without a body is lost. Declare the one the route sends.',
		},
		{
			code: '@nxgt/typespec/duplicate-status-reply',
			message:
				'create declares two replies of status 409: the emitter merges them into one, and a reply without a body is lost. Declare the one the route sends.',
		},
	]);
});

it('passes the blog fixture', async () => {
	const program = await checked('../test/fixtures/blog/main.tsp');
	expect(program.diagnostics).toEqual([]);
});

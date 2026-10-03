/**
 * The linter: the program in `test/programs/` breaks each recommended rule
 * once, and passes it everywhere else. The blog fixture passes them all.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';

function linted(path: string) {
	const main = fileURLToPath(new URL(path, import.meta.url));
	return compile(NodeHost, main, {
		noEmit: true,
		linterRuleSet: { extends: ['@nxgt/typespec/recommended'] },
	});
}

const list = (operation: string) => ({
	code: '@nxgt/typespec/list-returns-page',
	severity: 'warning' as const,
	message: `${operation} returns an array: return Page<Item> or CursorPage<Item>, which can carry a total or a next cursor.`,
});

const body = (operation: string, status: string) => ({
	code: '@nxgt/typespec/error-body-shape',
	severity: 'warning' as const,
	message: `${operation} answers ${status} with a body that is not the nxgt envelope: declare BadRequest, NotFound or another of the library's errors, or a body that spreads or extends ErrorBody<Status>.`,
});

it('warns of each rule the recommended set enables', async () => {
	const program = await linted('../test/programs/linter.tsp');
	expect(
		program.diagnostics.map(({ code, severity, message }) => ({
			code,
			severity,
			message,
		})),
	).toEqual([
		list('listMembers'),
		list('listAll'),
		body('create', '418'),
		body('fail', '500-599'),
		body('any', '*'),
		list('list'),
		{
			code: '@nxgt/typespec/service-operation-ids',
			severity: 'warning',
			message:
				"The service Legacy has no @operationIds: its ids are the emitter's, such as Users_list. Mark the namespace with @operationIds.",
		},
	]);
});

it('passes the blog fixture', async () => {
	const program = await linted('../test/fixtures/blog/main.tsp');
	expect(program.diagnostics).toEqual([]);
});

it('runs nothing unless the spec extends the set', async () => {
	const main = fileURLToPath(
		new URL('../test/programs/linter.tsp', import.meta.url),
	);
	const program = await compile(NodeHost, main, { noEmit: true });
	expect(program.diagnostics).toEqual([]);
});

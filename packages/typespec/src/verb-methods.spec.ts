/**
 * Verbs and methods: the program in `test/programs/` sends verbs with the
 * methods they name and with others. The blog fixture passes the check.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';

function checked(path: string) {
	const main = fileURLToPath(new URL(path, import.meta.url));
	return compile(NodeHost, main, { noEmit: true });
}

it('warns of a verb sent with a method it does not name', async () => {
	const program = await checked('../test/programs/verb-methods.tsp');
	expect(
		program.diagnostics.map(({ code, severity, message }) => ({
			code,
			severity,
			message,
		})),
	).toEqual(
		[
			['findById', 'POST', 'find', 'GET or HEAD'],
			['replace', 'POST', 'replace', 'PUT'],
			['patch', 'PUT', 'patch', 'PATCH'],
		].map(([operation, method, verb, expected]) => ({
			code: '@nxgt/typespec/verb-method-mismatch',
			severity: 'warning' as const,
			message: `${operation} is sent with ${method}, where its verb ${verb} is sent with ${expected}. Give it that method, or a name that is not a verb.`,
		})),
	);
});

it('passes the blog fixture', async () => {
	const program = await checked('../test/fixtures/blog/main.tsp');
	expect(program.diagnostics).toEqual([]);
});

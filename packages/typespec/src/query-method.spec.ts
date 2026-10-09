/**
 * `@queryMethod`, on the program in `test/programs/query-method.tsp`: the
 * extension it writes, the verb it is checked as, and the error off a `POST`.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
	compile,
	type Interface,
	type Namespace,
	NodeHost,
	type Operation,
	type Program,
} from '@typespec/compiler';
import { getExtensions } from '@typespec/openapi';

const main = fileURLToPath(
	new URL('../test/programs/query-method.tsp', import.meta.url),
);

function shop(program: Program): Namespace {
	const found = program.getGlobalNamespaceType().namespaces.get('Shop');
	if (found === undefined) throw new Error('no Shop namespace');
	return found;
}

function users(program: Program): Interface {
	const found = shop(program).interfaces.get('Users');
	if (found === undefined) throw new Error('no Users interface');
	return found;
}

const method = (program: Program, operation: Operation | undefined) =>
	operation && getExtensions(program, operation).get('x-nxgt-method');

it('marks the operation x-nxgt-method: query', async () => {
	const program = await compile(NodeHost, main, { noEmit: true });
	expect(method(program, users(program).operations.get('search'))).toBe(
		'query',
	);
	expect(method(program, shop(program).operations.get('lookUp'))).toBe('query');
});

it('checks its verb as a QUERY, and refuses it off a POST', async () => {
	const program = await compile(NodeHost, main, { noEmit: true });
	expect(
		program.diagnostics.map(({ code, severity, message }) => ({
			code,
			severity,
			message,
		})),
	).toEqual([
		{
			code: '@nxgt/typespec/query-method-not-post',
			severity: 'error',
			message:
				'list is marked @queryMethod and sent with GET: a QUERY is sent as a POST until @typespec/http declares it. Make it a @post.',
		},
		...[
			['findById', 'find', 'GET or HEAD'],
			['create', 'create', 'POST'],
		].map(([operation, verb, expected]) => ({
			code: '@nxgt/typespec/verb-method-mismatch',
			severity: 'warning' as const,
			message: `${operation} is sent with QUERY, where its verb ${verb} is sent with ${expected}. Give it that method, or a name that is not a verb.`,
		})),
	]);
});

/**
 * `@operationIds`: on the blog fixture's three interfaces, every operation is
 * named `<operation><Interface>`, except `Posts.read`, whose own
 * `@operationId("getPost")` wins, and the generated client's methods follow.
 * The programs in `test/programs/` are compiled without emitting: a template,
 * and the ids it must refuse.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
	compile,
	NodeHost,
	navigateProgram,
	type Program,
} from '@typespec/compiler';
import { getOperationId } from '@typespec/openapi';
import { operations as operations31 } from '../test/generated/blog/3.1.0/operations';
import { operations as operations32 } from '../test/generated/blog/3.2.0/operations';

function checked(name: string): Promise<Program> {
	const main = fileURLToPath(
		new URL(`../test/programs/${name}.tsp`, import.meta.url),
	);
	return compile(NodeHost, main, { noEmit: true });
}

it.each([
	['3.1.0', operations31],
	['3.2.0', operations32],
])(
	'names the operations from OpenAPI %s after their method and interface',
	(_, operations) => {
		expect(Object.keys(operations).sort()).toEqual([
			'createAuthors',
			'createComments',
			'createPosts',
			'deleteComments',
			'deletePosts',
			'getPost',
			'listAuthors',
			'listComments',
			'listPosts',
			'readAuthors',
			'updatePosts',
		]);
	},
);

it('names the operations of a template after each interface extending it', async () => {
	const program = await checked('resource-template');
	const ids: string[] = [];
	navigateProgram(program, {
		operation(operation) {
			ids.push(`${getOperationId(program, operation)}`);
		},
	});
	expect(program.diagnostics).toEqual([]);
	expect(ids.sort()).toEqual(['listOrders', 'listPets']);
}, 30_000);

it.each([
	['duplicate-operation-ids', 'listPets'],
	['inherited-operation-id', 'getPost'],
	['unmarked-operation-id', 'listPets'],
	['namespace-operation', 'listPets'],
])(
	'refuses %s: two operations named %s',
	async (name, id) => {
		const program = await checked(name);
		expect(
			program.diagnostics.map(({ code, message }) => ({ code, message })),
		).toEqual([
			{
				code: '@nxgt/typespec/duplicate-operation-id',
				message: `Two operations are named ${id}: an OpenAPI operation id must be unique.`,
			},
		]);
	},
	30_000,
);

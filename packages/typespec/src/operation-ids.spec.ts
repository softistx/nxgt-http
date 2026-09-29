/**
 * `@operationIds`, on the blog fixture's three interfaces: every operation is
 * named `<operation><Interface>`, except `Posts.read`, whose own
 * `@operationId("getPost")` wins. The generated client's methods follow.
 * Two operations named alike, in `test/invalid/`, are an error.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';
import { operations as operations31 } from '../test/generated/blog/3.1.0/operations';
import { operations as operations32 } from '../test/generated/blog/3.2.0/operations';

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

it.each([
	['duplicate-operation-ids', 'listPets'],
	['inherited-operation-id', 'getPost'],
])(
	'refuses %s: two operations named %s',
	async (file, id) => {
		const main = fileURLToPath(
			new URL(`../test/invalid/${file}.tsp`, import.meta.url),
		);
		const program = await compile(NodeHost, main, { noEmit: true });
		expect(
			program.diagnostics.map(({ code, message }) => ({ code, message })),
		).toEqual([
			{
				code: '@nxgt/typespec/duplicate-operation-id',
				message: `Two operations of @operationIds interfaces are named ${id}. Give one of them its own @operationId.`,
			},
		]);
	},
	30_000,
);

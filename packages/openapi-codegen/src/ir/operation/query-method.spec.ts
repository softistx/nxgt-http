/**
 * `x-nxgt-method: query`, as `@nxgt/typespec`'s `@queryMethod` writes it: a
 * `POST` that is a `QUERY` is marked in the operations table and its JSDoc;
 * the extension anywhere else is ignored with a warning.
 */
import { expect, it } from 'bun:test';
import { generateFiles } from '../../generate';
import { createMemoryFileSystem } from '../../loader/fs';

const reply = {
	'200': {
		description: 'ok',
		content: { 'application/json': { schema: { type: 'string' } } },
	},
};
const criteria = {
	required: true,
	content: { 'application/json': { schema: { type: 'string' } } },
};

async function generated(paths: Record<string, unknown>, openapi = '3.1.0') {
	const spec = JSON.stringify({
		openapi,
		info: { title: 't', version: '1' },
		paths,
	});
	const fs = createMemoryFileSystem({ '/s/openapi.json': spec });
	const { files, warnings } = await generateFiles(
		{ input: '/s/openapi.json', output: '/s/gen' },
		{ fs },
	);
	const file = (name: string) =>
		files.find((f) => f.path.endsWith(`/${name}`))?.content ?? '';
	return {
		operations: file('operations.ts'),
		types: file('types.ts'),
		warnings,
	};
}

it('marks a POST x-nxgt-method: query in the table and its JSDoc', async () => {
	const { operations, types, warnings } = await generated({
		'/users/search': {
			post: {
				operationId: 'searchUsers',
				'x-nxgt-method': 'query',
				requestBody: criteria,
				responses: reply,
			},
		},
		'/users': {
			post: {
				operationId: 'createUser',
				requestBody: criteria,
				responses: reply,
			},
		},
	});
	expect(warnings).toEqual([]);
	expect(operations).toContain(
		"\tsearchUsers: {\n\t\tmethod: 'post',\n\t\tpath: '/users/search',\n\t\thonoPath: '/users/search',\n\t\tqueryMethod: true,\n",
	);
	expect(operations).toContain('readonly queryMethod?: true;');
	expect(operations.match(/queryMethod: true/g)).toHaveLength(1);
	expect(`${operations}${types}`).toContain(
		'A `QUERY`, sent as a `POST`: it changes nothing, and its criteria are the body.',
	);
});

it('ignores it, with a warning, off a POST or with another value', async () => {
	const { operations, warnings } = await generated({
		'/users': {
			get: {
				operationId: 'listUsers',
				'x-nxgt-method': 'query',
				responses: reply,
			},
			post: {
				operationId: 'createUser',
				'x-nxgt-method': 'search',
				requestBody: criteria,
				responses: reply,
			},
		},
	});
	expect(operations).not.toContain('queryMethod: true');
	expect(
		warnings.map(({ code, message, pointer }) => ({ code, message, pointer })),
	).toEqual([
		{
			code: 'ignored',
			message: 'x-nxgt-method: query marks a POST as a QUERY, not a GET',
			pointer: '/paths/~1users/get/x-nxgt-method',
		},
		{
			code: 'ignored',
			message: 'x-nxgt-method takes only query: "search" is not it',
			pointer: '/paths/~1users/post/x-nxgt-method',
		},
	]);
});

it('ignores it, with a warning, on an OpenAPI 3.2 QUERY, which is one already', async () => {
	const { operations, warnings } = await generated(
		{
			'/users/search': {
				query: {
					operationId: 'searchUsers',
					'x-nxgt-method': 'query',
					requestBody: criteria,
					responses: reply,
				},
			},
		},
		'3.2.0',
	);
	expect(operations).toContain("method: 'query',");
	expect(operations).not.toContain('queryMethod: true');
	expect(warnings.map(({ code, message }) => ({ code, message }))).toEqual([
		{
			code: 'ignored',
			message: 'x-nxgt-method: query on a QUERY: the operation is one already',
		},
	]);
});

import { describe, expect, test } from 'bun:test';
import { alya } from '@alya/server';
import { z } from 'zod';
import { openApiPath, openapi, operationId } from './document';
import { docs } from './plugin';

const User = z.object({
	id: z.number(),
	name: z.string(),
	createdAt: z.date(),
});

const app = alya()
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number() }),
			query: z.object({ expand: z.string().optional() }),
			response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
			detail: { summary: 'One user', tags: ['users'] },
		},
		({ reply }) => reply(404, { error: 'not_found' }),
	)
	.post(
		'/users',
		{
			body: z.object({ name: z.string() }),
			response: { 201: User },
			detail: { operationId: 'createUser' },
		},
		({ reply, body }) =>
			reply(201, { id: 1, name: body.name, createdAt: new Date() }),
	)
	.delete('/files/*', ({ reply }) => reply(204));

const document = openapi(app, { info: { title: 'Users', version: '1.0.0' } });

describe('openapi', () => {
	test('paths are written the OpenAPI way', () => {
		expect(Object.keys(document.paths)).toEqual([
			'/users/{id}',
			'/users',
			'/files/{path}',
		]);
	});

	test('parameters come from the schemas, required as they say', () => {
		const get = document.paths['/users/{id}']?.get;
		expect(get?.parameters).toEqual([
			{ name: 'id', in: 'path', required: true, schema: { type: 'number' } },
			{
				name: 'expand',
				in: 'query',
				required: false,
				schema: { type: 'string' },
			},
		]);
		expect(get?.summary).toBe('One user');
		expect(get?.tags).toEqual(['users']);
	});

	test('replies are documented as they go over the wire: a Date is a string', () => {
		const ok = document.paths['/users/{id}']?.get?.responses['200'];
		expect(ok?.content?.['application/json']?.schema).toMatchObject({
			properties: { createdAt: { type: 'string', format: 'date-time' } },
		});
	});

	test('every validating route documents its 400, every route its 500', () => {
		const post = document.paths['/users']?.post;
		expect(Object.keys(post?.responses ?? {}).sort()).toEqual([
			'201',
			'400',
			'500',
		]);
		const remove = document.paths['/files/{path}']?.delete;
		expect(Object.keys(remove?.responses ?? {}).sort()).toEqual([
			'500',
			'default',
		]);
	});

	test('operation ids: the route’s own, or one from its method and path', () => {
		expect(document.paths['/users']?.post?.operationId).toBe('createUser');
		expect(document.paths['/users/{id}']?.get?.operationId).toBe(
			'getUsersById',
		);
		expect(operationId('DELETE', '/files/*')).toBe('deleteFilesPath');
		expect(openApiPath('/a/:b/*')).toBe('/a/{b}/{path}');
	});
});

describe('docs', () => {
	test('serves the document and a page, and leaves itself out of it', async () => {
		const served = alya().get('/ping', ({ reply }) => reply(200, 'pong'));
		served.use(docs(served, { info: { title: 'Ping', version: '1' } }));
		const json = await served.fetch(
			new Request('http://localhost/openapi.json'),
		);
		const body = await json.json();
		expect(Object.keys(body.paths)).toEqual(['/ping']);
		const page = await served.fetch(new Request('http://localhost/docs'));
		expect(page.headers.get('content-type')).toContain('text/html');
		expect(await page.text()).toContain('data-url="/openapi.json"');
	});
});

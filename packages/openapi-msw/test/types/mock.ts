/**
 * What the mock lets through, checked by `tsc`: every `@ts-expect-error`
 * below must be an error, and every other line must compile.
 */
import { createOpenApiMsw } from '../../src/index';
import { operations } from '../generated/operations.js';

const mock = createOpenApiMsw(operations);

export function examples(): void {
	mock.get('/items/{id}', ({ param, reply }) => {
		param.id satisfies number;
		return reply(200, { id: param.id, name: 'a' });
	});
	mock.post('/items', ({ json, form, reply }) =>
		reply(201, { id: 1, name: (json ?? form).name }),
	);
	mock.op('listItems', ({ query, header }) => {
		query.page satisfies number | undefined;
		header['x-trace'] satisfies string | undefined;
		return undefined;
	});
	mock.put('/items/{id}', async ({ body, reply }) => {
		body satisfies Blob;
		return reply(204);
	});
	mock.op('health', ({ reply }) => reply(204, { headers: { 'x-up': '1' } }));
	mock.op('createItem', ({ reply }) =>
		reply(400, { title: 'bad' }, { type: 'application/problem+json' }),
	);
	mock.op('noteItem', ({ text, reply }) => reply(200, text));

	// @ts-expect-error 201 is not a status getItem declares
	mock.get('/items/{id}', ({ reply }) => reply(201, { id: 1, name: 'a' }));
	// @ts-expect-error a 200 of getItem is an Item
	mock.get('/items/{id}', ({ reply }) => reply(200, { id: '1' }));
	// @ts-expect-error a 204 has no body
	mock.op('health', ({ reply }) => reply(204, { id: 1 }, {}));
	// @ts-expect-error no operation patches /items
	mock.patch('/items', () => undefined);
	// @ts-expect-error no operation is called nope
	mock.op('nope', () => undefined);
	// @ts-expect-error getItem takes no body
	mock.get('/items/{id}', ({ json }) => json);
	mock.op('createItem', ({ reply }) =>
		// @ts-expect-error a 201 of createItem is application/json
		reply(201, { id: 1, name: 'a' }, { type: 'text/plain' }),
	);
}

/**
 * What the mock lets through, checked by `tsc`: every `@ts-expect-error`
 * below must be an error, and every other line must compile.
 */
import { HttpResponse } from 'msw';
import { createOpenApiMsw } from '../../src/index';
import { operations } from '../generated/operations';

const mock = createOpenApiMsw(operations);

/** The handlers are MSW's, to list for `setupServer`. */
export const handlers = [
	mock.get('/items/{id}', ({ param, response }) => {
		param.id satisfies number;
		return response.ok({ id: param.id, name: 'a' });
	}),
	mock.get('/items/{id}', ({ response }) =>
		response(200).json({ id: 1, name: 'a' }),
	),
	mock.get('/items/{id}', ({ response }) =>
		response.notFound({ title: 'gone' }, { type: 'application/json' }),
	),
	mock.get('/items/{id}', ({ response }) =>
		response(404).json(
			{ title: 'gone' },
			{
				type: 'application/problem+json',
				headers: { 'x-trace': '1' },
				statusText: 'Gone',
			},
		),
	),
	mock.post('/items', ({ json, form, response }) =>
		response.created({ id: 1, name: (json ?? form).name }),
	),
	mock.op('listItems', ({ query, header }) => {
		query.page satisfies number | undefined;
		header['x-trace'] satisfies string | undefined;
		return undefined;
	}),
	mock.put('/items/{id}', async ({ body, response }) => {
		body satisfies Blob;
		return response.noContent();
	}),
	mock.op('health', ({ response }) =>
		response(204).body({ headers: { 'x-up': '1' } }),
	),
	mock.op('createItem', ({ response }) => response.badRequest({ title: 'x' })),
	mock.op('noteItem', ({ text, response }) => response(200).text(text)),
	mock.op('exportItems', ({ response }) =>
		response.ok('1,a', { type: 'text/csv' }),
	),
	mock.op('exportItems', ({ response }) => response(200).text('1,a')),
	mock.op('health', ({ response }) => response.untyped(HttpResponse.error())),
	mock.op('health', ({ response }) => response.passthrough()),
	mock.op('health', async ({ bypass, response }) =>
		response.untyped(await bypass()),
	),
];

export function refused(): void {
	mock.get('/items/{id}', ({ response }) =>
		// @ts-expect-error 201 is not a status getItem declares
		response(201),
	);
	mock.get('/items/{id}', ({ response }) =>
		// @ts-expect-error getItem declares no 201, so there is no preset
		response.created({ id: 1, name: 'a' }),
	);
	mock.get('/items/{id}', ({ response }) =>
		// @ts-expect-error a 200 of getItem is an Item
		response.ok({ id: '1' }),
	);
	mock.op('health', ({ response }) =>
		// @ts-expect-error a 204 has no body
		response.noContent({ id: 1 }, {}),
	);
	mock.get('/items/{id}', ({ response }) =>
		// @ts-expect-error a 200 of getItem is JSON: it has no text writer
		response(200).text('a'),
	);
	mock.get('/items/{id}', ({ response }) =>
		// @ts-expect-error the 404 declares two media types, so `type` is required
		response.notFound({ title: 'gone' }),
	);
	mock.op('createItem', ({ response }) =>
		// @ts-expect-error a 201 of createItem is application/json
		response.created({ id: 1, name: 'a' }, { type: 'text/plain' }),
	);
	// @ts-expect-error a Response of your own goes through response.untyped()
	mock.get('/items/{id}', () => HttpResponse.json({ id: 1, name: 'a' }));
	// @ts-expect-error no operation patches /items
	mock.patch('/items', () => undefined);
	// @ts-expect-error no operation is called nope
	mock.op('nope', () => undefined);
	// @ts-expect-error getItem takes no body
	mock.get('/items/{id}', ({ json }) => json);
}

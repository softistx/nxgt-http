/**
 * `readOnly` properties are the server's and `writeOnly` ones the client's:
 * the mock and the client it answers agree with the generated views. A body
 * needs no `id`, a reply needs no `password`.
 */
import { describe, expect, it } from 'bun:test';
import { createHttpClient, unwrap, ValidationError } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { getResponse, type RequestHandler } from 'msw';
import { operations } from '../../test/generated/read-only/operations';
import { createOpenApiMsw } from './create-openapi-msw';

const BASE = 'http://api.test';
const mock = createOpenApiMsw(operations, { baseUrl: BASE });

const clientOf = (handlers: RequestHandler[]) =>
	createOpenApiClient(
		createHttpClient({
			baseUrl: BASE,
			fetch: async (request) =>
				(await getResponse(handlers, request)) ??
				new Response('unhandled', { status: 599 }),
		}),
		operations,
	);

describe('readOnly and writeOnly views', () => {
	it('answers a user without its password, and receives it in the body', async () => {
		let received: unknown;
		const api = clientOf([
			mock.post('/users', ({ json, response }) => {
				received = json;
				return response.ok({ id: json.id, email: json.email });
			}),
		]);
		const reply = await api.post('/users', {
			json: { id: 'u1', email: 'a@b.c', password: 'hunter2' },
		});
		expect(unwrap(reply, 200)).toEqual({ id: 'u1', email: 'a@b.c' });
		expect(received).toMatchObject({ password: 'hunter2' });
	});

	it('refuses a user body without the password, as the server does', async () => {
		const api = clientOf([
			mock.post('/users', ({ response }) =>
				response.ok({ id: 'u1', email: 'a@b.c' }),
			),
		]);
		const error = await api
			.post('/users', { json: { id: 'u1', email: 'a@b.c' } as never })
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ValidationError);
	});

	it('takes a body without the readOnly id and answers with it', async () => {
		const api = clientOf([
			mock.post('/pets', ({ json, response }) => {
				expect(json).not.toHaveProperty('id');
				return response.ok({
					id: '3f2c1f0e-7d2a-4f7e-8f55-0c4d6a1b9e10',
					createdAt: '2024-04-01T10:00:00.000Z',
					name: json.name,
					status: 'available',
					birthday: '2020-01-01T00:00:00.000Z',
				});
			}),
		]);
		const reply = await api.post('/pets', { json: { name: 'Rex' } });
		expect(unwrap(reply, 200).name).toBe('Rex');
	});

	it('strips a password a reply carries anyway', async () => {
		const api = clientOf([
			mock.post('/users', ({ response }) =>
				response.ok({ id: 'u1', email: 'a@b.c', password: 'leak' } as never),
			),
		]);
		const reply = await api.post('/users', {
			json: { id: 'u1', email: 'a@b.c', password: 'hunter2' },
		});
		expect(reply.data).toEqual({ id: 'u1', email: 'a@b.c' });
	});
});

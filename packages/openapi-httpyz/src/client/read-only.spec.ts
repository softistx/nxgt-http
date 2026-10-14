/**
 * `readOnly` properties are the server's and `writeOnly` ones the client's:
 * a request is checked without the first, a reply without the second, against
 * the server generated from the same spec.
 */
import { describe, expect, it } from 'bun:test';
import { createHttpClient, unwrap, ValidationError } from '@nxgt/httpyz';
import { Hono } from 'hono';
import { createRoutes } from '../../test/generated/read-only/hono';
import { operations } from '../../test/generated/read-only/operations';
import type {
	ClientOperations,
	OperationsByRoute,
} from '../../test/generated/read-only/types';
import { createOpenApiClient } from '../index';

const app = new Hono();
createRoutes(app, { validateResponses: true })
	.post('/users', (c) => {
		const { password: _password, ...user } = c.req.valid('json');
		return c.json(user, 200);
	})
	.post('/pets', (c) => {
		expect(c.req.valid('json')).not.toHaveProperty('id');
		return c.json(
			{
				id: '3f2c1f0e-7d2a-4f7e-8f55-0c4d6a1b9e10',
				createdAt: '2024-04-01T10:00:00.000Z',
				name: c.req.valid('json').name,
				status: 'available' as const,
				birthday: '2020-01-01T00:00:00.000Z',
			},
			200,
		);
	});

const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
	createHttpClient({
		baseUrl: 'http://api.test',
		fetch: async (request) => app.fetch(request),
	}),
	operations,
);

describe('readOnly and writeOnly views', () => {
	it('sends a body without readOnly properties and reads the reply that has them', async () => {
		const reply = await api.post('/pets', { json: { name: 'Rex' } });
		expect(unwrap(reply, 200).id).toBe('3f2c1f0e-7d2a-4f7e-8f55-0c4d6a1b9e10');
	});

	it('requires writeOnly properties in the body, and reads a reply without them', async () => {
		const reply = await api.post('/users', {
			json: { id: 'u1', email: 'a@b.c', password: 'hunter2' },
		});
		expect(unwrap(reply, 200)).toEqual({ id: 'u1', email: 'a@b.c' });
		const error = await api
			.post('/users', { json: { id: 'u1', email: 'a@b.c' } as never })
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ValidationError);
	});

	it('strips a password a reply carries anyway', async () => {
		// A server that does not check its replies and leaks the password.
		const leaky = new Hono();
		createRoutes(leaky).post('/users', (c) =>
			c.json({ ...c.req.valid('json') } as never, 200),
		);
		const probe = createOpenApiClient<ClientOperations, OperationsByRoute>(
			createHttpClient({
				baseUrl: 'http://api.test',
				fetch: async (request) => leaky.fetch(request),
			}),
			operations,
		);
		const reply = await probe.post('/users', {
			json: { id: 'u1', email: 'a@b.c', password: 'hunter2' },
		});
		expect(reply.data).toEqual({ id: 'u1', email: 'a@b.c' });
	});
});

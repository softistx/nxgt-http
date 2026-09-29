/**
 * A spec authored in TypeSpec, served by a real Hono app: the `typespec`
 * fixture of `@nxgt/openapi-codegen`, compiled from its `main.tsp` to
 * OpenAPI 3.1, then generated. What TypeSpec emits — a discriminated union,
 * a `Record<int32>`, a nullable `utcDateTime`, a `Create<Pet>` body, a query
 * default, a merge-patch body — is read and checked as it says.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { createRoutes } from '../test/generated/typespec/hono';
import type { CreatePet, Pet } from '../test/generated/typespec/types';

const created: Pet = {
	id: '6f1c2a3e-8b4d-4c5e-9f60-1a2b3c4d5e6f',
	name: 'Rex',
	status: 'available',
	species: { kind: 'dog', barks: true },
	vaccines: { rabies: 1 },
	adoptedAt: null,
	createdAt: '2026-09-28T10:00:00Z',
	serial: 9_007_199_254_740_991,
};

function app(): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		.get('/pets', (c) =>
			c.json(
				{ items: [], nextCursor: c.req.valid('query').limit.toString() },
				200,
			),
		)
		.post('/pets', (c) => {
			const body = c.req.valid('json');
			c.header('location', `/pets/${created.id}`);
			return c.json({ ...created, ...body }, 201);
		})
		.patch('/pets/{petId}', (c) => {
			// A merge patch, for the properties the spec below sends: `null` removes one.
			const { name, tags } = c.req.valid('json');
			const pet: Pet = { ...created };
			if (name !== undefined) pet.name = name;
			if (tags === null) delete pet.tags;
			else if (tags !== undefined) pet.tags = tags;
			return c.json(pet, 200);
		});
	return hono;
}

const send = (method: string, path: string, body: unknown) =>
	app().request(path, {
		method,
		body: JSON.stringify(body),
		headers: {
			'content-type':
				method === 'PATCH'
					? 'application/merge-patch+json'
					: 'application/json',
		},
	});

describe('a spec authored in TypeSpec', () => {
	it('creates from Create<Pet>, which leaves out the read-only properties', async () => {
		const pet: CreatePet = {
			name: 'Tom',
			status: 'pending',
			species: { kind: 'cat', lives: 9 },
			adoptedAt: '2026-09-01T08:00:00Z',
		};
		const reply = await send('POST', '/pets', pet);
		expect(reply.status).toBe(201);
		expect(reply.headers.get('location')).toBe(`/pets/${created.id}`);
		expect(await reply.json()).toMatchObject(pet);
	});

	it('refuses a body its discriminated union, record or constraints refuse', async () => {
		const pet = {
			name: 'Tom',
			status: 'pending',
			species: { kind: 'cat', lives: 9 },
			adoptedAt: null,
		};
		for (const wrong of [
			{ ...pet, species: { kind: 'cat', barks: true } },
			{ ...pet, species: { kind: 'bird' } },
			{ ...pet, vaccines: { rabies: 'yes' } },
			{ ...pet, name: '' },
			{ ...pet, status: 'sold' },
		]) {
			expect((await send('POST', '/pets', wrong)).status).toBe(400);
		}
	});

	it('fills in a query default, and reads a merge-patch body', async () => {
		const list = await app().request('/pets');
		expect(await list.json()).toEqual({ items: [], nextCursor: '20' });
		const patched = await send('PATCH', `/pets/${created.id}`, {
			name: 'Max',
			tags: null,
		});
		expect(patched.status).toBe(200);
		const pet = await patched.json();
		expect(pet).toMatchObject({ name: 'Max' });
		expect(pet).not.toHaveProperty('tags');
	});
});

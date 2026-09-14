/** `ok()` and `unwrap()`: a reply's data, or a `ReplyStatusError`. */
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { createHttpClient, ok, ReplyStatusError, unwrap } from '../index';

const Item = z.object({ id: z.int() });
const Problem = z.object({ title: z.string() });
const responses = { 200: Item, 201: Item, 404: Problem };

const http = createHttpClient({
	baseUrl: 'http://api.test',
	fetch: async (request) => {
		const id = new URL(request.url).pathname.split('/').pop();
		if (id === '404')
			return Response.json({ title: 'missing' }, { status: 404 });
		return Response.json(
			{ id: Number(id) },
			{ status: id === '2' ? 201 : 200 },
		);
	},
});

describe('ok', () => {
	it("returns any 2xx reply's data, narrowed to the success statuses", async () => {
		const item: { id: number } = ok(
			await http.get('/items/{id}', { param: { id: 1 }, responses }),
		);
		expect(item).toEqual({ id: 1 });
		expect(
			ok(await http.get('/items/{id}', { param: { id: 2 }, responses })),
		).toEqual({ id: 2 });
	});

	it('throws a ReplyStatusError for any other reply, with its data', async () => {
		const reply = await http.get('/items/{id}', {
			param: { id: 404 },
			responses,
		});
		const caught = (() => {
			try {
				ok(reply);
			} catch (error) {
				return error;
			}
		})();
		expect(caught).toBeInstanceOf(ReplyStatusError);
		expect((caught as ReplyStatusError).message).toBe(
			'Expected a 2xx reply, got 404',
		);
		expect((caught as ReplyStatusError).data).toEqual({ title: 'missing' });
	});

	it('takes any 2xx reply of a call that declares none', async () => {
		const data: unknown = ok(
			await http.get('/items/{id}', { param: { id: 3 } }),
		);
		expect(data).toEqual({ id: 3 });
	});
});

describe('unwrap', () => {
	it('names the statuses it wanted', async () => {
		const reply = await http.get('/items/{id}', {
			param: { id: 404 },
			responses,
		});
		expect(() => unwrap(reply, 200, 201)).toThrow(
			'Expected a 200 or 201 reply, got 404',
		);
	});
});

/** Types only: never run. */
async function types() {
	const reply = await http.get('/items/{id}', { param: { id: 1 }, responses });
	// @ts-expect-error: a 2xx reply's data is an Item, never the 404's Problem
	const _problem: { title: string } = ok(reply);
}
void types;

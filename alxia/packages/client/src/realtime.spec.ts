import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';
import { client } from './client';

const Tick = z.object({ n: z.number(), at: z.date() });

const app = alxia()
	.get(
		'/ticks',
		{
			query: z.object({ count: z.coerce.number().int().max(10) }),
			response: { 200: eventStream(Tick) },
		},
		({ query, reply }) =>
			reply(
				200,
				(async function* () {
					for (let n = 1; n <= query.count; n++) {
						yield { n, at: new Date(0) };
					}
				})(),
			),
	)
	.get(
		'/me',
		{ cookies: z.object({ session: z.string() }) },
		({ cookies, reply }) => reply(200, cookies.session),
	)
	.ws(
		'/echo/:room',
		{
			message: z.object({ text: z.string() }),
			send: z.object({ room: z.string(), text: z.string() }),
		},
		{
			message: (socket, message) =>
				socket.send({ room: socket.data.params.room, text: message.text }),
		},
	);

describe('server-sent events', () => {
	test('the data is an async iterable of the events, as they cross the wire', async () => {
		const result = await client(app).get('/ticks', { query: { count: 3 } });
		if (result.status !== 200) throw new Error(`got ${result.status}`);
		expectTypeOf(result.data).toEqualTypeOf<
			AsyncIterable<{ n: number; at: string }>
		>();
		const ticks: number[] = [];
		for await (const tick of result.data) ticks.push(tick.n);
		expect(ticks).toEqual([1, 2, 3]);
	});
});

describe('cookies', () => {
	test('typed cookies are sent as the cookie header', async () => {
		const result = await client(app).get('/me', {
			cookies: { session: 'abc' },
		});
		expect(result.data).toBe('abc');
	});
});

describe('websockets', () => {
	test('a typed socket sends and receives JSON', async () => {
		const server = app.listen({ port: 0 });
		try {
			const api = client<typeof app>(server.url);
			const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
			socket.send({ text: 'hi' });
			const iterator = socket[Symbol.asyncIterator]();
			const first = await iterator.next();
			expectTypeOf<Parameters<typeof socket.send>[0]>().toEqualTypeOf<{
				text: string;
			}>();
			expect(first.value).toEqual({ room: 'lobby', text: 'hi' });
			socket.close();
		} finally {
			await app.stop(true);
		}
	});

	test('in process, a socket is refused: it needs a server', () => {
		expect(() =>
			client(app).ws('/echo/:room', { params: { room: 'a' } }),
		).toThrow('needs a server');
	});
});

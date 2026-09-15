import { describe, expect, test } from 'bun:test';
import { apiHttpOptions, type FetchApp, serveUnder } from './index';

/** An app that answers with what it received. */
const echo: FetchApp<{ tag: string }> = {
	fetch: async (request, env) =>
		Response.json({
			url: request.url,
			method: request.method,
			body: request.body ? await request.text() : null,
			env,
		}),
};

describe('serveUnder', () => {
	test('takes the prefix off, keeps the query', async () => {
		const reply = await serveUnder(
			echo,
			'/api',
			new Request('http://host/api/items/7?full=1'),
		);
		expect((await reply.json()).url).toBe('http://host/items/7?full=1');
	});

	test('reaches the app as / for the prefix alone', async () => {
		const reply = await serveUnder(
			echo,
			'/api',
			new Request('http://host/api'),
		);
		expect((await reply.json()).url).toBe('http://host/');
	});

	test('leaves a path that only starts like the prefix', async () => {
		const reply = await serveUnder(
			echo,
			'/api',
			new Request('http://host/apis/1'),
		);
		expect((await reply.json()).url).toBe('http://host/apis/1');
	});

	test('passes the method, the body and the env on', async () => {
		const reply = await serveUnder(
			echo,
			'/api',
			new Request('http://host/api/items', { method: 'POST', body: '{"a":1}' }),
			{ tag: 'event' },
		);
		expect(await reply.json()).toEqual({
			url: 'http://host/items',
			method: 'POST',
			body: '{"a":1}',
			env: { tag: 'event' },
		});
	});
});

describe('apiHttpOptions', () => {
	test('sends every call to baseUrl when there is one', () => {
		const options = apiHttpOptions({
			prefix: '/api',
			baseUrl: 'https://api.example.com/v1',
			event: { fetch: async () => new Response() },
		});
		expect(options).toEqual({ baseUrl: 'https://api.example.com/v1' });
	});

	test('calls through the request event on the server, headers as an object', async () => {
		const calls: { input: string; init: RequestInit | undefined }[] = [];
		const options = apiHttpOptions({
			prefix: '/api',
			event: {
				fetch: async (input, init) => {
					calls.push({ input, init });
					return new Response(init?.body);
				},
			},
		});
		expect(options.baseUrl).toBe('http://nuxt.local/api');
		const reply = await options.fetch?.(
			new Request('http://nuxt.local/api/items?full=1', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{"name":"a"}',
			}),
		);
		expect(await reply?.text()).toBe('{"name":"a"}');
		expect(calls[0]?.input).toBe('/api/items?full=1');
		expect(calls[0]?.init?.method).toBe('POST');
		expect(calls[0]?.init?.headers).toEqual({
			'content-type': 'application/json',
		});
	});

	test('calls the page origin under the prefix in the browser', () => {
		expect(
			apiHttpOptions({ prefix: '/api', origin: 'https://shop.example.com' }),
		).toEqual({ baseUrl: 'https://shop.example.com/api' });
	});

	test('throws with neither an event nor an origin', () => {
		expect(() => apiHttpOptions({ prefix: '/api' })).toThrow(
			'no request event and no page origin',
		);
	});
});

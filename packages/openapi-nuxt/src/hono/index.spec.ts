import { describe, expect, test } from 'bun:test';
import type { H3Event } from 'h3';
import { createHonoApp } from './index';

describe('createHonoApp', () => {
	test('hands the app the event the module passes as env', async () => {
		const app = createHonoApp();
		app.get('/whoami', (c) => c.json({ path: c.env.event.path }));
		const event = { path: '/api/whoami' } as H3Event;
		const reply = await app.fetch(new Request('http://host/whoami'), {
			event,
		});
		expect(await reply.json()).toEqual({ path: '/api/whoami' });
	});

	test("passes Hono's options on", async () => {
		const app = createHonoApp({ strict: false });
		app.get('/items', (c) => c.text('items'));
		const reply = await app.fetch(new Request('http://host/items/'), {
			event: {} as H3Event,
		});
		expect(await reply.text()).toBe('items');
	});

	test('adds the Env it is given to the event', async () => {
		const app = createHonoApp<{ Variables: { user: string } }>();
		app.use(async (c, next) => {
			c.set('user', 'ada');
			await next();
		});
		app.get('/', (c) => c.text(c.get('user')));
		const reply = await app.fetch(new Request('http://host/'), {
			event: {} as H3Event,
		});
		expect(await reply.text()).toBe('ada');
	});
});

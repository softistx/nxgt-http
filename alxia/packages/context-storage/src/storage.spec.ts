import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext } from '@alxia/core';
import { z } from 'zod';
import {
	ContextStorageError,
	contextStorage,
	getContext,
	getRequestContext,
	runWithContext,
	tryGetContext,
} from './storage';

const base = alxia()
	.decorate({ greeting: 'hello' })
	.derive(({ request }) => ({
		user: request.headers.get('x-user') ?? 'anonymous',
	}));

const requestContext = contextStorage<typeof base>();

/** A service, three calls down: no context passed. */
async function greet(): Promise<string> {
	await Bun.sleep(Math.random() * 10);
	await new Promise((resolve) => setTimeout(resolve, 1));
	const { greeting, user, set } = requestContext.get();
	expectTypeOf(user).toBeString();
	set.headers.set('x-greeted', user);
	return `${greeting} ${user}`;
}

const seenOnResponse: (string | undefined)[] = [];

const app = base
	.get('/before', ({ reply }) =>
		reply(200, tryGetContext() === undefined ? 'none' : 'some'),
	)
	.use(requestContext)
	.onResponse(() => {
		seenOnResponse.push(getRequestContext().route);
	})
	.get(
		'/greet/:id',
		{ params: z.object({ id: z.coerce.number() }) },
		async ({ reply }) =>
			reply(200, {
				text: await greet(),
				id: getContext<{ params: { id: number } }>().params.id,
			}),
	);

describe('contextStorage', () => {
	test('a service reads the context of its request, typed by the app', async () => {
		const response = await app.request('/greet/7', {
			headers: { 'x-user': 'ada' },
		});
		expect(await response.json()).toEqual({ text: 'hello ada', id: 7 });
		expect(response.headers.get('x-greeted')).toBe('ada');
	});

	test('concurrent requests never see each other', async () => {
		const users = Array.from({ length: 20 }, (_, index) => `user-${index}`);
		const answers = await Promise.all(
			users.map(
				async (user) =>
					(
						await (
							await app.request('/greet/1', { headers: { 'x-user': user } })
						).json()
					).text,
			),
		);
		expect(answers).toEqual(users.map((user) => `hello ${user}`));
	});

	test('global hooks read the request context, a 404 included', async () => {
		seenOnResponse.length = 0;
		await app.request('/greet/1');
		await app.request('/nowhere');
		expect(seenOnResponse).toEqual(['/greet/:id', undefined]);
	});

	test('outside a request, or before the plugin: a typed refusal, or undefined', async () => {
		expect(tryGetContext()).toBeUndefined();
		expect(() => getContext()).toThrow(ContextStorageError);
		try {
			getContext();
		} catch (error) {
			expect((error as ContextStorageError).code).toBe('OUTSIDE_REQUEST');
		}
		expect(await (await app.request('/before')).text()).toBe('none');
	});

	test('runWithContext, for a job or a test', async () => {
		const fake = {
			user: 'job',
			greeting: 'hi',
			set: { headers: new Headers() },
		} as unknown as BaseContext;
		expect(await runWithContext(fake, greet)).toBe('hi job');
	});
});

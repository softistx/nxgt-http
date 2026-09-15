/**
 * The composables in a Vue app of their own, without Nuxt: the module's
 * e2e spec covers them in a rendered page.
 */
import { describe, expect, test } from 'bun:test';
import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createApp, effectScope, nextTick, ref } from 'vue';
import { operations } from '../../test/generated/operations';
import { apiQueryComposables } from './index';

const calls: string[] = [];
const api = createOpenApiClient(
	createHttpClient({
		baseUrl: 'http://api.test',
		fetch: async (request) => {
			const { pathname } = new URL(request.url);
			calls.push(`${request.method} ${pathname}`);
			const created = request.method === 'POST';
			const id = created ? 1 : Number(pathname.split('/')[2]);
			return Response.json(
				{
					id,
					name: created ? (await request.json()).name : `Item ${id}`,
					cookie: request.headers.get('x-trace'),
					path: pathname,
				},
				{ status: created ? 201 : 200 },
			);
		},
	}),
	operations,
);

const { useApiQueries, useApiQuery, useApiMutation } = apiQueryComposables(
	() => api,
);

/** Runs `setup` as a component's would: in an app with Vue Query, in a scope. */
function inApp<T>(setup: () => T): T {
	const app = createApp({ render: () => null });
	app.use(VueQueryPlugin, { queryClient: new QueryClient() });
	return app.runWithContext(() => effectScope().run(setup) as T);
}

describe('useApiQuery', () => {
	test('fetches the operation, following the refs of its input', async () => {
		const id = ref(7);
		const query = inApp(() =>
			useApiQuery('get', '/items/{id}', { param: { id } }),
		);
		await query.suspense();
		expect(query.data.value).toEqual({
			id: 7,
			name: 'Item 7',
			cookie: null,
			path: '/items/7',
		});
		id.value = 8;
		await nextTick();
		expect((await query.suspense()).data).toEqual({
			id: 8,
			name: 'Item 8',
			cookie: null,
			path: '/items/8',
		});
	});

	test("sends the call with the options' init", async () => {
		const query = inApp(() =>
			useApiQuery(
				'get',
				'/items/{id}',
				{ param: { id: 3 } },
				{ init: { headers: { 'x-trace': 'q' } } },
			),
		);
		expect((await query.suspense()).data?.cookie).toBe('q');
	});

	test('keys it as useApiQueries() does', () => {
		const queries = inApp(() => useApiQueries());
		const options = queries.queryOptions('get', '/items/{id}', {
			param: { id: 3 },
		});
		expect([...options.queryKey]).toEqual([
			...queries.queryKey('get', '/items/{id}', { param: { id: 3 } }),
		]);
	});
});

describe('useApiMutation', () => {
	test("sends mutate()'s input, with the init of each call", async () => {
		const mutation = inApp(() =>
			useApiMutation('post', '/items', {
				init: { headers: { 'x-trace': 'm' } },
			}),
		);
		expect(await mutation.mutateAsync({ json: { name: 'new' } })).toEqual({
			id: 1,
			name: 'new',
			cookie: 'm',
			path: '/items',
		});
		expect(calls).toContain('POST /items');
	});
});

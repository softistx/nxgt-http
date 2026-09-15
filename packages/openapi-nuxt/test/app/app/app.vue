<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';

const api = useApi();
const { data } = await useAsyncData('fixture', async () => {
	const item = await api.get('/items/{id}', { param: { id: 7 } });
	const created = await api.post('/items', { json: { name: 'posted' } });
	return { item: item.data, created: created.data };
});
// No key: Nuxt's compiler appends one, as it does for useAsyncData.
const { data: reply } = await useApiData((api) =>
	api.get('/items/{id}', { param: { id: 8 } }),
);
const { data: named } = await useApiData('named', async (api, { signal }) => {
	const created = await api.post(
		'/items',
		{ json: { name: 'named' } },
		{ signal },
	);
	return created.status === 201 ? created.data.name : null;
});
// TanStack Query: fetched during SSR, its cache handed to the browser.
const id = ref(9);
const { data: queried, suspense } = useApiQuery('get', '/items/{id}', {
	param: { id },
});
const queries = useApiQueries();
const { data: listed, suspense: listedSuspense } = useQuery(
	queries.queryOptions('get', '/items/{id}', { param: { id: 10 } }),
);
await Promise.all([suspense(), listedSuspense()]);
</script>

<template>
	<pre id="out">{{ JSON.stringify(data) }}</pre>
	<pre id="reply">{{ JSON.stringify(reply) }}</pre>
	<pre id="named">{{ JSON.stringify(named) }}</pre>
	<pre id="query">{{ JSON.stringify(queried) }}</pre>
	<pre id="queries">{{ JSON.stringify(listed) }}</pre>
</template>

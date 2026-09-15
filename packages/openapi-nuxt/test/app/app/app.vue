<script setup lang="ts">
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
</script>

<template>
	<pre id="out">{{ JSON.stringify(data) }}</pre>
	<pre id="reply">{{ JSON.stringify(reply) }}</pre>
	<pre id="named">{{ JSON.stringify(named) }}</pre>
</template>

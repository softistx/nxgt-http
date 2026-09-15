<script setup lang="ts">
const api = useApi();
const { data } = await useAsyncData('fixture', async () => {
	const item = await api.get('/items/{id}', { param: { id: 7 } });
	const created = await api.post('/items', { json: { name: 'posted' } });
	return { item: item.data, created: created.data };
});
</script>

<template>
	<pre id="out">{{ JSON.stringify(data) }}</pre>
</template>

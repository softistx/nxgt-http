// Types only: nothing imports this, and the package's `typecheck` checks it
// with the app's own tsconfig, after `nuxi prepare`.
export async function typed(): Promise<string> {
	const api = useApi();
	const reply = await api.get('/items/{id}', { param: { id: 7 } });
	// The spec's 400 is a reply too, until the status says otherwise.
	// @ts-expect-error: `cookie` is not on the 400's body
	reply.data.cookie;
	if (reply.status !== 200) throw new Error('not found');
	const cookie: string | null = reply.data.cookie;
	await api.post('/items', { json: { name: 'new' } });
	// @ts-expect-error: the id is an integer
	await api.get('/items/{id}', { param: { id: '7' } });
	// @ts-expect-error: no such path
	await api.get('/nothing');
	// @ts-expect-error: /items has only a POST
	await api.get('/items');
	// @ts-expect-error: a name is required
	await api.post('/items', { json: {} });
	return reply.data.name + cookie;
}

export async function typedData(): Promise<string | undefined> {
	const { data } = await useApiData((api, { signal }) =>
		api.get('/items/{id}', { param: { id: 7 } }, { signal }),
	);
	const reply = data.value;
	// @ts-expect-error: the payload carries no Response
	reply?.response;
	if (reply?.status !== 200) return undefined;
	const name: string = reply.data.name;
	const { data: named } = await useApiData(
		'named',
		async (api) => (await api.post('/items', { json: { name } })).status,
		{ default: () => 0 as const },
	);
	named.value satisfies 201 | 400 | 0;
	// @ts-expect-error: the handler receives the client, bound to the spec
	await useApiData((api) => api.get('/nothing'));
	return name;
}

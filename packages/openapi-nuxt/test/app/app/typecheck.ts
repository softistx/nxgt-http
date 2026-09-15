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

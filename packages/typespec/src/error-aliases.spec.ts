/**
 * The error aliases of `lib/errors.tsp`: each verb's operation in
 * `test/programs/` declares the replies its alias names, by status.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';
import { getAllHttpServices } from '@typespec/http';

it('names the errors of each verb', async () => {
	const main = fileURLToPath(
		new URL('../test/programs/error-aliases.tsp', import.meta.url),
	);
	const program = await compile(NodeHost, main, { noEmit: true });
	expect(program.diagnostics).toEqual([]);
	const [[service]] = getAllHttpServices(program);
	const statuses = Object.fromEntries(
		(service?.operations ?? []).map(({ operation, responses }) => [
			operation.name,
			responses
				.map(({ statusCodes }) => statusCodes)
				.filter((code) => typeof code === 'number' && code >= 400),
		]),
	);
	expect(statuses).toEqual({
		list: [400],
		get: [404],
		create: [400, 409],
		update: [400, 404, 409],
		delete: [404],
		me: [401, 403],
	});
});

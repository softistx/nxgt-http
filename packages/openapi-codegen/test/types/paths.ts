/**
 * `paths.gen.ts` has the shape openapi-typescript prints, so openapi-fetch
 * types a client from it with nothing in between. Type-checked, never run.
 */
import createClient from 'openapi-fetch';
import type { paths } from '../generated/kitchen-sink/paths.gen.js';
import type { Pet } from '../generated/kitchen-sink/types.gen.js';

const requestId = '3f1c2a4e-8b7d-4c1e-9a2b-1c2d3e4f5a6b';

export async function examples(): Promise<Pet | undefined> {
	const client = createClient<paths>({ baseUrl: 'https://pets.example' });
	await client.PUT('/pets/{petId}/tags', {
		params: { path: { petId: 1 } },
		body: ['calm'],
	});
	await client.GET('/pets/{petId}', {
		params: {
			// @ts-expect-error petId is a number
			path: { petId: '1' },
			header: { 'X-Request-Id': requestId },
		},
	});
	await client.GET('/pets/{petId}', {
		// @ts-expect-error the X-Request-Id header is required
		params: { path: { petId: 1 } },
	});
	await client.PUT('/pets/{petId}/tags', {
		params: { path: { petId: 1 } },
		// @ts-expect-error the body is a list of strings
		body: [1],
	});
	// @ts-expect-error no such path
	await client.GET('/nope');
	// @ts-expect-error /pets/{petId}/tags has no DELETE
	await client.DELETE('/pets/{petId}/tags');
	const { data } = await client.GET('/pets/{petId}', {
		params: {
			path: { petId: 1 },
			query: { ids: [1, 2], verbose: true, level: 'max' },
			header: { 'X-Request-Id': requestId },
		},
	});
	return data;
}

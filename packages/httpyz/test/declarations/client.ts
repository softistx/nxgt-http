// Every part of the client an app exports, behind exported functions whose
// return types are inferred: a declaration build must be able to name each
// one through `@nxgt/httpyz` alone (TS2883 otherwise).
import { cache, createHttpClient, ok, unwrap } from '@nxgt/httpyz';

const Employee = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value: unknown) => ({
			value: value as { id: number; name: string },
		}),
	},
} as const;

const Problem = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value: unknown) => ({ value: value as { title: string } }),
	},
} as const;

export const replies = cache({ ttl: 30_000 });

export const http = createHttpClient({
	baseUrl: 'https://api.example.com',
	retry: 2,
	use: [replies],
});

export const page = http.group();

export function employee(id: number) {
	return http.get('/employees/{id}', {
		param: { id },
		responses: { 200: Employee, 404: Problem },
	});
}

export function untyped() {
	return http.request('post', '/employees', { json: { name: 'Ada' } });
}

export function csv() {
	return page.get('/export', {
		responses: { 200: { 'text/csv': null }, 204: null },
	});
}

export async function unwrapped(id: number) {
	return unwrap(await employee(id), 200);
}

export async function succeeded(id: number) {
	return ok(await employee(id));
}

export function feed(id: number) {
	return http.events('/employees/{id}/events', {
		param: { id },
		events: { updated: Employee, ping: null },
	});
}

export function raw() {
	return http.events('/events');
}

export function rows() {
	return http.lines('/export', { item: Employee });
}

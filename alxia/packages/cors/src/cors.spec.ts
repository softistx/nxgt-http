import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cors } from './cors';

const route = alxia().get('/data', ({ reply }) => reply(200, { ok: true }));

const preflight = (origin: string, headers: Record<string, string> = {}) =>
	new Request('http://localhost/data', {
		method: 'OPTIONS',
		headers: {
			origin,
			'access-control-request-method': 'POST',
			...headers,
		},
	});

describe('cors', () => {
	test('every origin by default: a star, a preflight answered', async () => {
		const app = alxia().use(cors()).use(route);
		const response = await app.request('/data', {
			headers: { origin: 'https://a.example' },
		});
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
		const answered = await app.fetch(
			preflight('https://a.example', {
				'access-control-request-headers': 'x-token',
			}),
		);
		expect(answered.status).toBe(204);
		expect(answered.headers.get('access-control-allow-headers')).toBe(
			'x-token',
		);
		expect(answered.headers.get('access-control-allow-methods')).toContain(
			'POST',
		);
	});

	test('a list of origins: the allowed one echoed, another refused', async () => {
		const app = alxia()
			.use(
				cors({
					origin: ['https://a.example', /\.b\.example$/],
					credentials: true,
					exposedHeaders: ['x-total'],
					maxAge: 600,
				}),
			)
			.use(route);
		const allowed = await app.request('/data', {
			headers: { origin: 'https://x.b.example' },
		});
		expect(allowed.headers.get('access-control-allow-origin')).toBe(
			'https://x.b.example',
		);
		expect(allowed.headers.get('access-control-allow-credentials')).toBe(
			'true',
		);
		expect(allowed.headers.get('access-control-expose-headers')).toBe(
			'x-total',
		);
		expect(allowed.headers.get('vary')).toBe('Origin');

		const refused = await app.request('/data', {
			headers: { origin: 'https://evil.example' },
		});
		expect(refused.headers.get('access-control-allow-origin')).toBeNull();
		const refusedPreflight = await app.fetch(preflight('https://evil.example'));
		expect(
			refusedPreflight.headers.get('access-control-allow-origin'),
		).toBeNull();
		const okPreflight = await app.fetch(preflight('https://a.example'));
		expect(okPreflight.headers.get('access-control-max-age')).toBe('600');
	});

	test('credentials with every origin echo the origin, never a star', async () => {
		const app = alxia()
			.use(cors({ credentials: true }))
			.use(route);
		const response = await app.request('/data', {
			headers: { origin: 'https://c.example' },
		});
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'https://c.example',
		);
	});
});

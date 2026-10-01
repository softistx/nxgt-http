import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { secureHeaders } from './secure-headers';

describe('secureHeaders', () => {
	test('sets the defaults, keeps what a route set, takes options', async () => {
		const app = alxia()
			.use(
				secureHeaders({ referrerPolicy: 'same-origin', xFrameOptions: false }),
			)
			.get('/page', ({ reply }) =>
				reply(200, '<p>hi</p>', {
					headers: {
						'content-security-policy': "default-src 'self'",
						'x-powered-by': 'php',
					},
				}),
			);
		const response = await app.request('/page');
		expect(response.headers.get('content-security-policy')).toBe(
			"default-src 'self'",
		);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('referrer-policy')).toBe('same-origin');
		expect(response.headers.get('x-frame-options')).toBeNull();
		expect(response.headers.get('x-powered-by')).toBeNull();
		expect(response.headers.get('strict-transport-security')).toContain(
			'max-age',
		);
	});

	test('a 404 is covered too', async () => {
		const app = alxia().use(secureHeaders());
		const response = await app.request('/nope');
		expect(response.status).toBe(404);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});

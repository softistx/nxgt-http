import { describe, expect, test } from 'bun:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { alxia } from '@alxia/core';
import { compress, negotiate } from './compress';

const big = 'alxia '.repeat(1000);
const app = alxia()
	.use(compress())
	.get('/big', ({ reply }) => reply(200, { text: big }))
	.get('/small', ({ reply }) => reply(200, 'tiny'))
	.get('/ticks', ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield big;
			})(),
		),
	);

const get = (path: string, encoding: string) =>
	app.request(path, { headers: { 'accept-encoding': encoding } });

describe('compress', () => {
	test('gzip and Brotli, negotiated', async () => {
		const gzip = await get('/big', 'gzip');
		expect(gzip.headers.get('content-encoding')).toBe('gzip');
		expect(gzip.headers.get('vary')).toBe('Accept-Encoding');
		const raw = new Uint8Array(await gzip.arrayBuffer());
		expect(JSON.parse(gunzipSync(raw).toString()).text).toBe(big);

		const br = await get('/big', 'gzip;q=0.5, br');
		expect(br.headers.get('content-encoding')).toBe('br');
		const bytes = new Uint8Array(await br.arrayBuffer());
		expect(JSON.parse(brotliDecompressSync(bytes).toString()).text).toBe(big);
	});

	test('a small body, an event stream, or no accepted encoding: left alone', async () => {
		expect(
			(await get('/small', 'gzip')).headers.get('content-encoding'),
		).toBeNull();
		expect(
			(await get('/ticks', 'gzip')).headers.get('content-encoding'),
		).toBeNull();
		expect(
			(await get('/big', 'identity')).headers.get('content-encoding'),
		).toBeNull();
	});

	test('negotiate', () => {
		expect(negotiate('gzip, deflate, br, zstd', ['zstd', 'br', 'gzip'])).toBe(
			'zstd',
		);
		expect(negotiate('gzip;q=1, br;q=0.8', ['br', 'gzip'])).toBe('gzip');
		expect(negotiate('*', ['gzip'])).toBe('gzip');
		expect(negotiate('br;q=0', ['br'])).toBeUndefined();
		expect(negotiate(null, ['gzip'])).toBeUndefined();
	});
});

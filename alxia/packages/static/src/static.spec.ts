import {
	afterAll,
	beforeAll,
	describe,
	expect,
	expectTypeOf,
	test,
} from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia, type RoutesOf } from '@alxia/core';
import { serveStatic } from './static';

let root: string;
beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'alxia-static-'));
	await writeFile(join(root, 'hello.txt'), 'hello');
	await writeFile(join(root, 'index.html'), '<h1>app</h1>');
	await writeFile(join(root, '.env'), 'SECRET=1');
	await mkdir(join(root, 'docs'));
	await writeFile(join(root, 'docs', 'index.html'), '<h1>docs</h1>');
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('serveStatic', () => {
	const make = (fallback?: string) =>
		alxia().use(
			serveStatic({
				root,
				prefix: '/files',
				maxAge: 60,
				...(fallback === undefined ? {} : { fallback }),
			}),
		);

	test('serves a file with its type, ETag and cache headers', async () => {
		const response = await make().request('/files/hello.txt');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('hello');
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(response.headers.get('cache-control')).toBe('public, max-age=60');
		expect(response.headers.get('etag')).toStartWith('W/"');
	});

	test('a directory serves its index', async () => {
		expect(await (await make().request('/files/docs/')).text()).toBe(
			'<h1>docs</h1>',
		);
	});

	test('a 304 when the client has the file', async () => {
		const app = make();
		const first = await app.request('/files/hello.txt');
		const again = await app.request('/files/hello.txt', {
			headers: { 'if-none-match': first.headers.get('etag') ?? '' },
		});
		expect(again.status).toBe(304);
	});

	test('dotfiles, traversal and missing files are 404s', async () => {
		const app = make();
		for (const path of [
			'/files/.env',
			'/files/../hello.txt',
			'/files/%2e%2e/etc/passwd',
			'/files/nope',
		]) {
			expect((await app.request(path)).status).toBe(404);
		}
	});

	test('a fallback serves a single-page app', async () => {
		const response = await make('index.html').request('/files/some/route');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('<h1>app</h1>');
	});

	test('the route is typed under its prefix', () => {
		const app = make();
		expectTypeOf<keyof RoutesOf<typeof app>>().toEqualTypeOf<'/files/*'>();
	});
});

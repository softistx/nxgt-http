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
import { gzipSync } from 'node:zlib';
import { alxia, type RoutesOf } from '../app/alxia';
import { parseRange } from './serve';

let root: string;
const big = 'abcdefghijklmnopqrstuvwxyz'.repeat(100);

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'alxia-static-'));
	await writeFile(join(root, 'hello.txt'), 'hello');
	await writeFile(join(root, 'index.html'), '<h1>app</h1>');
	await writeFile(join(root, 'about.html'), '<h1>about</h1>');
	await writeFile(join(root, 'big.txt'), big);
	await writeFile(join(root, 'app.js'), 'console.log(1)');
	await writeFile(join(root, 'app.js.gz'), gzipSync('console.log(1)'));
	await writeFile(join(root, 'module.wasm'), new Uint8Array([0, 97, 115, 109]));
	await writeFile(join(root, '.env'), 'SECRET=1');
	await mkdir(join(root, 'docs'));
	await writeFile(join(root, 'docs', 'index.html'), '<h1>docs</h1>');
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('app.static', () => {
	const make = () =>
		alxia().static('/files', root, {
			extensions: ['html'],
			precompressed: ['br', 'gzip'],
			types: { '.wasm': 'application/wasm' },
			cacheControl: (path) =>
				path.endsWith('.js')
					? 'public, max-age=31536000, immutable'
					: 'no-cache',
			headers: (path) =>
				path.endsWith('.txt') ? { 'x-kind': 'text' } : undefined,
		});

	test('a file with its type, ETag, Last-Modified, and headers by path', async () => {
		const response = await make().request('/files/hello.txt');
		expect(await response.text()).toBe('hello');
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(response.headers.get('etag')).toStartWith('W/"');
		expect(response.headers.get('last-modified')).not.toBeNull();
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('x-kind')).toBe('text');
		expect(response.headers.get('accept-ranges')).toBe('bytes');
	});

	test('an index, an extension, a content type of its own', async () => {
		const app = make();
		expect(await (await app.request('/files/docs')).text()).toBe(
			'<h1>docs</h1>',
		);
		expect(await (await app.request('/files/')).text()).toBe('<h1>app</h1>');
		expect(await (await app.request('/files/about')).text()).toBe(
			'<h1>about</h1>',
		);
		expect(
			(await app.request('/files/module.wasm')).headers.get('content-type'),
		).toBe('application/wasm');
	});

	test('304 for a client that has it', async () => {
		const app = make();
		const first = await app.request('/files/hello.txt');
		const etag = first.headers.get('etag') ?? '';
		expect(
			(
				await app.request('/files/hello.txt', {
					headers: { 'if-none-match': etag },
				})
			).status,
		).toBe(304);
		const since = first.headers.get('last-modified') ?? '';
		expect(
			(
				await app.request('/files/hello.txt', {
					headers: { 'if-modified-since': since },
				})
			).status,
		).toBe(304);
	});

	test('ranges: 206, a suffix, and 416', async () => {
		const app = make();
		const part = await app.request('/files/big.txt', {
			headers: { range: 'bytes=0-9' },
		});
		expect(part.status).toBe(206);
		expect(await part.text()).toBe('abcdefghij');
		expect(part.headers.get('content-range')).toBe(`bytes 0-9/${big.length}`);
		const tail = await app.request('/files/big.txt', {
			headers: { range: 'bytes=-3' },
		});
		expect(await tail.text()).toBe('xyz');
		const beyond = await app.request('/files/big.txt', {
			headers: { range: `bytes=${big.length}-` },
		});
		expect(beyond.status).toBe(416);
		expect(beyond.headers.get('content-range')).toBe(`bytes */${big.length}`);
		const stale = await app.request('/files/big.txt', {
			headers: { range: 'bytes=0-9', 'if-range': 'W/"old"' },
		});
		expect(stale.status).toBe(200);
	});

	test('a precompressed file, to a client that accepts it', async () => {
		const app = make();
		const gzip = await app.request('/files/app.js', {
			headers: { 'accept-encoding': 'gzip, br;q=0' },
		});
		expect(gzip.headers.get('content-encoding')).toBe('gzip');
		expect(gzip.headers.get('content-type')).toContain('javascript');
		expect(gzip.headers.get('vary')).toBe('Accept-Encoding');
		expect(gzip.headers.get('cache-control')).toContain('immutable');
		const plain = await app.request('/files/app.js');
		expect(plain.headers.get('content-encoding')).toBeNull();
		expect(await plain.text()).toBe('console.log(1)');
	});

	test('dotfiles, traversal and missing files are 404s', async () => {
		const app = make();
		for (const path of [
			'/files/.env',
			'/files/../hello.txt',
			'/files/%2e%2e/etc/passwd',
			'/files/a%5C..%5Cb',
			'/files/nope',
		]) {
			expect((await app.request(path)).status).toBe(404);
		}
	});

	test('a fallback serves a single-page app; HEAD sends no body', async () => {
		const spa = alxia().static('/', root, { fallback: 'index.html' });
		const deep = await spa.request('/some/client/route');
		expect(await deep.text()).toBe('<h1>app</h1>');
		const head = await spa.request('/hello.txt', { method: 'HEAD' });
		expect(head.status).toBe(200);
		expect(await head.text()).toBe('');
	});

	test('any source: files held in memory', async () => {
		const files = new Map([
			[
				'data.json',
				new File(['{"a":1}'], 'data.json', { type: 'application/json' }),
			],
		]);
		const app = alxia().static('/mem', (path) => files.get(path));
		expect(await (await app.request('/mem/data.json')).json()).toEqual({
			a: 1,
		});
		expect((await app.request('/mem/other.json')).status).toBe(404);
	});

	test('behind the app’s hooks, and typed', async () => {
		const app = alxia()
			.onResponse((response) => {
				response.headers.set('x-hooked', 'yes');
			})
			.static('/files', root);
		expect(
			(await app.request('/files/hello.txt')).headers.get('x-hooked'),
		).toBe('yes');
		expectTypeOf<keyof RoutesOf<typeof app>>().toEqualTypeOf<'/files/*'>();
		type Output = RoutesOf<typeof app>['/files/*']['GET']['output'];
		expectTypeOf<
			Extract<Output, { status: 200 }>['data']
		>().toEqualTypeOf<Blob>();
		expectTypeOf<Output['status']>().toEqualTypeOf<
			200 | 206 | 304 | 404 | 416 | 500
		>();
	});
});

describe('app.file', () => {
	test('a path, a Blob, or a function', async () => {
		const app = alxia()
			.file('/hello', join(root, 'hello.txt'))
			.file('/robots.txt', new Blob(['User-agent: *'], { type: 'text/plain' }))
			.file('/maybe', ({ request }) =>
				request.headers.get('x-want') === 'yes' ? new Blob(['yes']) : null,
			)
			.file('/missing', join(root, 'nope.txt'));
		expect(await (await app.request('/hello')).text()).toBe('hello');
		expect(await (await app.request('/robots.txt')).text()).toBe(
			'User-agent: *',
		);
		expect((await app.request('/maybe')).status).toBe(404);
		expect(
			await (
				await app.request('/maybe', { headers: { 'x-want': 'yes' } })
			).text(),
		).toBe('yes');
		expect((await app.request('/missing')).status).toBe(404);
		expectTypeOf<keyof RoutesOf<typeof app>>().toEqualTypeOf<
			'/hello' | '/robots.txt' | '/maybe' | '/missing'
		>();
	});
});

describe('app.page', () => {
	test("Bun's HTML bundle, served by Bun.serve; a path served twice is refused", async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const app = alxia()
			.get('/api', ({ reply }) => reply(200, 'api'))
			.page('/', bundle);
		expect(() => app.page('/', bundle)).toThrow('already served');
		expect(() => app.page('/api', bundle)).toThrow('already served');
		const server = app.listen({ port: 0 });
		try {
			const page = await fetch(server.url);
			expect(page.headers.get('content-type')).toContain('text/html');
			expect(await page.text()).toContain('<script type="module"');
			expect(await (await fetch(new URL('/api', server.url))).text()).toBe(
				'api',
			);
		} finally {
			await app.stop(true);
		}
	});

	test('a page of a plugin is mounted under its prefix', async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const app = alxia({ prefix: '/app' }).use(alxia().page('/', bundle));
		const server = app.listen({ port: 0 });
		try {
			expect((await fetch(new URL('/app', server.url))).status).toBe(200);
		} finally {
			await app.stop(true);
		}
	});
});

describe('parseRange', () => {
	test('one range, a suffix, an open end; several ranges are ignored', () => {
		expect(parseRange('bytes=0-0', 10)).toEqual({ start: 0, end: 0 });
		expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
		expect(parseRange('bytes=-20', 10)).toEqual({ start: 0, end: 9 });
		expect(parseRange('bytes=3-100', 10)).toEqual({ start: 3, end: 9 });
		expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable');
		expect(parseRange('bytes=0-1,3-4', 10)).toBeUndefined();
		expect(parseRange('items=0-1', 10)).toBeUndefined();
	});
});

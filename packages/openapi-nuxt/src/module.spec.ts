/**
 * The module in a real app: `test/app` is built with Nuxt, under Node as an
 * app would be, then served, and called over HTTP. Its server is the
 * fixture's Hono app, its page calls it with `useApi()` during SSR.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Subprocess } from 'bun';
import { normalizePrefix } from './module';

const APP = fileURLToPath(new URL('../test/app/', import.meta.url));
const NUXT = join(
	dirname(Bun.resolveSync('nuxt/package.json', import.meta.dir)),
	'bin/nuxt.mjs',
);

/** A port nothing listens on. */
function freePort(): number {
	const probe = Bun.serve({ port: 0, fetch: () => new Response() });
	const { port } = probe;
	probe.stop(true);
	return port as number;
}

let server: Subprocess | undefined;
let base = '';

beforeAll(async () => {
	const build = Bun.spawn(['node', NUXT, 'build'], {
		cwd: APP,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if ((await build.exited) !== 0) {
		const out = await new Response(build.stdout).text();
		const err = await new Response(build.stderr).text();
		throw new Error(`nuxt build failed:\n${out}\n${err}`);
	}
	const port = freePort();
	base = `http://127.0.0.1:${port}`;
	server = Bun.spawn(['node', '.output/server/index.mjs'], {
		cwd: APP,
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
		stdout: 'ignore',
		stderr: 'inherit',
	});
	for (let tries = 0; ; tries++) {
		const up = await fetch(`${base}/api/items/1`).then(
			() => true,
			() => false,
		);
		if (up) break;
		if (tries > 100) throw new Error('the built app never answered');
		await Bun.sleep(100);
	}
}, 180_000);

afterAll(() => {
	server?.kill();
});

describe('the server', () => {
	test('serves the Hono app under the prefix, the prefix taken off', async () => {
		const reply = await fetch(`${base}/api/items/7`, {
			headers: { cookie: 'session=abc' },
		});
		expect(reply.status).toBe(200);
		expect(await reply.json()).toEqual({
			id: 7,
			name: 'Item 7',
			cookie: 'session=abc',
			path: '/items/7',
		});
	});

	test("answers with the app's own 400", async () => {
		const reply = await fetch(`${base}/api/items`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: '' }),
		});
		expect(reply.status).toBe(400);
		const body = await reply.json();
		expect(body.message).toBe('errors.validation-failed');
		expect(body.issues[0].path).toEqual(['name']);
	});

	test('hands the prefix alone to the app, as /', async () => {
		const reply = await fetch(`${base}/api`);
		expect(reply.status).toBe(404);
		expect(await reply.text()).toBe('404 Not Found');
	});

	test('auto-imports createHonoApp, whose env holds the h3 event', async () => {
		const reply = await fetch(`${base}/api/whoami`);
		expect(await reply.json()).toEqual({ path: '/api/whoami' });
	});
});

/** What the page rendered in `<pre id="…">`, parsed. */
const renderedIn = (page: string, id: string): unknown => {
	const found = page.match(new RegExp(`<pre id="${id}">([^<]*)</pre>`))?.[1];
	if (found === undefined) throw new Error(`the page has no #${id}`);
	return JSON.parse(found.replaceAll('&quot;', '"'));
};

describe('useApiData() during SSR', () => {
	test('gives the reply without its Response, keyed by Nuxt when the call is not', async () => {
		const page = await fetch(`${base}/`).then((r) => r.text());
		expect(renderedIn(page, 'reply')).toEqual({
			status: 200,
			type: 'application/json',
			data: { id: 8, name: 'Item 8', cookie: null, path: '/items/8' },
		});
		expect(renderedIn(page, 'named')).toBe('named');
	});
});

describe('useApiQuery() during SSR', () => {
	test('fetches during SSR, following the refs of its input, and hands the cache to the browser', async () => {
		const page = await fetch(`${base}/`).then((r) => r.text());
		expect(renderedIn(page, 'query')).toEqual({
			id: 9,
			name: 'Item 9',
			cookie: null,
			path: '/items/9',
		});
		expect(renderedIn(page, 'queries')).toEqual({
			id: 10,
			name: 'Item 10',
			cookie: null,
			path: '/items/10',
		});
		// The dehydrated cache, in the payload.
		expect(page).toContain('nxgt-openapi:query');
	});
});

describe('useApi() during SSR', () => {
	test('calls the app in process, with the incoming cookies', async () => {
		const page = await fetch(`${base}/`, {
			headers: { cookie: 'session=abc' },
		}).then((r) => r.text());
		const rendered = page.match(/<pre id="out">([^<]*)<\/pre>/)?.[1];
		expect(rendered).toBeDefined();
		const data = JSON.parse((rendered ?? '').replaceAll('&quot;', '"'));
		expect(data).toEqual({
			item: { id: 7, name: 'Item 7', cookie: 'session=abc', path: '/items/7' },
			created: { id: 1, name: 'posted', cookie: 'session=abc', path: '/items' },
		});
	});
});

describe('normalizePrefix', () => {
	test('gives one leading slash and no trailing one', () => {
		expect(normalizePrefix('/api')).toBe('/api');
		expect(normalizePrefix('api/')).toBe('/api');
		expect(normalizePrefix('//api//v1/')).toBe('/api/v1');
	});

	test('refuses a prefix that names no path', () => {
		expect(() => normalizePrefix('/')).toThrow('names no path');
		expect(() => normalizePrefix('')).toThrow('names no path');
		expect(() => normalizePrefix('/api?x')).toThrow('names no path');
	});
});

import { resolve, sep } from 'node:path';
import { alxia, type RoutePath } from '@alxia/core';

export interface StaticOptions<Prefix extends '' | RoutePath> {
	/** The directory files are served from. */
	readonly root: string;
	/** The path they are served under: `/assets`. The root of the app by default. */
	readonly prefix?: Prefix;
	/** The file a directory serves. `index.html` by default; `false` for none. */
	readonly index?: string | false;
	/**
	 * The file served for a path that matches none, with a 200: the
	 * `index.html` of a single-page app, relative to `root`.
	 */
	readonly fallback?: string;
	/** `Cache-Control: max-age`, in seconds. 0 by default: revalidate every time. */
	readonly maxAge?: number;
	/** Adds `immutable`: for files whose name carries their hash. */
	readonly immutable?: boolean;
	/** Whether a file or directory starting with `.` is served. Never, by default. */
	readonly dotfiles?: boolean;
	/** Headers added to every file served. */
	readonly headers?: HeadersInit;
}

/** The body of the 404. */
export interface FileNotFoundBody {
	readonly error: 'not_found';
}

/**
 * Static files, as a plugin: a `GET` route at `<prefix>/*`, so the client
 * types it like any other. Files are served by `Bun.file`, with an ETag and
 * `Last-Modified`, answered 304 when the client has them; a path that leaves
 * `root` — `..`, an encoded slash — is a 404.
 *
 * ```ts
 * app.use(serveStatic({ root: './public', prefix: '/assets', maxAge: 31536000, immutable: true }));
 * ```
 */
export function serveStatic<const Prefix extends '' | RoutePath = ''>(
	options: StaticOptions<Prefix>,
) {
	const root = resolve(options.root);
	const index = options.index ?? 'index.html';
	const cacheControl = `public, max-age=${options.maxAge ?? 0}${
		options.immutable ? ', immutable' : ''
	}`;
	const notFound: FileNotFoundBody = { error: 'not_found' };
	const prefix = (options.prefix ?? '') as Prefix;

	const locate = async (wanted: string): Promise<Bun.BunFile | undefined> => {
		if (wanted.includes('\0') || wanted.includes('\\')) return undefined;
		const segments = wanted.split('/').filter((segment) => segment !== '');
		if (
			!options.dotfiles &&
			segments.some((segment) => segment.startsWith('.'))
		) {
			return undefined;
		}
		const path = resolve(root, ...segments);
		if (path !== root && !path.startsWith(root + sep)) return undefined;
		const file = Bun.file(path);
		if (await file.exists()) return file;
		if (index === false) return undefined;
		const indexFile = Bun.file(resolve(path, index));
		return (await indexFile.exists()) ? indexFile : undefined;
	};

	return alxia({ prefix }).get('/*', async ({ params, request, reply }) => {
		const file =
			(await locate((params as { readonly '*': string })['*'])) ??
			(options.fallback === undefined
				? undefined
				: await locate(options.fallback));
		if (file === undefined) return reply(404, notFound);

		const stat = await file.stat();
		const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
		const lastModified = new Date(stat.mtimeMs).toUTCString();
		const headers = new Headers(options.headers);
		headers.set('etag', etag);
		headers.set('last-modified', lastModified);
		headers.set('cache-control', cacheControl);
		if (file.type) headers.set('content-type', file.type);

		const match = request.headers.get('if-none-match');
		const since = request.headers.get('if-modified-since');
		const fresh =
			match !== null
				? match
						.split(',')
						.some((tag) => tag.trim() === etag || tag.trim() === '*')
				: since !== null &&
					Date.parse(since) >= Math.floor(stat.mtimeMs / 1000) * 1000;
		if (fresh) return reply(304, undefined, { headers });
		return reply(200, file as Blob, { headers });
	});
}

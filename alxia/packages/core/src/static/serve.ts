/**
 * Static files, served through the app's pipeline: every hook runs around
 * them, and the client types them like any route.
 */
import { extname, resolve, sep } from 'node:path';
import type { BaseContext, MaybePromise } from '../app/types';
import { vary } from '../reply/headers';
import { type AnyReply, Reply } from '../reply/reply';

/**
 * Where files come from: a directory, or a function answering a path —
 * `Bun.embeddedFiles` in a single-file executable, an S3 bucket through
 * `Bun.s3`, files held in memory. `null` is a 404.
 */
export type FileSource =
	| string
	| ((path: string, ctx: BaseContext) => MaybePromise<Blob | null | undefined>);

/** A content coding a file may be stored in beside itself: `app.js.br`. */
export type Precompressed = 'br' | 'zstd' | 'gzip';

/** What a file, or a directory of them, is served with. */
export interface FileOptions {
	/**
	 * `Cache-Control`: a value, `false` for none, or one per path — long for
	 * hashed assets, none for `index.html`. `public, max-age=0` by default:
	 * the client revalidates, and gets a 304.
	 */
	readonly cacheControl?: string | false | ((path: string) => string | false);
	/** Headers added to every file, or to each by its path. */
	readonly headers?:
		| HeadersInit
		| ((path: string, file: Blob) => HeadersInit | undefined);
	/** A weak `ETag` of its size and modification time, answered 304. On by default. */
	readonly etag?: boolean;
	/** `Last-Modified`, answered 304. On by default. */
	readonly lastModified?: boolean;
	/** `Range` requests, answered 206 — a video seeking. On by default. */
	readonly ranges?: boolean;
	/** Content types by extension, over the ones Bun knows: `{ '.wasm': 'application/wasm' }`. */
	readonly types?: Readonly<Record<string, string>>;
}

export interface StaticOptions extends FileOptions {
	/** The file a directory serves: one, several tried in order, or `false`. `index.html` by default. */
	readonly index?: string | readonly string[] | false;
	/** Extensions tried for a path without one: `['html']` serves `/about` from `about.html`. */
	readonly extensions?: readonly string[];
	/**
	 * Served, with a 200, for a path that matches no file: a single-page
	 * app's `index.html`, relative to the source.
	 */
	readonly fallback?: string;
	/** Whether a file or directory starting with `.` is served. Never, by default: a 404. */
	readonly dotfiles?: boolean;
	/**
	 * Codings stored beside each file, served to a client that accepts them:
	 * `app.js.br` for `app.js`. None by default.
	 */
	readonly precompressed?: readonly Precompressed[];
}

/** The body of the 404. */
export interface FileNotFoundBody {
	readonly error: 'not_found';
}

/** The body of the 416. */
export interface RangeNotSatisfiableBody {
	readonly error: 'range_not_satisfiable';
}

/** Every reply a static route may answer. */
export type StaticReply =
	| Reply<200, Blob>
	| Reply<206, Blob>
	| Reply<304, undefined>
	| Reply<404, FileNotFoundBody>
	| Reply<416, RangeNotSatisfiableBody>;

interface Found {
	readonly file: Blob;
	/** The path it was found at, relative to the source: what options are asked by. */
	readonly path: string;
}

const notFound: FileNotFoundBody = { error: 'not_found' };
const unsatisfiable: RangeNotSatisfiableBody = {
	error: 'range_not_satisfiable',
};

/** A source as a lookup of one relative path. */
function lookup(source: FileSource) {
	if (typeof source === 'function') {
		return async (path: string, ctx: BaseContext) => {
			const file = await source(path, ctx);
			return file ? file : undefined;
		};
	}
	const root = resolve(source);
	return async (path: string): Promise<Blob | undefined> => {
		const full = resolve(root, path);
		if (full !== root && !full.startsWith(root + sep)) return undefined;
		const file = Bun.file(full);
		return (await file.exists()) ? file : undefined;
	};
}

/** The segments of a requested path, or `undefined` for one that must never be served. */
function segmentsOf(wanted: string, dotfiles: boolean): string[] | undefined {
	if (wanted.includes('\0') || wanted.includes('\\')) return undefined;
	const segments = wanted.split('/').filter((segment) => segment !== '');
	if (segments.some((segment) => segment === '..' || segment === '.'))
		return undefined;
	if (!dotfiles && segments.some((segment) => segment.startsWith('.')))
		return undefined;
	return segments;
}

/** The handler of `app.static`: the wildcard's path, looked up in `source`. */
export function staticHandler(source: FileSource, options: StaticOptions = {}) {
	const find = lookup(source);
	const indexes =
		options.index === false
			? []
			: typeof options.index === 'string'
				? [options.index]
				: (options.index ?? ['index.html']);
	const extensions = options.extensions ?? [];
	const dotfiles = options.dotfiles ?? false;

	const locate = async (
		wanted: string,
		ctx: BaseContext,
	): Promise<Found | undefined> => {
		const segments = segmentsOf(wanted, dotfiles);
		if (segments === undefined) return undefined;
		const path = segments.join('/');
		const candidates = [path];
		if (path !== '' && extname(path) === '') {
			candidates.push(
				...extensions.map(
					(extension) => `${path}.${extension.replace(/^\./, '')}`,
				),
			);
		}
		candidates.push(
			...indexes.map((index) => (path === '' ? index : `${path}/${index}`)),
		);
		for (const candidate of candidates) {
			if (candidate === '') continue;
			const file = await find(candidate, ctx);
			if (file !== undefined) return { file, path: candidate };
		}
		return undefined;
	};

	return async (ctx: BaseContext): Promise<AnyReply> => {
		const wanted = ctx.pathParams['*'] ?? '';
		const found =
			(await locate(wanted, ctx)) ??
			(options.fallback === undefined
				? undefined
				: await locate(options.fallback, ctx));
		if (found === undefined) return new Reply(404, notFound);
		const encoded = await precompressed(
			found,
			options.precompressed ?? [],
			ctx,
			find,
		);
		return send(ctx, found, options, encoded);
	};
}

/** The handler of `app.file`: one file, read anew on every request so a change is served. */
export function fileHandler(
	file:
		| string
		| Blob
		| ((ctx: BaseContext) => MaybePromise<Blob | null | undefined>),
	options: FileOptions = {},
) {
	return async (ctx: BaseContext): Promise<AnyReply> => {
		const blob =
			typeof file === 'string'
				? Bun.file(file)
				: typeof file === 'function'
					? await file(ctx)
					: file;
		if (!blob || (isBunFile(blob) && !(await blob.exists()))) {
			return new Reply(404, notFound);
		}
		const path =
			typeof file === 'string'
				? file
				: ((isBunFile(blob) ? blob.name : undefined) ?? ctx.route);
		return send(ctx, { file: blob, path }, options, undefined);
	};
}

async function precompressed(
	found: Found,
	codings: readonly Precompressed[],
	ctx: BaseContext,
	find: (path: string, ctx: BaseContext) => Promise<Blob | undefined>,
): Promise<
	{ readonly file: Blob; readonly coding: Precompressed } | undefined
> {
	if (codings.length === 0) return undefined;
	const accept = ctx.request.headers.get('accept-encoding') ?? '';
	for (const coding of codings) {
		if (
			!new RegExp(`(^|[\\s,])${coding}(?!;q=0(\\.0*)?(\\s|,|$))`).test(accept)
		)
			continue;
		const extension =
			coding === 'gzip' ? 'gz' : coding === 'zstd' ? 'zst' : 'br';
		const file = await find(`${found.path}.${extension}`, ctx);
		if (file !== undefined) return { file, coding };
	}
	return undefined;
}

function send(
	ctx: BaseContext,
	found: Found,
	options: FileOptions,
	encoded: { readonly file: Blob; readonly coding: Precompressed } | undefined,
): AnyReply {
	const { request } = ctx;
	const served = encoded?.file ?? found.file;
	const headers = new Headers();

	const type =
		options.types?.[extname(found.path).toLowerCase()] ?? found.file.type;
	if (type) headers.set('content-type', type);
	if (encoded !== undefined) headers.set('content-encoding', encoded.coding);
	// A coding chosen by Accept-Encoding varies by it.
	if (encoded !== undefined) vary(headers, 'Accept-Encoding');

	const cacheControl =
		typeof options.cacheControl === 'function'
			? options.cacheControl(found.path)
			: (options.cacheControl ?? 'public, max-age=0');
	if (cacheControl !== false) headers.set('cache-control', cacheControl);

	const modified =
		'lastModified' in served ? (served as File).lastModified : undefined;
	const etag =
		options.etag !== false && modified !== undefined
			? `W/"${served.size.toString(16)}-${Math.floor(modified).toString(16)}${encoded ? `-${encoded.coding}` : ''}"`
			: undefined;
	if (etag !== undefined) headers.set('etag', etag);
	if (options.lastModified !== false && modified !== undefined) {
		headers.set('last-modified', new Date(modified).toUTCString());
	}
	const ranges = options.ranges !== false && encoded === undefined;
	if (ranges) headers.set('accept-ranges', 'bytes');

	const custom =
		typeof options.headers === 'function'
			? options.headers(found.path, found.file)
			: options.headers;
	if (custom !== undefined) {
		for (const [name, value] of new Headers(custom)) headers.set(name, value);
	}

	if (fresh(request.headers, etag, modified))
		return new Reply(304, undefined, { headers });

	const range = request.headers.get('range');
	if (
		ranges &&
		range !== null &&
		ifRange(request.headers.get('if-range'), etag, modified)
	) {
		const parsed = parseRange(range, served.size);
		if (parsed === 'unsatisfiable') {
			headers.set('content-range', `bytes */${served.size}`);
			return new Reply(416, unsatisfiable, { headers });
		}
		if (parsed !== undefined) {
			headers.set(
				'content-range',
				`bytes ${parsed.start}-${parsed.end}/${served.size}`,
			);
			return new Reply(206, served.slice(parsed.start, parsed.end + 1, type), {
				headers,
			});
		}
	}
	return new Reply(200, served, { headers });
}

function isBunFile(blob: Blob): blob is Bun.BunFile {
	return typeof (blob as Bun.BunFile).exists === 'function';
}

/** Whether the client's copy is current: `If-None-Match` first, `If-Modified-Since` without it. */
function fresh(
	headers: Headers,
	etag: string | undefined,
	modified: number | undefined,
): boolean {
	const match = headers.get('if-none-match');
	if (match !== null) {
		if (etag === undefined) return false;
		const weak = (tag: string) => tag.trim().replace(/^W\//, '');
		return match
			.split(',')
			.some((tag) => tag.trim() === '*' || weak(tag) === weak(etag));
	}
	const since = headers.get('if-modified-since');
	if (since === null || modified === undefined) return false;
	const time = Date.parse(since);
	return !Number.isNaN(time) && Math.floor(modified / 1000) * 1000 <= time;
}

/** Whether a range applies: always without `If-Range`, else only to the copy it names. */
function ifRange(
	value: string | null,
	etag: string | undefined,
	modified: number | undefined,
): boolean {
	if (value === null) return true;
	if (value.startsWith('"') || value.startsWith('W/')) {
		// A weak tag never validates a range.
		return etag !== undefined && !etag.startsWith('W/') && value === etag;
	}
	const time = Date.parse(value);
	return (
		modified !== undefined &&
		!Number.isNaN(time) &&
		Math.floor(modified / 1000) * 1000 <= time
	);
}

/**
 * One byte range of `size`: its first and last byte, `unsatisfiable`, or
 * `undefined` — a header this server ignores, several ranges included —
 * which serves the whole file.
 */
export function parseRange(
	header: string,
	size: number,
):
	| { readonly start: number; readonly end: number }
	| 'unsatisfiable'
	| undefined {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (match === null) return undefined;
	const [, from = '', to = ''] = match;
	if (from === '' && to === '') return undefined;
	if (from === '') {
		const suffix = Number(to);
		if (suffix === 0) return 'unsatisfiable';
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(from);
	const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
	if (start >= size || start > end) return 'unsatisfiable';
	return { start, end };
}

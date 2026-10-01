import { Duplex } from 'node:stream';
import { createBrotliCompress } from 'node:zlib';
import { type Plugin, vary, withHeaders } from '@alxia/core';

export type Encoding = 'zstd' | 'br' | 'gzip' | 'deflate';

export interface CompressOptions {
	/** The encodings offered, in the server's order of preference. */
	readonly encodings?: readonly Encoding[];
	/** Bodies smaller than this, in bytes, are sent as they are. 1 KiB by default. */
	readonly threshold?: number;
	/** Whether a `content-type` is worth compressing. Text, JSON, JavaScript, XML and SVG by default. */
	readonly compressible?: (type: string) => boolean;
}

const COMPRESSIBLE =
	/^(text\/(?!event-stream)|application\/(.+\+)?(json|javascript|xml)|image\/svg\+xml)/i;

/**
 * Compression, as a plugin: each response worth it is streamed through the
 * best encoding both sides accept — zstd, Brotli, gzip or deflate — with
 * Bun's and Node's own codecs. An event stream is never compressed: it
 * would wait for a block to fill.
 */
export function compress(options: CompressOptions = {}): Plugin {
	const encodings = options.encodings ?? ['zstd', 'br', 'gzip', 'deflate'];
	const threshold = options.threshold ?? 1024;
	const compressible =
		options.compressible ?? ((type) => COMPRESSIBLE.test(type));
	return (app) =>
		app.onResponse((response, { request }) => {
			const type = response.headers.get('content-type') ?? '';
			if (compressible(type)) {
				response = withHeaders(response, (headers) =>
					vary(headers, 'Accept-Encoding'),
				);
			}
			if (
				response.body === null ||
				request.method === 'HEAD' ||
				response.headers.has('content-encoding') ||
				response.status === 204 ||
				response.status === 206 ||
				response.status === 304 ||
				/\bno-transform\b/.test(response.headers.get('cache-control') ?? '') ||
				!compressible(type)
			) {
				return response;
			}
			const length = response.headers.get('content-length');
			if (length !== null && Number(length) < threshold) return response;
			const encoding = negotiate(
				request.headers.get('accept-encoding'),
				encodings,
			);
			if (encoding === undefined) return response;
			const headers = new Headers(response.headers);
			headers.set('content-encoding', encoding);
			headers.delete('content-length');
			const etag = headers.get('etag');
			if (etag !== null && !etag.startsWith('W/'))
				headers.set('etag', `W/${etag}`);
			return new Response(response.body.pipeThrough(compressor(encoding)), {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		});
}

function compressor(
	encoding: Encoding,
): ReadableWritablePair<Uint8Array, Uint8Array> {
	if (encoding === 'br') {
		return Duplex.toWeb(
			createBrotliCompress(),
		) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
	}
	return new CompressionStream(
		encoding as CompressionFormat,
	) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
}

/**
 * The encoding to answer `accept` with: the first of `offered` the client
 * accepts, by its own `q` order first. `identity` alone, or nothing, is none.
 */
export function negotiate(
	accept: string | null,
	offered: readonly Encoding[],
): Encoding | undefined {
	if (accept === null) return undefined;
	const weights = new Map<string, number>();
	for (const part of accept.split(',')) {
		const [name, ...params] = part.trim().toLowerCase().split(';');
		if (!name) continue;
		const q = params
			.map((param) => param.trim())
			.find((param) => param.startsWith('q='));
		weights.set(name, q === undefined ? 1 : Number(q.slice(2)) || 0);
	}
	const weight = (encoding: string) =>
		weights.get(encoding) ?? weights.get('*') ?? 0;
	let best: Encoding | undefined;
	for (const encoding of offered) {
		if (weight(encoding) <= 0) continue;
		if (best === undefined || weight(encoding) > weight(best)) best = encoding;
	}
	return best;
}

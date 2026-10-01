import type { Method } from '@alxia/core';
import { readEvents } from './sse/read-events';
import type { AppLike, CallOptions, Client } from './types';
import { openSocket } from './ws/socket';

/** Where a client sends its calls: a base URL, or a fetch handler such as an app. */
export type Target =
	| string
	| URL
	| { readonly fetch: (request: Request) => Promise<Response> };

export interface ClientOptions {
	/** Headers sent with every call, under each call's own. A function is called per call. */
	readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
	/** The `fetch` a URL target is called with; the global one by default. */
	readonly fetch?: (request: Request) => Promise<Response>;
}

interface CallInput extends CallOptions {
	readonly params?: Readonly<Record<string, string | number>>;
	readonly query?: Readonly<Record<string, unknown>>;
	readonly headers?: Readonly<Record<string, unknown>>;
	readonly cookies?: Readonly<Record<string, unknown>>;
	readonly body?: unknown;
}

const METHODS: readonly Method[] = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'OPTIONS',
	'HEAD',
];

/**
 * The typed client of an app, from its type alone:
 *
 * ```ts
 * import type { App } from './server';
 * const api = client<App>('http://localhost:3000');
 * const user = await api.get('/users/:id', { params: { id: 1 } });
 * if (user.status === 200) user.data.name;
 * ```
 *
 * Given the app itself, `client(app)` calls its `fetch` in process: no
 * server, no port, which is what a test wants.
 */
export function client<App extends AppLike>(
	target: Target | App,
	options: ClientOptions = {},
): Client<App> {
	const send = sender(target, options);
	const methods: Record<string, unknown> = {};
	for (const method of METHODS) {
		methods[method.toLowerCase()] = (path: string, input: CallInput = {}) =>
			call(send, options, method, path, input);
	}
	methods['ws'] = (path: string, input: CallInput = {}) => {
		if (send.base === IN_PROCESS) {
			throw new TypeError(
				'client(app).ws(): a socket needs a server. Give the client its URL.',
			);
		}
		const url = new URL(send.base + fillPath(path, input.params ?? {}));
		appendQuery(url, input.query);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		return openSocket(url);
	};
	return methods as Client<App>;
}

function sender(
	target: Target | AppLike,
	options: ClientOptions,
): { base: string; fetch: (request: Request) => Promise<Response> } {
	if (typeof target === 'string' || target instanceof URL) {
		const base = String(target).replace(/\/+$/, '');
		return { base, fetch: options.fetch ?? ((request) => fetch(request)) };
	}
	if ('fetch' in target && typeof target.fetch === 'function') {
		return {
			base: IN_PROCESS,
			fetch: target.fetch as (request: Request) => Promise<Response>,
		};
	}
	throw new TypeError('client(): give it a URL, or an app with a fetch');
}

async function call(
	send: { base: string; fetch: (request: Request) => Promise<Response> },
	options: ClientOptions,
	method: Method,
	path: string,
	input: CallInput,
) {
	const url = new URL(send.base + fillPath(path, input.params ?? {}));
	appendQuery(url, input.query);

	const headers = new Headers(
		typeof options.headers === 'function'
			? await options.headers()
			: options.headers,
	);
	for (const [key, value] of new Headers(input.init?.headers)) {
		headers.set(key, value);
	}
	for (const [key, value] of Object.entries(input.headers ?? {})) {
		if (value !== undefined) headers.set(key, stringify(value));
	}
	const cookies = Object.entries(input.cookies ?? {})
		.filter(([, value]) => value !== undefined)
		.map(
			([name, value]) =>
				`${encodeURIComponent(name)}=${encodeURIComponent(stringify(value))}`,
		);
	if (cookies.length > 0) {
		const existing = headers.get('cookie');
		headers.set('cookie', [existing, ...cookies].filter(Boolean).join('; '));
	}

	let body: BodyInit | undefined;
	if (input.body !== undefined) {
		if (
			typeof input.body === 'string' ||
			input.body instanceof Blob ||
			input.body instanceof FormData ||
			input.body instanceof URLSearchParams ||
			input.body instanceof ArrayBuffer ||
			ArrayBuffer.isView(input.body) ||
			input.body instanceof ReadableStream
		) {
			body = input.body as BodyInit;
			if (typeof input.body === 'string' && !headers.has('content-type')) {
				headers.set('content-type', 'text/plain;charset=utf-8');
			}
		} else {
			body = JSON.stringify(input.body);
			if (!headers.has('content-type')) {
				headers.set('content-type', 'application/json');
			}
		}
	}

	const init: RequestInit = { ...input.init, method, headers };
	if (body !== undefined) init.body = body;
	const signal = input.signal ?? input.init?.signal;
	if (signal) init.signal = signal;
	const response = await send.fetch(new Request(url, init));
	const data = await readData(response);
	return {
		status: response.status,
		ok: response.ok,
		data,
		response,
	};
}

/** `path` with its parameters filled in, each one encoded. */
export function fillPath(
	path: string,
	params: Readonly<Record<string, string | number>>,
): string {
	return path
		.split('/')
		.map((segment) => {
			if (segment === '*') {
				const rest = params['*'];
				return rest === undefined
					? ''
					: String(rest).split('/').map(encodeURIComponent).join('/');
			}
			if (!segment.startsWith(':')) return segment;
			const value = params[segment.slice(1)];
			if (value === undefined) {
				throw new TypeError(`${path}: the parameter ${segment} is missing`);
			}
			return encodeURIComponent(String(value));
		})
		.join('/');
}

const IN_PROCESS = 'http://alxia.local';

function appendQuery(url: URL, query: CallInput['query']): void {
	for (const [key, value] of Object.entries(query ?? {})) {
		for (const item of Array.isArray(value) ? value : [value]) {
			if (item !== undefined) url.searchParams.append(key, stringify(item));
		}
	}
}

/** A value as text: a date in ISO 8601, an object as JSON. */
function stringify(value: unknown): string {
	if (value instanceof Date) return value.toISOString();
	if (value !== null && typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/** The body as the server sent it: JSON, events, text, nothing, or a `Blob`. */
async function readData(response: Response): Promise<unknown> {
	if (response.status === 204 || response.status === 304) return undefined;
	const type = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (type.startsWith('text/event-stream') && response.body !== null) {
		return readEvents(response.body);
	}
	if (type.includes('json')) {
		const text = await response.text();
		return text === '' ? undefined : JSON.parse(text);
	}
	if (type.startsWith('text/')) return response.text();
	const blob = await response.blob();
	return blob.size === 0 ? undefined : blob;
}

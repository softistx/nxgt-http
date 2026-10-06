/**
 * The object an app calls: one function per method, `request`, `send`,
 * `events`, `lines`, `use` and `group`, over the client's shared state.
 */
import { cancelled, joinSignals } from '../cancel/abort';
import type { Middleware } from '../middleware/compose';
import { type ReplyGiven, request } from './request';
import { send } from './send';
import type { ClientState } from './state';
import { type EventsGiven, events, type LinesGiven, lines } from './streams';
import type { HttpClient, HttpGroup, Method, SendOptions } from './types';

export const METHODS: readonly Method[] = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
	'query',
];

/**
 * The client's calls, each with `scope()`'s signal added to its own, and
 * the middleware of `use()`: `inherited()`, a parent's, read as each call
 * is made, then its own. A group's `use()` is the group's alone.
 */
export const surface = (
	state: ClientState,
	scope: () => AbortSignal | undefined,
	inherited: () => readonly Middleware[],
): HttpClient => {
	const own: Middleware[] = [];
	const layers = () => [...inherited(), ...own];
	const scoped = <T extends { readonly signal?: AbortSignal | null }>(
		given: T | undefined,
	): T => {
		const extra = scope();
		const own = given ?? ({} as T);
		return extra
			? ({ ...own, signal: joinSignals(own.signal, extra) } as T)
			: own;
	};
	const client: Record<string, unknown> = {
		request: (method: Method, path: string, given?: ReplyGiven) =>
			request(state, method, path, scoped(given), layers()),
		send: (sent: Request, given?: SendOptions) => {
			const extra = scope();
			return send(
				state,
				extra
					? new Request(sent, {
							signal: AbortSignal.any([sent.signal, extra]),
						})
					: sent,
				given ?? {},
				layers(),
			);
		},
		events: (path: string, given?: EventsGiven) =>
			events(state, path, scoped(given), layers()),
		lines: (path: string, given?: LinesGiven) =>
			lines(state, path, scoped(given), layers()),
		use: (...middlewares: Middleware[]) => {
			own.push(...middlewares);
			return client;
		},
		group: () => group(state, scope, layers),
	};
	for (const method of METHODS) {
		client[method] = (path: string, given?: ReplyGiven) =>
			request(state, method, path, scoped(given), layers());
	}
	return client as unknown as HttpClient;
};

/**
 * A surface of its own under its parent's: its signal, which `cancel()`
 * aborts and then replaces, is added to every call it makes.
 */
const group = (
	state: ClientState,
	scope: () => AbortSignal | undefined,
	layers: () => readonly Middleware[],
): HttpGroup => {
	let controller = new AbortController();
	const group = surface(
		state,
		() => joinSignals(scope(), controller.signal),
		layers,
	) as HttpClient & Record<string, unknown>;
	group['cancel'] = (reason?: unknown) => {
		controller.abort(reason ?? cancelled('The group was cancelled'));
		controller = new AbortController();
	};
	Object.defineProperty(group, 'signal', {
		enumerable: true,
		get: () => controller.signal,
	});
	return group as unknown as HttpGroup;
};

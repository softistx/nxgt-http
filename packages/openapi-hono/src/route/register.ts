/**
 * One registration: checks it, and throws at startup when it is wrong, then
 * puts `[...before, validator, ...after, reply]` on the app.
 */
import type { MiddlewareHandler } from 'hono';
import type { RuntimeOperation } from '../engine';
import { unroutable } from '../routable';
import { localPath, shadows } from './paths';
import { label, type Registry } from './registry';
import { reply } from './reply';
import type { App, Handler, Settings } from './types';
import { validation } from './validate';

/** Stands for the validator in a chain; the engine swaps it out. */
export const VALIDATE: MiddlewareHandler = async () => {
	throw new Error(
		'routes.validate marks where a routes chain validates the request; it cannot run anywhere else',
	);
};

export function register(
	registry: Registry,
	app: App,
	id: string,
	chain: unknown[],
	settings: Settings,
): void {
	const operation = registry.operations[id];
	if (!operation) throw new Error(`${id} is not an operationId of the spec`);
	const name = label(id, operation);
	const why = unroutable(operation);
	if (why !== undefined) throw new Error(`${name}: ${why}`);
	if (registry.done.has(id)) throw new Error(`${name} already has a route`);
	if (settings.tag !== undefined && !operation.tags.includes(settings.tag)) {
		throw new Error(`${name} is not tagged ${settings.tag}`);
	}
	const { handler, middlewares, marker } = splitChain(chain, name);
	const path = localPath(operation, settings.prefix, name);
	const routes = registry.placed.get(app) ?? [];
	for (const earlier of routes) {
		if (earlier.method === operation.method && shadows(earlier.path, path)) {
			throw new Error(
				`${name} would never be reached: ${earlier.label}, registered before it, matches ${path} first. Register ${id} before it`,
			);
		}
	}
	const at = marker < 0 ? middlewares.length : marker;
	put(
		app,
		operation,
		path,
		...middlewares.slice(0, at),
		validation(id, operation, settings),
		...middlewares.slice(marker < 0 ? at : at + 1),
		reply(id, operation, handler, settings, registry.running),
	);
	routes.push({ method: operation.method, path, label: name });
	registry.placed.set(app, routes);
	registry.done.add(id);
}

/** The handler, last; the middlewares before it; where `routes.validate` sits among them, or -1. */
function splitChain(
	chain: unknown[],
	name: string,
): { handler: Handler; middlewares: MiddlewareHandler[]; marker: number } {
	const handler = chain.at(-1);
	const middlewares = chain.slice(0, -1) as MiddlewareHandler[];
	if (typeof handler !== 'function' || handler === VALIDATE) {
		throw new Error(`${name}: the last argument must be the handler`);
	}
	const marker = middlewares.indexOf(VALIDATE);
	if (marker !== middlewares.lastIndexOf(VALIDATE)) {
		throw new Error(`${name}: routes.validate appears twice`);
	}
	return { handler: handler as Handler, middlewares, marker };
}

/** `app.on()`: Hono's overloads type a literal chain; this one is built at runtime. */
function put(
	app: App,
	operation: RuntimeOperation,
	path: string,
	...handlers: MiddlewareHandler[]
): void {
	const on = app.on as unknown as (
		method: string,
		path: string,
		...handlers: MiddlewareHandler[]
	) => unknown;
	on.call(app, operation.method.toUpperCase(), path, ...handlers);
}

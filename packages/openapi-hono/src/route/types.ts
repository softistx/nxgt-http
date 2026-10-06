/** The types the parts of the engine share; none is exported by the package. */
import type { Context, Hono, Next } from 'hono';
import type { RunningRoute } from '../engine';
import type { ApiOptions, Method } from '../types';

/** The options of a `routes` object: the Api's defaults, then its own. */
export type Settings = ApiOptions & { prefix?: string; tag?: string };
export type Handler = (c: Context, next: Next) => unknown;
export type App = Hono<any, any, any>;
/** What `addValidatedData` takes: whatever the validator returned. */
export type Validated = Parameters<Context['req']['addValidatedData']>[1];
/** The route each request runs, set before its handler. */
export type Running = WeakMap<Context, RunningRoute>;
/** A route the engine put on an app: what the shadowing check reads. */
export interface PlacedRoute {
	method: Method;
	path: string;
	label: string;
}
/** Every route the engine put on each app, in order. */
export type Placed = WeakMap<object, PlacedRoute[]>;

/**
 * The runtime behind `hono.ts`. Each route is registered on a Hono app as
 * `[...middlewares, validator, handler]`: the validator reads the parameters
 * and the body with the validators of `operations.ts`, hands the results
 * to `c.req.valid()`, and answers every issue at once when there is one.
 */
import type { Context } from 'hono';
// biome-ignore lint/style/useImportType: tsc copies this form into the shipped engine.d.ts, which stays byte-identical to the one before the split
import { type SchemaIssue } from './errors';
import { assertComplete, createRegistry, missing } from './route/registry';
import { makeRoutes } from './route/routes';
import type { App, Placed, Settings } from './route/types';
import type { Api, ApiOptions, ApiSpec, Method, Routes } from './types';

/** What the engine asks of a validator: Zod's `safeParse`. */
export interface Validator {
	safeParse(
		value: unknown,
	):
		| { success: true; data: unknown }
		| { success: false; error: { issues: readonly SchemaIssue[] } };
}

export interface RuntimeMedia {
	readonly kind: 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';
	readonly schema?: Validator;
	/** `sse`: each event's data, by name: a validator for JSON, `null` for text. */
	readonly events?: { readonly [event: string]: Validator | null };
	/** `jsonl`: each item. */
	readonly item?: Validator;
}

/** An entry of the `operations` table in `operations.ts`. */
export interface RuntimeOperation {
	readonly method: Method;
	readonly path: string;
	readonly honoPath: string;
	readonly tags: readonly string[];
	readonly parameters: readonly {
		readonly name: string;
		readonly in: 'path' | 'query' | 'header';
		readonly list: boolean;
		readonly explode: boolean;
	}[];
	readonly param: Validator;
	readonly query: Validator;
	readonly header: Validator;
	readonly body?: {
		readonly required: boolean;
		readonly content: { readonly [mediaType: string]: RuntimeMedia };
	};
	readonly responses: {
		readonly [status: number]: { readonly [mediaType: string]: RuntimeMedia };
	};
}

/** The `operations` table, keyed by `operationId`. */
export type OperationTable = {
	readonly [operationId: string]: RuntimeOperation;
};

/** The route a request runs: what `streamEvents()` and `streamLines()` read in its handler. */
export interface RunningRoute {
	readonly id: string;
	readonly operation: RuntimeOperation;
	readonly settings: ApiOptions;
}

/** Set before each handler runs; a request's `Context` is the same object throughout its chain. */
const running = new WeakMap<Context, RunningRoute>();

export const runningRoute = (c: Context): RunningRoute | undefined =>
	running.get(c);

/** Every route the engine put on an app, in order, for the shadowing check. */
const placed: Placed = new WeakMap();

/**
 * One registry for a spec: `routes(app)` for each app or module, then
 * `assertComplete()`. `hono.ts` calls it with the spec's table.
 */
export function createApi<S extends ApiSpec>(
	operations: OperationTable,
	defaults: ApiOptions = {},
): Api<S> {
	const registry = createRegistry(operations, running, placed);
	return {
		routes: <Prefix extends string>(app: App, options: Settings = {}) =>
			makeRoutes(registry, app, {
				...defaults,
				...options,
			}) as unknown as Routes<S, never, Prefix>,
		missing: (tag?: string) => missing(registry, tag),
		assertComplete: (tag?: string) => assertComplete(registry, tag),
	};
}

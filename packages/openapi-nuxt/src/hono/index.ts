/**
 * `@nxgt/openapi-nuxt/hono`: the Hono app the module serves, its `env`
 * holding the request's h3 event. The module auto-imports `createHonoApp` in
 * the server's files.
 */
import type { H3Event } from 'h3';
import { type Env, Hono } from 'hono';
import type { HonoOptions } from 'hono/hono-base';

/** What the module hands the app with each request, as `c.env`. */
export interface NuxtBindings {
	/** The h3 event of the request: its `context`, what Nitro's middleware put there. */
	event: H3Event;
}

/** The app's `Env` under Nuxt: `c.env.event` is the h3 event. */
export type NuxtEnv = { Bindings: NuxtBindings };

/**
 * `new Hono<{ Bindings: { event: H3Event } }>()`: `c.env.event` is typed.
 * `E` adds to it, `createHonoApp<{ Variables: { user: User } }>()`, and
 * `options` are Hono's.
 */
export function createHonoApp<E extends Env = {}>(
	options?: HonoOptions<NuxtEnv & E>,
): Hono<NuxtEnv & E> {
	return new Hono<NuxtEnv & E>(options);
}

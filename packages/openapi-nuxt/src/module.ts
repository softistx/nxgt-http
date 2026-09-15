/**
 * `@nxgt/openapi-nuxt`: the Nuxt module. It mounts a Hono app in Nitro under
 * a prefix, and gives the app a client bound to the spec, `useApi()`, which
 * during SSR calls that app in process.
 */
import { resolve } from 'node:path';
import {
	addImports,
	addPluginTemplate,
	addServerHandler,
	addServerImports,
	addServerTemplate,
	addTemplate,
	createResolver,
	defineNuxtModule,
	resolvePath,
	useLogger,
} from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import {
	type ClientOptions,
	clientTemplate,
	pluginTemplate,
	serverTemplate,
	useApiTemplate,
} from './templates';

export type { ClientOptions } from './templates';

/** The module's options, under `openapi` in `nuxt.config`. */
export interface ModuleOptions {
	/**
	 * The file whose default export is the Hono app (anything with a
	 * `fetch(request)`), relative to the app's root. The module serves it under
	 * `prefix`. Leave it out when the API is served elsewhere.
	 */
	server?: string;
	/**
	 * The generated `operations.ts`, relative to the app's root. The module
	 * binds `useApi()` to it. Leave it out for no client.
	 */
	operations?: string;
	/** The path the app is mounted under, taken off before it answers. Default: `/api`. */
	prefix?: string;
	/**
	 * The API elsewhere: the client calls it, from the server and the browser,
	 * instead of `prefix` on this app. SSR calls then leave the process, and
	 * carry no cookie of the incoming request.
	 */
	baseUrl?: string;
	/** What the client is created with. */
	client?: ClientOptions;
}

/** The Nitro handler's module id. */
const HANDLER = '#nxgt/openapi-nuxt/handler.mjs';

/** `/api/` and `api` are both `/api`; `/` names nothing to mount under. */
export function normalizePrefix(prefix: string): string {
	const trimmed = `/${prefix}`.replace(/\/+/g, '/').replace(/\/$/, '');
	if (trimmed === '' || /[?#]/.test(trimmed)) {
		throw new Error(
			`@nxgt/openapi-nuxt: prefix ${JSON.stringify(prefix)} names no path to mount the app under, such as /api`,
		);
	}
	return trimmed;
}

const openapiNuxt: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
	meta: {
		name: '@nxgt/openapi-nuxt',
		configKey: 'openapi',
		compatibility: { nuxt: '>=4.0.0' },
	},
	defaults: { prefix: '/api' },
	async setup(options, nuxt) {
		const logger = useLogger('@nxgt/openapi-nuxt');
		const prefix = normalizePrefix(options.prefix ?? '/api');
		const resolver = createResolver(import.meta.url);
		const runtime = await resolvePath(resolver.resolve('./runtime/index'));
		const fromRoot = (file: string) => resolve(nuxt.options.rootDir, file);

		// Imported only by the server's files that call it.
		addServerImports({
			name: 'createHonoApp',
			from: await resolvePath(resolver.resolve('./hono/index')),
		});

		if (options.server === undefined && options.operations === undefined) {
			logger.warn(
				'Neither `openapi.server` nor `openapi.operations` is set: there is nothing to serve and no client to bind.',
			);
			return;
		}

		if (options.server !== undefined) {
			const server = fromRoot(options.server);
			addServerTemplate({
				filename: HANDLER,
				getContents: () => serverTemplate({ server, prefix, runtime }),
			});
			addServerHandler({ route: prefix, handler: HANDLER });
			addServerHandler({ route: `${prefix}/**`, handler: HANDLER });
		}

		if (options.operations !== undefined) {
			const operations = fromRoot(options.operations);
			const client = addTemplate({
				filename: 'nxgt-openapi/client.ts',
				write: true,
				getContents: () =>
					clientTemplate({
						operations,
						prefix,
						runtime,
						baseUrl: options.baseUrl,
						client: options.client,
					}),
			});
			addPluginTemplate({
				filename: 'nxgt-openapi/plugin.ts',
				write: true,
				getContents: () => pluginTemplate(client.dst),
			});
			const useApi = addTemplate({
				filename: 'nxgt-openapi/use-api.ts',
				write: true,
				getContents: () => useApiTemplate(client.dst, runtime),
			});
			addImports([
				{ name: 'useApi', from: useApi.dst },
				{ name: 'useApiData', from: useApi.dst },
			]);
			// Nuxt's compiler appends a key to a call that gives none, as it
			// does for `useAsyncData`.
			nuxt.options.optimization.keyedComposables.push({
				name: 'useApiData',
				source: useApi.dst,
				argumentLength: 3,
			});
		}
	},
});

export default openapiNuxt;

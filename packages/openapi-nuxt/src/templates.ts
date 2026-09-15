/**
 * The files the module writes into the app, as text: the Nitro handler that
 * serves the Hono app, and on the app side the bound client, its plugin and
 * `useApi()`. Paths arrive absolute, already resolved against the app.
 */

/** What the client is created with, written into the app as a literal. */
export interface ClientOptions {
	/** As `createOpenApiClient` takes it. Default: both. */
	readonly validate?:
		| boolean
		| { readonly request?: boolean; readonly response?: boolean };
	/** As `createOpenApiClient` takes it. Default: `true`. */
	readonly decode?: boolean;
}

const quote = (value: string): string => JSON.stringify(value);

/** A file imported as the bundler resolves it: without its `.ts`. */
export const importPath = (file: string): string =>
	file.replace(/\.(ts|mts)$/, '');

/** The Nitro handler: the Hono app, reached under `prefix`. */
export const serverTemplate = (input: {
	readonly server: string;
	readonly prefix: string;
	readonly runtime: string;
}): string => `import { defineEventHandler, toWebRequest } from 'h3';
import { serveUnder } from ${quote(input.runtime)};
import app from ${quote(importPath(input.server))};

export default defineEventHandler((event) =>
	serveUnder(app, ${quote(input.prefix)}, toWebRequest(event), { event }),
);
`;

/** The bound client, created for one request. */
export const clientTemplate = (input: {
	readonly operations: string;
	readonly prefix: string;
	readonly runtime: string;
	readonly baseUrl?: string;
	readonly client?: ClientOptions;
}): string => {
	const options =
		input.client && Object.keys(input.client).length > 0
			? `, ${JSON.stringify(input.client)} as const`
			: '';
	const baseUrl =
		input.baseUrl === undefined
			? ''
			: `\n\t\t\tbaseUrl: ${quote(input.baseUrl)},`;
	return `import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { apiHttpOptions, type RequestEventLike } from ${quote(input.runtime)};
import { operations } from ${quote(importPath(input.operations))};

/** The client bound to the spec, for the request \`event\` renders, or the browser. */
export const createApi = (event?: RequestEventLike) =>
	createOpenApiClient(
		createHttpClient(
			apiHttpOptions({
				prefix: ${quote(input.prefix)},${baseUrl}
				event,
			}),
		),
		operations${options},
	);

export type Api = ReturnType<typeof createApi>;
`;
};

/** The plugin: one client per request on the server, one in the browser. */
export const pluginTemplate = (
	client: string,
): string => `import { defineNuxtPlugin, useRequestEvent } from '#app';
import { createApi } from ${quote(importPath(client))};

export default defineNuxtPlugin({
	name: '@nxgt/openapi-nuxt',
	setup: () => ({
		provide: {
			api: createApi(import.meta.server ? useRequestEvent() : undefined),
		},
	}),
});
`;

/** `useApi()`, auto-imported. */
export const useApiTemplate = (
	client: string,
): string => `import { useNuxtApp } from '#app';
import type { Api } from ${quote(importPath(client))};

/** The client the plugin provides, bound to the spec. */
export const useApi = (): Api => useNuxtApp().$api as Api;
`;

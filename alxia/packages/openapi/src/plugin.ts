import { alxia, type RouteDefinition } from '@alxia/core';
import { type OpenApiDocument, type OpenApiOptions, openapi } from './document';

export interface DocsOptions extends OpenApiOptions {
	/** Where the document is served. `/openapi.json` by default. */
	readonly path?: `/${string}`;
	/**
	 * Where an API reference page, [Scalar](https://scalar.com), is served;
	 * `false` for none. `/docs` by default.
	 */
	readonly ui?: `/${string}` | false;
}

/**
 * A plugin that serves the OpenAPI document of `app`, and a page to read it.
 * The document is made at its first request, so it holds every route,
 * those declared after the plugin is used included.
 *
 * ```ts
 * const app = alxia().get(...);
 * app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));
 * ```
 */
export function docs(
	app: { readonly routes: readonly RouteDefinition[] },
	options: DocsOptions,
) {
	const path = options.path ?? '/openapi.json';
	const ui = options.ui ?? '/docs';
	const own = new Set<string>([path, ...(ui === false ? [] : [ui])]);
	let document: OpenApiDocument | undefined;
	const plugin = alxia().get(
		path,
		{ detail: { tags: ['docs'] } },
		({ reply }) => {
			document ??= openapi(app, {
				...options,
				exclude: (route) =>
					own.has(route.path) || (options.exclude?.(route) ?? false),
			});
			return reply(200, document);
		},
	);
	if (ui === false) return plugin;
	return plugin.get(ui, ({ reply }) =>
		reply(200, page(options.info.title, path), {
			headers: {
				'content-type': 'text/html;charset=utf-8',
				'content-security-policy': PAGE_POLICY,
			},
		}),
	);
}

/** What the reference page loads: Scalar from jsDelivr, and the document from here. */
const PAGE_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
	"style-src 'self' 'unsafe-inline' https:",
	"img-src 'self' data: https:",
	"font-src 'self' data: https:",
	"connect-src 'self'",
].join('; ');

function page(title: string, spec: string): string {
	const html = (text: string) =>
		text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${html(title)}</title>
</head>
<body>
<script id="api-reference" data-url="${html(spec)}"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}

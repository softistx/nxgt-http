/**
 * [Apollo Sandbox](https://www.apollographql.com/docs/graphos/platform/sandbox),
 * embedded: the page a browser gets at the endpoint when the IDE is
 * `apollo-sandbox`. `@nxgt/shared-graphql`'s `renderSandbox`, kept twice: the
 * endpoint is the URL the page was asked at, as there since nxgt-core#171.
 */

export interface SandboxOptions {
	/** The page's title. `Sandbox Explorer` by default. */
	readonly title?: string;
	/** The operation the Sandbox opens with. */
	readonly initialDocument?: string;
	/** Headers every operation sends, shown and editable in the Sandbox. */
	readonly initialHeaders?: Readonly<Record<string, string>>;
	/** Whether the Sandbox polls the schema as it changes. On by default. */
	readonly pollForSchemaUpdates?: boolean;
	/** Whether operations send the browser's cookies: a session cookie. On by default. */
	readonly includeCookies?: boolean;
}

/** What the page loads: the Sandbox's script, its frame, and operations to this server. */
export const SANDBOX_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://embeddable-sandbox.cdn.apollographql.com",
	"style-src 'self' 'unsafe-inline'",
	'frame-src https://sandbox.embed.apollographql.com',
	"img-src 'self' data: https:",
	"connect-src 'self'",
].join('; ');

/** The page, its endpoint `endpoint`. Every value is escaped into its JavaScript and HTML. */
export function renderSandbox(
	endpoint: string,
	options: SandboxOptions = {},
): string {
	const config = {
		target: '#sandbox',
		initialEndpoint: endpoint,
		initialState: {
			includeCookies: options.includeCookies ?? true,
			pollForSchemaUpdates: options.pollForSchemaUpdates ?? true,
			...(options.initialDocument === undefined
				? {}
				: { document: options.initialDocument }),
			...(options.initialHeaders === undefined
				? {}
				: { headers: options.initialHeaders }),
		},
		hideCookieToggle: false,
		endpointIsEditable: false,
	};
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${html(options.title ?? 'Sandbox Explorer')}</title>
<style>html, body { margin: 0; height: 100%; } #sandbox { position: absolute; inset: 0; }</style>
</head>
<body>
<div id="sandbox"></div>
<script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
<script>new window.EmbeddedSandbox(${script(config)});</script>
</body>
</html>`;
}

function html(text: string): string {
	return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** JSON that cannot close the `<script>` it is written in. */
function script(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

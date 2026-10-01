import { type Plugin, withHeaders } from '@alxia/core';

/** A header's value, or `false` to leave it out. */
type Setting = string | false;

export interface SecureHeadersOptions {
	/** Defaults to a policy for an API: nothing loads, nothing frames it. */
	readonly contentSecurityPolicy?: Setting;
	readonly strictTransportSecurity?: Setting;
	readonly xContentTypeOptions?: Setting;
	readonly xFrameOptions?: Setting;
	readonly referrerPolicy?: Setting;
	readonly crossOriginOpenerPolicy?: Setting;
	readonly crossOriginResourcePolicy?: Setting;
	readonly crossOriginEmbedderPolicy?: Setting;
	readonly originAgentCluster?: Setting;
	readonly xDnsPrefetchControl?: Setting;
	readonly xPermittedCrossDomainPolicies?: Setting;
	/** Off by default: a policy is the app's to write. */
	readonly permissionsPolicy?: Setting;
	/** Whether `X-Powered-By` and `Server` are removed. On by default. */
	readonly hidePoweredBy?: boolean;
}

const DEFAULTS = {
	'content-security-policy':
		"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'no-referrer',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'cross-origin-embedder-policy': false,
	'origin-agent-cluster': '?1',
	'x-dns-prefetch-control': 'off',
	'x-permitted-cross-domain-policies': 'none',
	'permissions-policy': false,
} as const satisfies Record<string, Setting>;

const OPTION: Record<keyof typeof DEFAULTS, keyof SecureHeadersOptions> = {
	'content-security-policy': 'contentSecurityPolicy',
	'strict-transport-security': 'strictTransportSecurity',
	'x-content-type-options': 'xContentTypeOptions',
	'x-frame-options': 'xFrameOptions',
	'referrer-policy': 'referrerPolicy',
	'cross-origin-opener-policy': 'crossOriginOpenerPolicy',
	'cross-origin-resource-policy': 'crossOriginResourcePolicy',
	'cross-origin-embedder-policy': 'crossOriginEmbedderPolicy',
	'origin-agent-cluster': 'originAgentCluster',
	'x-dns-prefetch-control': 'xDnsPrefetchControl',
	'x-permitted-cross-domain-policies': 'xPermittedCrossDomainPolicies',
	'permissions-policy': 'permissionsPolicy',
};

/**
 * Secure headers on every response, as a plugin. A header a route set
 * itself is kept: a page that needs its own `Content-Security-Policy` —
 * `@alxia/openapi`'s reference page — sets it.
 *
 * ```ts
 * app.use(secureHeaders({ contentSecurityPolicy: "default-src 'self'" }));
 * ```
 */
export function secureHeaders(options: SecureHeadersOptions = {}): Plugin {
	const headers: [string, string][] = [];
	for (const [name, fallback] of Object.entries(DEFAULTS) as [
		keyof typeof DEFAULTS,
		Setting,
	][]) {
		const setting = options[OPTION[name]];
		const value = setting === undefined ? fallback : setting;
		if (typeof value === 'string') headers.push([name, value]);
	}
	const hide = options.hidePoweredBy ?? true;
	return (app) =>
		app.onResponse((response) =>
			withHeaders(response, (current) => {
				for (const [name, value] of headers) {
					if (!current.has(name)) current.set(name, value);
				}
				if (hide) {
					current.delete('x-powered-by');
					current.delete('server');
				}
			}),
		);
}

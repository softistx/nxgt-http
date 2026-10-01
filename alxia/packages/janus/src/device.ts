import type { ResponseSettings } from '@alxia/core';

/** `@nxgt/janus-hono`'s name for it, so a device remembered by one is by the other. */
export const DEVICE_COOKIE = 'janus-device';

const MAX_AGE = 400 * 24 * 60 * 60;

export interface DeviceCookieOptions {
	readonly name?: string;
	readonly domain?: string;
	readonly path?: string;
	readonly sameSite?: 'lax' | 'strict' | 'none';
	readonly secure?: boolean;
	/** Seconds. Four hundred days, the most a browser keeps, by default. */
	readonly maxAge?: number;
}

/** The device token the request carries, for `signIn(…, { device })`: `null` when none. */
export function deviceOf(
	ctx: { readonly request: Request },
	options: Pick<DeviceCookieOptions, 'name'> = {},
): string | null {
	const cookies = new Bun.CookieMap(ctx.request.headers.get('cookie') ?? '');
	const value = cookies.get(options.name ?? DEVICE_COOKIE);
	return value === null || value === '' ? null : value;
}

/** Sets the device cookie, or sets it again so it lasts another `maxAge`. */
export function sendDevice(
	ctx: { readonly set: ResponseSettings },
	token: string,
	options: DeviceCookieOptions = {},
): void {
	ctx.set.cookies.set(options.name ?? DEVICE_COOKIE, token, {
		httpOnly: true,
		path: options.path ?? '/',
		sameSite: options.sameSite ?? 'lax',
		secure: options.secure ?? true,
		maxAge: options.maxAge ?? MAX_AGE,
		...(options.domain === undefined ? {} : { domain: options.domain }),
	});
}

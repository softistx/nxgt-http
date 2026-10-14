/**
 * What a `$ref` is, as data: the Reference Object test, the shape of a
 * resolved node, and the splitting of a `$ref` string into file and pointer.
 * Nothing here reads a file or collects a diagnostic.
 */
import type { Location } from './location';

/** What a Reference Object may carry besides `$ref`: overrides, not schema. */
const REFERENCE_KEYS = new Set(['$ref', 'summary', 'description']);

const REMOTE = /^[a-z][a-z\d+.-]*:/i;

export type Reference = {
	$ref: string;
	summary?: unknown;
	description?: unknown;
};

/** An object that is nothing but a `$ref` — a hop to follow, not a node. */
export function isReference(value: unknown): value is Reference {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const object = value as Record<string, unknown>;
	return (
		typeof object['$ref'] === 'string' &&
		Object.keys(object).every((key) => REFERENCE_KEYS.has(key))
	);
}

export interface Resolved<T = unknown> {
	value: T;
	/** Where `value` really lives, after every `$ref` hop. */
	location: Location;
	/** `locationId(location)`: equal for every route to the same node. */
	id: string;
	/** Where each hop landed, in order; empty when `value` was no reference. */
	hops: Location[];
	/** Written next to the outermost `$ref` that has one; overrides the target's. */
	summary?: string | undefined;
	description?: string | undefined;
}

/** The key a `$ref` string is stored under, per file it is written in. */
export const refKey = (file: string, ref: string) => `${file}\0${ref}`;

export type SplitRef =
	| { path: string; pointer: string }
	| { code: 'remote_ref' | 'invalid_ref'; message: string };

/** A `$ref` string as a relative file path (maybe empty) and a JSON pointer. */
export function splitRef(ref: string): SplitRef {
	if (REMOTE.test(ref)) {
		return {
			code: 'remote_ref',
			message: `$ref "${ref}" is not a relative file; remote and URN references are not supported`,
		};
	}
	const hash = ref.indexOf('#');
	let path: string;
	let pointer: string;
	try {
		path = decodeURIComponent(hash === -1 ? ref : ref.slice(0, hash));
		pointer = decodeURIComponent(hash === -1 ? '' : ref.slice(hash + 1));
	} catch {
		return {
			code: 'invalid_ref',
			message: `$ref "${ref}" is not a valid URI reference`,
		};
	}
	if (pointer !== '' && !pointer.startsWith('/')) {
		return {
			code: 'invalid_ref',
			message: `$ref "${ref}": only JSON pointer fragments (#/…) are supported, not anchors`,
		};
	}
	return { path, pointer };
}

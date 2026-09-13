import { dirname, resolve } from 'node:path';
import { Diagnostics } from '../errors';
import { type FileSystem, isNotFound } from './fs';
import { child, type Location, locationId } from './location';
import { ParseFailure, parseDocument } from './parse';
import { lookup } from './pointer';

/**
 * Keys whose value is literal data. A `{ $ref }` inside an `example` is an
 * example payload, not a reference, and following it would report a missing
 * file that was never meant to exist.
 */
const LITERAL_KEYS = new Set([
	'example',
	'default',
	'const',
	'enum',
	'value',
	'dataValue',
	'serializedValue',
]);

/**
 * Keys whose value maps user-chosen names to objects. One level inside, a key
 * is a name: a property called `default` or `example` is a schema there, not
 * a keyword to skip.
 */
const NAME_MAP_KEYS = new Set([
	'paths',
	'webhooks',
	'schemas',
	'responses',
	'parameters',
	'examples',
	'requestBodies',
	'headers',
	'securitySchemes',
	'links',
	'callbacks',
	'pathItems',
	'mediaTypes',
	'properties',
	'patternProperties',
	'$defs',
	'definitions',
	'dependentSchemas',
	'content',
	'encoding',
	'variables',
]);

/** What a Reference Object may carry besides `$ref`: overrides, not schema. */
const REFERENCE_KEYS = new Set(['$ref', 'summary', 'description']);

const REMOTE = /^[a-z][a-z\d+.-]*:/i;

type Reference = { $ref: string; summary?: unknown; description?: unknown };

/** An object that is nothing but a `$ref` — a hop to follow, not a node. */
export function isReference(value: unknown): value is Reference {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const object = value as Record<string, unknown>;
	return (
		typeof object.$ref === 'string' &&
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
	summary?: string;
	description?: string;
}

const refKey = (file: string, ref: string) => `${file}\0${ref}`;

/**
 * Loads the files of a spec and resolves `$ref`s between them.
 *
 * `crawl` does the asynchronous part once — every reachable file read, every
 * `$ref` checked, every problem collected into `diagnostics` rather than thrown
 * — so that everything after it (`get`, `target`, `deref`) is synchronous and
 * cannot fail on a document the crawl accepted.
 *
 * A relative `$ref` resolves against the real path of the file it is written
 * in, the way Node resolves modules: a fragment inside a symlinked
 * `node_modules` package refers to its siblings where they really are.
 */
export class Resolver {
	readonly diagnostics = new Diagnostics();
	readonly #fs: FileSystem;
	readonly #documents = new Map<string, Record<string, unknown>>();
	readonly #realpaths = new Map<string, string | null>();
	readonly #unreadable = new Set<string>();
	readonly #targets = new Map<string, Location>();
	readonly #visited = new Set<string>();
	readonly #cycles = new Set<string>();

	constructor(fs: FileSystem) {
		this.#fs = fs;
	}

	/** Every file loaded so far, by real path. */
	get files(): ReadonlyMap<string, Record<string, unknown>> {
		return this.#documents;
	}

	/** Reads one file. `site` is where it was asked for, for the diagnostic. */
	async load(path: string, site?: Location): Promise<Location | undefined> {
		const file = await this.#realpath(path, site);
		if (file === undefined || this.#unreadable.has(file)) return undefined;
		if (!this.#documents.has(file)) {
			try {
				this.#documents.set(
					file,
					parseDocument(await this.#fs.readText(file), file),
				);
			} catch (error) {
				if (!(error instanceof ParseFailure)) throw error;
				this.#unreadable.add(file);
				this.diagnostics.error(error.code, error.message, {
					file,
					pointer: '',
				});
				return undefined;
			}
		}
		return { file, pointer: '' };
	}

	/** Loads everything reachable from `start` and checks every `$ref` on the way. */
	async crawl(start: Location): Promise<void> {
		await this.#visit(start);
		this.#checkCycles();
	}

	/** The node at `at`. Only valid for locations the crawl reached. */
	get(at: Location): unknown {
		const document = this.#documents.get(at.file);
		const found = document && lookup(document, at.pointer);
		if (!found?.found) throw new Error(`nothing at ${locationId(at)}`);
		return found.value;
	}

	/** Where `$ref` written in `file` lands. Only valid for refs the crawl saw. */
	target(ref: string, file: string): Location {
		const target = this.#targets.get(refKey(file, ref));
		if (!target) throw new Error(`$ref "${ref}" in ${file} was never crawled`);
		return target;
	}

	/**
	 * Follows `value` through every pure `$ref` to the node it stands for. A
	 * one-line file that only redirects to a shared fragment collapses to that
	 * fragment, so it is one schema however many redirects lead to it.
	 */
	deref<T = unknown>(value: unknown, at: Location): Resolved<T> {
		let current = value;
		let location = at;
		const hops: Location[] = [];
		let summary: string | undefined;
		let description: string | undefined;
		while (isReference(current)) {
			if (typeof current.summary === 'string') summary ??= current.summary;
			if (typeof current.description === 'string') {
				description ??= current.description;
			}
			location = this.target(current.$ref, location.file);
			// The crawl reported any cycle as an error; this only guards a caller
			// that derefs a document the crawl rejected.
			if (hops.some((hop) => locationId(hop) === locationId(location))) {
				throw new Error(`$ref cycle through ${locationId(location)}`);
			}
			hops.push(location);
			current = this.get(location);
		}
		return {
			value: current as T,
			location,
			id: locationId(location),
			hops,
			summary,
			description,
		};
	}

	async #realpath(path: string, site?: Location): Promise<string | undefined> {
		const cached = this.#realpaths.get(path);
		if (cached) return cached;
		if (cached === undefined) {
			try {
				const real = await this.#fs.realpath(path);
				this.#realpaths.set(path, real);
				return real;
			} catch (error) {
				if (!isNotFound(error)) throw error;
				this.#realpaths.set(path, null);
			}
		}
		// Reported at every site that asks, so each broken `$ref` is listed.
		this.diagnostics.error(
			'file_not_found',
			`cannot find ${path}`,
			site ?? { file: path, pointer: '' },
		);
		return undefined;
	}

	async #visit(at: Location): Promise<void> {
		const id = locationId(at);
		if (this.#visited.has(id)) return;
		this.#visited.add(id);
		const document = this.#documents.get(at.file);
		const found = document && lookup(document, at.pointer);
		if (found?.found) await this.#walk(found.value, at, false);
	}

	async #walk(node: unknown, at: Location, names: boolean): Promise<void> {
		if (Array.isArray(node)) {
			for (const [index, item] of node.entries()) {
				await this.#walk(item, child(at, index), false);
			}
			return;
		}
		if (node === null || typeof node !== 'object') return;
		const object = node as Record<string, unknown>;
		if (!names && '$ref' in object) await this.#follow(object.$ref, at);
		for (const [key, value] of Object.entries(object)) {
			if (names) {
				await this.#walk(value, child(at, key), false);
				continue;
			}
			if (key === '$ref' || key.startsWith('x-') || LITERAL_KEYS.has(key)) {
				continue;
			}
			// JSON Schema `examples` is a list of literal values; OpenAPI's is a
			// map of Example Objects, which may themselves be `$ref`s.
			if (key === 'examples' && Array.isArray(value)) continue;
			await this.#walk(value, child(at, key), NAME_MAP_KEYS.has(key));
		}
	}

	async #follow(ref: unknown, site: Location): Promise<void> {
		const at = child(site, '$ref');
		if (typeof ref !== 'string') {
			this.diagnostics.error('invalid_ref', '$ref must be a string', at);
			return;
		}
		const target = await this.#locate(ref, site, at);
		if (!target) return;
		const document = this.#documents.get(target.file);
		if (!document || !lookup(document, target.pointer).found) {
			this.diagnostics.error(
				'pointer_not_found',
				`$ref "${ref}" points at nothing: ${target.pointer || '(root)'} does not exist in ${target.file}`,
				at,
			);
			return;
		}
		this.#targets.set(refKey(site.file, ref), target);
		await this.#visit(target);
	}

	async #locate(
		ref: string,
		site: Location,
		at: Location,
	): Promise<Location | undefined> {
		if (REMOTE.test(ref)) {
			this.diagnostics.error(
				'remote_ref',
				`$ref "${ref}" is not a relative file; remote and URN references are not supported`,
				at,
			);
			return undefined;
		}
		const hash = ref.indexOf('#');
		let path: string;
		let pointer: string;
		try {
			path = decodeURIComponent(hash === -1 ? ref : ref.slice(0, hash));
			pointer = decodeURIComponent(hash === -1 ? '' : ref.slice(hash + 1));
		} catch {
			this.diagnostics.error(
				'invalid_ref',
				`$ref "${ref}" is not a valid URI reference`,
				at,
			);
			return undefined;
		}
		if (pointer !== '' && !pointer.startsWith('/')) {
			this.diagnostics.error(
				'invalid_ref',
				`$ref "${ref}": only JSON pointer fragments (#/…) are supported, not anchors`,
				at,
			);
			return undefined;
		}
		if (path === '') return { file: site.file, pointer };
		const loaded = await this.load(resolve(dirname(site.file), path), at);
		return loaded && { file: loaded.file, pointer };
	}

	/**
	 * A chain of pure `$ref`s that comes back on itself stands for nothing.
	 * A schema that contains a `$ref` to itself is fine — that is recursion, and
	 * never reaches here, because its node is not a pure reference.
	 */
	#checkCycles(): void {
		for (const start of this.#targets.values()) {
			const path: string[] = [];
			let at: Location | undefined = start;
			while (at) {
				const id = locationId(at);
				const index = path.indexOf(id);
				if (index !== -1) {
					const cycle = path.slice(index);
					const key = [...cycle].sort().join('\n');
					if (!this.#cycles.has(key)) {
						this.#cycles.add(key);
						this.diagnostics.error(
							'ref_cycle',
							`$ref cycle: ${[...cycle, cycle[0]].join(' → ')}`,
							at,
						);
					}
					break;
				}
				path.push(id);
				const document = this.#documents.get(at.file);
				const found: ReturnType<typeof lookup> | undefined =
					document && lookup(document, at.pointer);
				const value: unknown = found?.found ? found.value : undefined;
				at = isReference(value)
					? this.#targets.get(refKey(at.file, value.$ref))
					: undefined;
			}
		}
	}
}

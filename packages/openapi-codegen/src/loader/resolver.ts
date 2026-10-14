import { dirname, resolve } from 'node:path';
import { Diagnostics } from '../errors';
import { findRefCycles } from './cycles';
import { type FileSystem, isNotFound } from './fs';
import { child, type Location, locationId } from './location';
import { ParseFailure, parseDocument } from './parse';
import { lookup } from './pointer';
import { isReference, type Resolved, refKey, splitRef } from './reference';
import { steps } from './walk';

export { isReference, type Resolved };

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
		for (const step of steps(node, at, names)) {
			if ('ref' in step) await this.#follow(step.ref, step.at);
			else await this.#walk(step.node, step.at, step.names);
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
		const split = splitRef(ref);
		if ('code' in split) {
			this.diagnostics.error(split.code, split.message, at);
			return undefined;
		}
		const { path, pointer } = split;
		if (path === '') return { file: site.file, pointer };
		const loaded = await this.load(resolve(dirname(site.file), path), at);
		return loaded && { file: loaded.file, pointer };
	}

	/** Reports each cycle of pure `$ref`s once, however many routes lead in. */
	#checkCycles(): void {
		for (const { ids, at } of findRefCycles(this.#targets, this.#documents)) {
			const key = [...ids].sort().join('\n');
			if (this.#cycles.has(key)) continue;
			this.#cycles.add(key);
			this.diagnostics.error(
				'ref_cycle',
				`$ref cycle: ${[...ids, ids[0]].join(' → ')}`,
				at,
			);
		}
	}
}

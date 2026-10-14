/**
 * Finds chains of pure `$ref`s that come back on themselves, in the targets a
 * crawl recorded. Pure: the resolver reports what it returns.
 */
import { type Location, locationId } from './location';
import { lookup } from './pointer';
import { isReference, refKey } from './reference';

export interface RefCycle {
	/** The location ids around the cycle, starting where it was entered. */
	ids: string[];
	/** Where the walk closed the loop. */
	at: Location;
}

/**
 * A chain of pure `$ref`s that comes back on itself stands for nothing.
 * A schema that contains a `$ref` to itself is fine — that is recursion, and
 * never reaches here, because its node is not a pure reference. The same cycle
 * reached from several starts is returned each time; the caller dedupes.
 */
export function* findRefCycles(
	targets: ReadonlyMap<string, Location>,
	documents: ReadonlyMap<string, Record<string, unknown>>,
): Generator<RefCycle> {
	for (const start of targets.values()) {
		const path: string[] = [];
		let at: Location | undefined = start;
		while (at) {
			const id = locationId(at);
			const index = path.indexOf(id);
			if (index !== -1) {
				yield { ids: path.slice(index), at };
				break;
			}
			path.push(id);
			const document = documents.get(at.file);
			const found: ReturnType<typeof lookup> | undefined =
				document && lookup(document, at.pointer);
			const value: unknown = found?.found ? found.value : undefined;
			at = isReference(value)
				? targets.get(refKey(at.file, value.$ref))
				: undefined;
		}
	}
}

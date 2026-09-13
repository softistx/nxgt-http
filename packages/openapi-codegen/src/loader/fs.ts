import { realpath } from 'node:fs/promises';
import { posix } from 'node:path';

/**
 * The two things the loader needs from a disk. Files are keyed by their real
 * path, so a fragment reached through a symlinked `node_modules` and through
 * its own path is loaded — and named — once.
 */
export interface FileSystem {
	readText(path: string): Promise<string>;
	/** Resolves symlinks; rejects with `code: 'ENOENT'` for a missing file. */
	realpath(path: string): Promise<string>;
}

export const nodeFileSystem: FileSystem = {
	readText: (path) => Bun.file(path).text(),
	realpath: (path) => realpath(path),
};

export const isNotFound = (error: unknown): boolean => {
	const code = (error as { code?: unknown } | null)?.code;
	return code === 'ENOENT' || code === 'ENOTDIR';
};

const notFound = (path: string) =>
	Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
		code: 'ENOENT',
	});

/**
 * An in-memory file system, for tests and for generating from a spec that
 * never touched a disk. `links` maps a directory to the directory it points
 * at, the way a workspace symlinks a package into `node_modules`.
 */
export function createMemoryFileSystem(
	files: Record<string, string>,
	links: Record<string, string> = {},
): FileSystem {
	const contents = new Map(
		Object.entries(files).map(([path, text]) => [
			posix.resolve('/', path),
			text,
		]),
	);
	const redirects = Object.entries(links).map(
		([from, to]) => [posix.resolve('/', from), posix.resolve('/', to)] as const,
	);

	const follow = (path: string): string => {
		let current = posix.resolve('/', path);
		for (let hops = 0; hops < 40; hops++) {
			const link = redirects.find(
				([from]) => current === from || current.startsWith(`${from}/`),
			);
			if (!link) return current;
			current = link[1] + current.slice(link[0].length);
		}
		throw notFound(path);
	};

	return {
		async realpath(path) {
			const real = follow(path);
			if (!contents.has(real)) throw notFound(path);
			return real;
		},
		async readText(path) {
			const text = contents.get(follow(path));
			if (text === undefined) throw notFound(path);
			return text;
		},
	};
}

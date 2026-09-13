import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { GeneratedFile } from '../emit';
import { isNotFound } from '../loader/fs';

export interface WriteResult {
	written: string[];
	/** Already as generated, so not touched: a watcher sees no change. */
	unchanged: string[];
	/** In check mode, the files that differ from what would be generated, or are missing. */
	drifted: string[];
}

/**
 * Writes each file whose content changed. With `check`, writes nothing and
 * reports what would change instead — for CI.
 */
export async function writeFiles(
	files: readonly GeneratedFile[],
	{ check = false }: { check?: boolean } = {},
): Promise<WriteResult> {
	const result: WriteResult = { written: [], unchanged: [], drifted: [] };
	for (const file of files) {
		if ((await current(file.path)) === file.content) {
			result.unchanged.push(file.path);
		} else if (check) {
			result.drifted.push(file.path);
		} else {
			await mkdir(dirname(file.path), { recursive: true });
			await writeFile(file.path, file.content);
			result.written.push(file.path);
		}
	}
	return result;
}

async function current(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

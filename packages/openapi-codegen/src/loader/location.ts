import { appendPointer } from './pointer';

/** A node in a loaded file: the file's real path and a JSON pointer into it. */
export interface Location {
	readonly file: string;
	readonly pointer: string;
}

/** Canonical identity of a node — two routes to the same schema share it. */
export const locationId = (at: Location): string => `${at.file}#${at.pointer}`;

export const child = (
	at: Location,
	...tokens: readonly (string | number)[]
): Location => ({
	file: at.file,
	pointer: appendPointer(at.pointer, ...tokens),
});

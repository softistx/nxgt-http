import type { Entry } from './entry';

// No scalar holds an object, an array or nothing: TypeSpec writes them.
export const value: readonly Entry[] = [
	{ name: 'JSON', builtin: 'unknown' },
	{ name: 'JSONObject', builtin: 'Record<unknown>' },
	{ name: 'Void', builtin: 'void' },
];

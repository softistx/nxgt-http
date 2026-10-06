export const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

export const asString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

export const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' ? value : undefined;

export const without = (
	object: Record<string, unknown>,
	drop: (key: string) => boolean,
): Record<string, unknown> =>
	Object.fromEntries(Object.entries(object).filter(([key]) => !drop(key)));

export const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

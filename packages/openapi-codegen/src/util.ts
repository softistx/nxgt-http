export const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

export const asString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

export const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' ? value : undefined;

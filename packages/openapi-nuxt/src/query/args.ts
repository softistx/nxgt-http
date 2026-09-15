/**
 * How `useApiQuery` reads its arguments, and the refs in them. Nothing here
 * imports TanStack's packages.
 */
import type { RuntimeOperation } from '@nxgt/openapi-httpyz';
import { type MaybeRefOrGetter, toValue } from 'vue';

/**
 * A value, or a ref or a getter of it, and so on for each of its fields: what
 * `useApiQuery` takes as an operation's input. A query reads it again when one
 * of its refs changes.
 */
export type MaybeRefDeep<T> = MaybeRefOrGetter<
	T extends Date | ((...args: never[]) => unknown)
		? T
		: T extends object
			? { [K in keyof T]: MaybeRefDeep<T[K]> }
			: T
>;

/** Whether the operation at `method path` takes an input, as the bound client reads its arguments. */
export function takesInput(
	operations: object,
	method: string,
	path: string,
): boolean {
	for (const operation of Object.values(
		operations as Record<string, RuntimeOperation>,
	)) {
		if (operation.method !== method || operation.path !== path) continue;
		return (
			operation.parameters.length > 0 ||
			Object.keys(operation.body?.content ?? {}).length > 0
		);
	}
	throw new Error(
		`@nxgt/openapi-nuxt: the spec has no ${method.toUpperCase()} ${path} operation`,
	);
}

/** `useApiQuery`'s arguments after the path: the input, when the operation takes one, then the options. */
export function queryArgs(
	operations: object,
	method: string,
	path: string,
	args: readonly unknown[],
): { takes: boolean; input: unknown; options: unknown } {
	const takes = takesInput(operations, method, path);
	return takes
		? { takes, input: args[0], options: args[1] }
		: { takes, input: undefined, options: args[0] };
}

const plain = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== 'object' || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * `value` with every ref and getter in it read, in arrays and plain objects:
 * a `Date`, a `Blob` or a `FormData` is kept as it is. Read inside a query's
 * options, each ref it reads is one the query follows.
 */
export function unrefDeep(value: unknown): unknown {
	const read = toValue(value);
	if (Array.isArray(read)) return read.map(unrefDeep);
	if (plain(read)) {
		return Object.fromEntries(
			Object.entries(read).map(([key, field]) => [key, unrefDeep(field)]),
		);
	}
	return read;
}

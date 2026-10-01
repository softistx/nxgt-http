/**
 * What `value` reads as once it has crossed the wire: what `JSON.stringify`
 * makes of it, then `JSON.parse`. A `Date` is a string, a function is gone,
 * and a binary body is a `Blob`.
 */
export type Jsonify<Value> = Value extends
	| Blob
	| ReadableStream
	| ArrayBuffer
	| ArrayBufferView
	? Blob
	: Value extends { toJSON(): infer Json }
		? Jsonify<Json>
		: Value extends string | number | boolean | null | undefined
			? Value
			: Value extends bigint | symbol | ((...args: never[]) => unknown)
				? never
				: Value extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
					? Record<string, never>
					: Value extends readonly unknown[]
						? { -readonly [Index in keyof Value]: Jsonify<Value[Index]> }
						: {
								-readonly [Key in keyof Value as Key extends symbol
									? never
									: Value[Key] extends
												| bigint
												| symbol
												| ((...args: never[]) => unknown)
										? never
										: Key]: Jsonify<Value[Key]>;
							};

/** An object type with its intersections flattened, for readable hovers. */
export type Simplify<Value> = { [Key in keyof Value]: Value[Key] } & {};

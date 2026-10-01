/** The shape of `@alxia/openapi`'s `Converter`, without importing it. */
type Side = 'input' | 'output';
type JsonSchema = Record<string, unknown>;

interface ZodLike {
	readonly '~standard': {
		readonly vendor: string;
		readonly jsonSchema?: {
			readonly input: (options: Record<string, unknown>) => JsonSchema;
			readonly output: (options: Record<string, unknown>) => JsonSchema;
		};
	};
}

interface ZodContext {
	readonly zodSchema: {
		readonly _zod?: { readonly def?: { readonly type?: string } };
	};
	readonly jsonSchema: JsonSchema;
}

/**
 * A Zod schema as JSON Schema 2020-12, as it crosses the wire: a `Date` is a
 * `date-time` string, a `bigint` an integer, and anything JSON Schema cannot
 * say is documented as anything instead of failing the whole schema.
 *
 * A schema of another vendor is left to the default conversion. Give it to
 * `@alxia/openapi`:
 *
 * ```ts
 * openapi(app, { info, convert: zodConverter });
 * ```
 */
export function zodConverter(
	schema: ZodLike,
	side: Side,
): JsonSchema | undefined {
	const standard = schema['~standard'];
	if (standard.vendor !== 'zod' || standard.jsonSchema === undefined) {
		return undefined;
	}
	return standard.jsonSchema[side]({
		target: 'draft-2020-12',
		libraryOptions: {
			unrepresentable: 'any',
			override: (ctx: ZodContext) => {
				const type = ctx.zodSchema._zod?.def?.type;
				if (type === 'date') {
					ctx.jsonSchema['type'] = 'string';
					ctx.jsonSchema['format'] = 'date-time';
				} else if (type === 'bigint') {
					ctx.jsonSchema['type'] = 'integer';
				}
			},
		},
	});
}

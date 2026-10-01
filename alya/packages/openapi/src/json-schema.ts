import type { StandardSchemaV1 } from '@alya/server';

export type JsonSchema = Record<string, unknown>;

/** Which side of a schema: what it accepts, or what it gives back. */
export type Side = 'input' | 'output';

/** Turns a schema into JSON Schema, for a vendor without Standard JSON Schema. */
export type Converter = (
	schema: StandardSchemaV1,
	side: Side,
) => JsonSchema | undefined;

interface StandardJsonSchema {
	readonly jsonSchema?: {
		readonly input: (options: Record<string, unknown>) => JsonSchema;
		readonly output: (options: Record<string, unknown>) => JsonSchema;
	};
}

/**
 * Zod's own options: a `Date` goes over the wire as an ISO string, which is
 * what the client reads, so that is what is documented; anything else JSON
 * Schema cannot say is documented as anything rather than thrown on.
 */
const ZOD_OPTIONS = {
	unrepresentable: 'any',
	override: (ctx: {
		zodSchema: { _zod?: { def?: { type?: string } } };
		jsonSchema: JsonSchema;
	}) => {
		if (ctx.zodSchema._zod?.def?.type === 'date') {
			ctx.jsonSchema['type'] = 'string';
			ctx.jsonSchema['format'] = 'date-time';
		}
	},
};

/**
 * `schema` as JSON Schema 2020-12, the dialect of OpenAPI 3.1, through
 * [Standard JSON Schema](https://standardschema.dev): Zod 4.2 and later,
 * ArkType and Valibot carry it. `convert` is tried first; a schema neither
 * converts is documented as `{}`, anything.
 */
export function toJsonSchema(
	schema: StandardSchemaV1,
	side: Side,
	convert?: Converter,
): JsonSchema {
	const converted = convert?.(schema, side);
	if (converted !== undefined) return clean(converted);
	const standard = schema['~standard'] as StandardJsonSchema;
	if (standard.jsonSchema === undefined) return {};
	const options: Record<string, unknown> = { target: 'draft-2020-12' };
	if (schema['~standard'].vendor === 'zod') {
		options['libraryOptions'] = ZOD_OPTIONS;
	}
	try {
		return clean(standard.jsonSchema[side](options));
	} catch {
		return {};
	}
}

function clean(schema: JsonSchema): JsonSchema {
	const { $schema: _, ...rest } = schema;
	return rest;
}

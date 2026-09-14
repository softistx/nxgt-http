/**
 * [Standard Schema](https://standardschema.dev), the part the client calls.
 * Zod 4, Valibot and ArkType schemas all carry it, so the client imports
 * none of them: it reads their `~standard`.
 */
import type { ValidationIssue } from '../errors/errors';

export interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
		) => StandardResult<Output> | Promise<StandardResult<Output>>;
		readonly types?:
			| { readonly input: Input; readonly output: Output }
			| undefined;
	};
}

export type StandardResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: readonly StandardIssue[] };

export interface StandardIssue {
	readonly message: string;
	readonly path?:
		| readonly (PropertyKey | { readonly key: PropertyKey })[]
		| undefined;
}

/** What a schema accepts. */
export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
	Schema['~standard']['types']
>['input'];

/** What a schema gives back. */
export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
	Schema['~standard']['types']
>['output'];

export type Checked =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly issues: ValidationIssue[] };

/**
 * `value` through `schema`: its output, or its issues as `/hono` reports
 * them. Zod's `code` is kept; a vendor without one reads as `custom`.
 */
export async function check(
	schema: StandardSchemaV1,
	value: unknown,
	target: ValidationIssue['target'],
): Promise<Checked> {
	const result = await schema['~standard'].validate(value);
	if (result.issues === undefined) return { ok: true, value: result.value };
	return {
		ok: false,
		issues: result.issues.map((issue) => {
			const { code } = issue as { code?: unknown };
			return {
				target,
				path: (issue.path ?? [])
					.map((key) => (typeof key === 'object' ? key.key : key))
					.filter((key): key is string | number => typeof key !== 'symbol'),
				code: typeof code === 'string' ? code : 'custom',
				message: issue.message,
			};
		}),
	};
}

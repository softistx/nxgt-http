/**
 * Environment variables, validated once, at startup, with any Standard
 * Schema: a missing or malformed one stops the process with every issue,
 * not the first request that reads it.
 */

interface StandardIssue {
	readonly message: string;
	readonly path?:
		| readonly (PropertyKey | { readonly key: PropertyKey })[]
		| undefined;
}

type StandardResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: readonly StandardIssue[] };

/** [Standard Schema](https://standardschema.dev): Zod, Valibot, ArkType. */
interface StandardSchema<Output> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
		) => StandardResult<Output> | Promise<StandardResult<Output>>;
		readonly types?:
			| { readonly input: unknown; readonly output: Output }
			| undefined;
	};
}

type OutputOf<Schema extends StandardSchema<unknown>> = NonNullable<
	Schema['~standard']['types']
>['output'];

/** Every variable the schema refused. */
export class EnvError extends Error {
	override readonly name = 'EnvError';
	readonly issues: readonly {
		readonly path: string;
		readonly message: string;
	}[];

	constructor(
		issues: readonly { readonly path: string; readonly message: string }[],
	) {
		super(
			`The environment is invalid:\n${issues
				.map((issue) => `  ${issue.path || '(root)'}: ${issue.message}`)
				.join('\n')}`,
		);
		this.issues = issues;
	}
}

/**
 * `source` — `Bun.env` by default — checked by `schema`, its output typed.
 * Throws an `EnvError` naming every refused variable. The schema must be
 * synchronous: the environment is read before anything awaits.
 *
 * ```ts
 * export const env = parseEnv(z.object({ PORT: z.coerce.number().default(3000), DATABASE_URL: z.url() }));
 * ```
 */
export function parseEnv<Schema extends StandardSchema<unknown>>(
	schema: Schema,
	source: Record<string, string | undefined> = Bun.env,
): OutputOf<Schema> {
	const result = schema['~standard'].validate({ ...source });
	if (result instanceof Promise) {
		throw new TypeError('parseEnv(): the schema must validate synchronously');
	}
	const checked = result;
	if (checked.issues !== undefined) {
		throw new EnvError(
			checked.issues.map((issue) => ({
				path: (issue.path ?? [])
					.map((key) => String(typeof key === 'object' ? key.key : key))
					.join('.'),
				message: issue.message,
			})),
		);
	}
	return Object.freeze(checked.value) as OutputOf<Schema>;
}

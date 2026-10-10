/**
 * The emitter `@nxgt/typespec`: `@typespec/openapi3`, with its options,
 * checked by its own schema, and its files, and each `POST` marked
 * `@queryMethod` a real `QUERY` in an OpenAPI 3.2 document
 * (`query-operations.ts`). Only 3.2 has a `QUERY`: a marked operation with
 * an older version asked for is an error, and nothing is emitted.
 * `@typespec/openapi3` is loaded only here, so a spec that only imports the
 * library does not need it.
 */
import {
	type CompilerHost,
	type Diagnostic,
	type EmitContext,
	NoTarget,
} from '@typespec/compiler';
import { $lib } from './lib';
import { queryMethods } from './query-method';
import { withQueryOperations } from './query-operations';

/** `@typespec/openapi3`'s default, when `openapi-versions` is not set. */
const DEFAULT_VERSIONS = ['3.0.0'];

type OpenAPI3 = typeof import('@typespec/openapi3');

/**
 * `@typespec/openapi3`'s options checked by its own schema, as the compiler
 * checks them under its name: `createTypeSpecLibrary` gives each library an
 * `emitterOptionValidator`, which its types leave out.
 */
function invalidOptions(
	openapi3: OpenAPI3,
	options: unknown,
): readonly Diagnostic[] {
	const lib: object = openapi3.$lib;
	const validator =
		'emitterOptionValidator' in lib ? lib.emitterOptionValidator : undefined;
	if (
		typeof validator !== 'object' ||
		validator === null ||
		!('validate' in validator) ||
		typeof validator.validate !== 'function'
	) {
		return [];
	}
	return validator.validate(options, NoTarget);
}

async function loadOpenAPI3(
	context: EmitContext,
): Promise<OpenAPI3 | undefined> {
	try {
		return await import('@typespec/openapi3');
	} catch {
		$lib.reportDiagnostic(context.program, {
			code: 'openapi3-missing',
			target: NoTarget,
		});
		return undefined;
	}
}

/** Whether every version asked for has a `QUERY`; each marked operation is reported otherwise. */
function queriesFit(context: EmitContext): boolean {
	const { program } = context;
	const marked = queryMethods(program);
	if (marked.length === 0) return true;
	const versions =
		(context.options['openapi-versions'] as string[] | undefined) ??
		DEFAULT_VERSIONS;
	const older = versions.find((version) => !version.startsWith('3.2'));
	if (older === undefined) return true;
	for (const operation of marked) {
		$lib.reportDiagnostic(program, {
			code: 'query-method-needs-openapi-3.2',
			format: { operation: operation.name, version: older },
			target: operation,
		});
	}
	return false;
}

export async function $onEmit(context: EmitContext): Promise<void> {
	const openapi3 = await loadOpenAPI3(context);
	if (openapi3 === undefined) return;
	const { program } = context;
	// `@typespec/openapi3`'s schema: a typo or a bad value is refused, as
	// under its own name, instead of reaching it unchecked.
	const invalid = invalidOptions(openapi3, context.options);
	if (invalid.length > 0) {
		program.reportDiagnostics(invalid);
		return;
	}
	if (!queriesFit(context)) return;
	// Every file `@typespec/openapi3` writes goes through `program.host`: a
	// stand-in whose every call is the real host's, on the real host.
	const host = program.host;
	const writing = new Proxy(host, {
		get(target, key) {
			if (key === 'writeFile') {
				return (path: string, content: string) =>
					target.writeFile(path, withQueryOperations(content));
			}
			const value = Reflect.get(target, key, target);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	}) satisfies CompilerHost;
	program.host = writing;
	try {
		await openapi3.$onEmit(context as Parameters<OpenAPI3['$onEmit']>[0]);
	} finally {
		program.host = host;
	}
}

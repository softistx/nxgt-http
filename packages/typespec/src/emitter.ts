/**
 * The emitter `@nxgt/typespec`: `@typespec/openapi3`, with its options and
 * its files, and each `POST` marked `@queryMethod` a real `QUERY` in an
 * OpenAPI 3.2 document (`query-operations.ts`). `@typespec/openapi3` is
 * loaded only here, so a spec that only imports the library does not need it.
 */
import type { CompilerHost, EmitContext } from '@typespec/compiler';
import { withQueryOperations } from './query-operations';

export async function $onEmit(context: EmitContext): Promise<void> {
	const { $onEmit: emitOpenAPI3 } = await import('@typespec/openapi3');
	const { program } = context;
	const host = program.host;
	// Every file `@typespec/openapi3` writes goes through `program.host`.
	const writing: CompilerHost = Object.create(host);
	writing.writeFile = (path, content) =>
		host.writeFile(path, withQueryOperations(path, content));
	program.host = writing;
	try {
		await emitOpenAPI3(context as Parameters<typeof emitOpenAPI3>[0]);
	} finally {
		program.host = host;
	}
}

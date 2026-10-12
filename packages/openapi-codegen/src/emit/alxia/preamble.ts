import { nxgtImport } from '../nxgt-zod';
import { HELPERS } from '../operation/helpers';
import { list } from '../printer';
import { LOCALS, type Printing } from './printing';

const RUNTIME = '@alxia/core';

/** The imports, then the helpers the schemas call. */
export function preamble(printing: Printing): string[] {
	const { ctx } = printing;
	const imports: string[] = [];
	if (printing.eventStream) {
		imports.push(`import { eventStream } from '${RUNTIME}';`);
	}
	const helpers = [...printing.helpers];
	if (
		printing.imports.has('z') ||
		helpers.some((h) => h === 'numeric' || h === 'flag')
	) {
		imports.push("import { z } from 'zod';");
	}
	imports.push(...nxgtImport(printing.imports));
	if (printing.uses.size > 0) {
		const names = [...printing.uses]
			.map((id) => `z${ctx.schema(id).name}`)
			.sort();
		const ext = ctx.options.importExtension;
		imports.push(`import ${list('{ ', names, ' }', '')} from './zod${ext}';`);
	}
	if (printing.codecs.has('isoDate')) helpers.push('isoDate');
	return [
		...(imports.length > 0 ? [imports.join('\n')] : []),
		...helpers.sort().map((helper) => HELPERS[helper]),
		...[...printing.locals].sort().map((local) => LOCALS[local]),
	];
}

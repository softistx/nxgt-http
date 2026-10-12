import { CodegenError, type Diagnostic } from '../errors';
import type { Location } from '../loader/location';
import { ALXIA_NAMES, operationConst } from './alxia/names';
import type { EmitContext } from './context';
import { OPERATION_INDEXES, paramGroups } from './operation/keys';

/**
 * Every generated name, once. A schema's `XInput`, an operation's `XQuery`,
 * or a name `types.ts` and `hono.ts` declare themselves, can land
 * on a name a schema already has. Interfaces of one name would merge, not
 * fail, so this is the only place the clash is caught.
 */
export function checkNames(ctx: EmitContext): void {
	const types = new Map<string, string>();
	/** alxia.ts's values: a module of their own, beside the types. */
	const values = new Map<string, string>();
	const diagnostics: Diagnostic[] = [];
	const claim = (
		name: string,
		owner: string,
		at: Location,
		owners = types,
	): void => {
		const holder = owners.get(name);
		if (holder === undefined) {
			owners.set(name, owner);
			return;
		}
		const fix = [holder, owner].some((o) => o.startsWith('schema '))
			? 'Rename the schema with the `names` option'
			: 'Change the operationId';
		diagnostics.push({
			severity: 'error',
			code: 'name_collision',
			message: `${holder} and ${owner} would both generate ${name}. ${fix}`,
			file: at.file,
			pointer: at.pointer,
		});
	};
	const root = { file: ctx.options.rootDir, pointer: '' };
	for (const name of OPERATION_INDEXES) claim(name, 'types.ts', root);
	if (ctx.options.dates === 'date') claim('Wire', 'types.ts', root);
	if (ctx.options.hono) {
		// Declared or imported by hono.ts, which also imports schemas by name.
		for (const name of ['Replies', 'HonoSpec', 'Hono']) {
			claim(name, 'hono.ts', root);
		}
	}
	for (const schema of ctx.ir.schemas) {
		claim(schema.name, `schema ${schema.name}`, schema.location);
	}
	for (const alias of ctx.ir.aliases) {
		claim(alias.name, `schema ${alias.name}`, alias.location);
	}
	for (const schema of ctx.ir.schemas) {
		if (ctx.hasInput(schema.id)) {
			claim(`${schema.name}Input`, `schema ${schema.name}`, schema.location);
		}
	}
	for (const alias of ctx.ir.aliases) {
		if (ctx.hasInput(alias.target)) {
			claim(`${alias.name}Input`, `schema ${alias.name}`, alias.location);
		}
	}
	for (const operation of ctx.ir.operations) {
		const owner = `operation ${operation.operationId}`;
		for (const group of paramGroups(operation)) {
			claim(group.name, owner, operation.location);
		}
		if (ctx.formOf(operation)) {
			claim(`${operation.name}Form`, owner, operation.location);
		}
	}
	if (ctx.options.alxia) {
		// alxia.ts holds values, not types: its own names, the `z<Name>` it
		// imports from zod.ts, and one const per operation.
		for (const name of ALXIA_NAMES) claim(name, 'alxia.ts', root, values);
		for (const schema of ctx.ir.schemas) {
			const owner = `schema ${schema.name}`;
			claim(`z${schema.name}`, owner, schema.location, values);
		}
		for (const alias of ctx.ir.aliases) {
			const owner = `schema ${alias.name}`;
			claim(`z${alias.name}`, owner, alias.location, values);
		}
		for (const operation of ctx.ir.operations) {
			const owner = `operation ${operation.operationId}`;
			claim(operationConst(operation), owner, operation.location, values);
		}
	}
	if (diagnostics.length > 0) {
		throw new CodegenError(diagnostics, ctx.options.rootDir);
	}
}

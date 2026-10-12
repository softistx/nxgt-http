import { CodegenError, type Diagnostic } from '../errors';
import type { Location } from '../loader/location';
import { ALXIA_NAMES, operationConst } from './alxia/names';
import type { EmitContext } from './context';
import { OPERATION_INDEXES, paramGroups } from './operation/keys';

/** Who holds each generated name, and the clashes found so far. */
class Claims {
	/** `types.ts`'s names, and `hono.ts`'s. */
	readonly types = new Map<string, string>();
	/** alxia.ts's values: a module of their own, beside the types. */
	readonly values = new Map<string, string>();
	readonly diagnostics: Diagnostic[] = [];

	claim(name: string, owner: string, at: Location, owners = this.types): void {
		const holder = owners.get(name);
		if (holder === undefined) {
			owners.set(name, owner);
			return;
		}
		const fix = [holder, owner].some((o) => o.startsWith('schema '))
			? 'Rename the schema with the `names` option'
			: 'Change the operationId';
		this.diagnostics.push({
			severity: 'error',
			code: 'name_collision',
			message: `${holder} and ${owner} would both generate ${name}. ${fix}`,
			file: at.file,
			pointer: at.pointer,
		});
	}
}

/** The names the files declare themselves, before any schema's. */
function claimOwn(ctx: EmitContext, claims: Claims): void {
	const root = { file: ctx.options.rootDir, pointer: '' };
	for (const name of OPERATION_INDEXES) claims.claim(name, 'types.ts', root);
	if (ctx.options.dates === 'date') claims.claim('Wire', 'types.ts', root);
	if (ctx.options.hono) {
		// Declared or imported by hono.ts, which also imports schemas by name.
		for (const name of ['Replies', 'HonoSpec', 'Hono']) {
			claims.claim(name, 'hono.ts', root);
		}
	}
}

/** Each schema, alias and their `XInput` types. */
function claimSchemas(ctx: EmitContext, claims: Claims): void {
	for (const schema of ctx.ir.schemas) {
		claims.claim(schema.name, `schema ${schema.name}`, schema.location);
	}
	for (const alias of ctx.ir.aliases) {
		claims.claim(alias.name, `schema ${alias.name}`, alias.location);
	}
	for (const schema of ctx.ir.schemas) {
		if (ctx.hasInput(schema.id)) {
			claims.claim(
				`${schema.name}Input`,
				`schema ${schema.name}`,
				schema.location,
			);
		}
	}
	for (const alias of ctx.ir.aliases) {
		if (ctx.hasInput(alias.target)) {
			claims.claim(
				`${alias.name}Input`,
				`schema ${alias.name}`,
				alias.location,
			);
		}
	}
}

/** Each operation's parameter groups and form type. */
function claimOperations(ctx: EmitContext, claims: Claims): void {
	for (const operation of ctx.ir.operations) {
		const owner = `operation ${operation.operationId}`;
		for (const group of paramGroups(operation)) {
			claims.claim(group.name, owner, operation.location);
		}
		if (ctx.formOf(operation)) {
			claims.claim(`${operation.name}Form`, owner, operation.location);
		}
	}
}

/**
 * alxia.ts holds values, not types: its own names, the `z<Name>` it
 * imports from zod.ts, and one const per operation.
 */
function claimAlxia(ctx: EmitContext, claims: Claims): void {
	const { values } = claims;
	const root = { file: ctx.options.rootDir, pointer: '' };
	for (const name of ALXIA_NAMES) claims.claim(name, 'alxia.ts', root, values);
	for (const schema of ctx.ir.schemas) {
		const owner = `schema ${schema.name}`;
		claims.claim(`z${schema.name}`, owner, schema.location, values);
	}
	for (const alias of ctx.ir.aliases) {
		const owner = `schema ${alias.name}`;
		claims.claim(`z${alias.name}`, owner, alias.location, values);
	}
	for (const operation of ctx.ir.operations) {
		const owner = `operation ${operation.operationId}`;
		claims.claim(operationConst(operation), owner, operation.location, values);
	}
}

/**
 * Every generated name, once. A schema's `XInput`, an operation's `XQuery`,
 * or a name `types.ts` and `hono.ts` declare themselves, can land
 * on a name a schema already has. Interfaces of one name would merge, not
 * fail, so this is the only place the clash is caught.
 */
export function checkNames(ctx: EmitContext): void {
	const claims = new Claims();
	claimOwn(ctx, claims);
	claimSchemas(ctx, claims);
	claimOperations(ctx, claims);
	if (ctx.options.alxia) claimAlxia(ctx, claims);
	if (claims.diagnostics.length > 0) {
		throw new CodegenError(claims.diagnostics, ctx.options.rootDir);
	}
}

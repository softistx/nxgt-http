import { child } from '../../loader/location';
import type { OperationIR, ParamLocation, SchemaNode } from '../types';
import type { OperationState } from './state';

/** Where a parameter's text comes from, as an error names it. */
const READ_FROM: Record<ParamLocation, string> = {
	path: 'a URL',
	query: 'a URL',
	header: 'a header',
	cookie: 'a cookie',
};

const SCALAR_KINDS = new Set<SchemaNode['kind']>([
	'string',
	'number',
	'boolean',
	'literal',
	'unknown',
]);

const KIND_NAMES: Partial<Record<SchemaNode['kind'], string>> = {
	object: 'an object',
	record: 'a map',
	intersection: 'an intersection',
	union: 'a union of non-scalar values',
	array: 'a nested list',
	binary: 'binary content',
	null: 'null',
	never: 'never',
};

/** Once every schema is built: can each parameter be read from a URL, a header or a cookie? */
export function checkParameters(
	state: Pick<OperationState, 'diagnostics' | 'schemas'>,
	operations: readonly OperationIR[],
): void {
	const { diagnostics, schemas } = state;
	const scalar = (node: SchemaNode) =>
		SCALAR_KINDS.has(schemas.resolve(node).kind);
	for (const operation of operations) {
		for (const parameter of [...operation.parameters, ...operation.cookies]) {
			const node = schemas.resolve(parameter.schema);
			const at = child(parameter.location, 'schema');
			if (
				node.kind === 'array' &&
				(parameter.in === 'path' || parameter.in === 'cookie')
			) {
				diagnostics.error(
					'unsupported_parameter',
					`${parameter.in} parameter \`${parameter.name}\` is a list; a ${parameter.in === 'path' ? 'path segment' : 'cookie'} carries one value`,
					at,
				);
				continue;
			}
			const item = node.kind === 'array' ? schemas.resolve(node.items) : node;
			if (scalar(item)) continue;
			if (item.kind === 'union' && item.variants.every(scalar)) continue;
			diagnostics.error(
				'unsupported_parameter',
				`${parameter.in} parameter \`${parameter.name}\` is ${KIND_NAMES[item.kind] ?? item.kind}; ` +
					`only strings, numbers, booleans, enums and lists of them can be read from ${READ_FROM[parameter.in]}`,
				at,
			);
		}
	}
}

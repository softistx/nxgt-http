import { child, type Location } from '../../loader/location';
import { isObject } from '../../util';
import {
	HTTP_METHODS,
	type HttpMethod,
	type OperationIR,
	type ParamIR,
} from '../types';
import { operation } from './operation';
import { parameters } from './parameters';
import type { OperationState } from './state';

/**
 * Every operation under `paths`, with its parameters merged from the path
 * item, its bodies and responses resolved, and inline shapes named after it.
 */
export function pathOperations(state: OperationState): OperationIR[] {
	const { document, entry } = state.doc;
	const operations: OperationIR[] = [];
	if (document['paths'] === undefined) return operations;
	if (!isObject(document['paths'])) {
		state.diagnostics.error(
			'invalid_operation',
			'`paths` must be an object',
			child(entry, 'paths'),
		);
		return operations;
	}

	for (const [path, raw] of Object.entries(document['paths'])) {
		const item = pathItem(state, path, raw, child(entry, 'paths', path));
		if (!item) continue;
		const shared = parameters(
			state,
			item.value['parameters'],
			child(item.location, 'parameters'),
		);
		operations.push(...itemOperations(state, path, item, shared));
	}
	return operations;
}

/** A path item, resolved, and where it was found. */
interface PathItem {
	value: Record<string, unknown>;
	location: Location;
}

/** The path item at `path`, followed through a plain `$ref`; `undefined` once refused. */
function pathItem(
	state: Pick<OperationState, 'diagnostics' | 'resolver'>,
	path: string,
	raw: unknown,
	pathAt: Location,
): PathItem | undefined {
	if (!path.startsWith('/')) {
		state.diagnostics.error(
			'invalid_operation',
			`path \`${path}\` must start with /`,
			pathAt,
		);
		return undefined;
	}
	// A path item `$ref` with fields beside it is no longer a plain
	// reference: the operations it points at would be lost silently.
	let target: unknown = raw;
	if (isObject(raw) && typeof raw['$ref'] === 'string') {
		const extra = Object.keys(raw).filter(
			(key) => !['$ref', 'summary', 'description'].includes(key),
		);
		if (extra.length > 0) {
			state.diagnostics.error(
				'invalid_operation',
				`a path item \`$ref\` with ${extra.map((key) => `\`${key}\``).join(', ')} beside it is not supported: move ${extra.length > 1 ? 'them' : 'it'} into the file it refers to`,
				child(pathAt, extra[0] ?? '$ref'),
			);
			return undefined;
		}
		target = { $ref: raw['$ref'] };
	}
	const item = state.resolver.deref(target, pathAt);
	if (!isObject(item.value)) {
		state.diagnostics.error(
			'invalid_operation',
			'a path item must be an object',
			item.location,
		);
		return undefined;
	}
	return { value: item.value, location: item.location };
}

/** The operations of one path item, one per HTTP method it declares. */
function itemOperations(
	state: OperationState,
	path: string,
	item: PathItem,
	shared: Map<string, ParamIR>,
): OperationIR[] {
	const operations: OperationIR[] = [];
	for (const [key, value] of Object.entries(item.value)) {
		const at = child(item.location, key);
		if (key === 'additionalOperations') {
			state.diagnostics.error(
				'unsupported_operation',
				'`additionalOperations` (OpenAPI 3.2) is not supported',
				at,
			);
			continue;
		}
		if (!(HTTP_METHODS as readonly string[]).includes(key)) continue;
		if (key === 'query' && state.doc.version !== '3.2') {
			state.diagnostics.error(
				'unsupported_operation',
				`the \`query\` operation is OpenAPI 3.2, and this document is ${state.doc.openapi}`,
				at,
			);
			continue;
		}
		const built = operation(state, key as HttpMethod, path, value, at, shared);
		if (built) operations.push(built);
	}
	return operations;
}

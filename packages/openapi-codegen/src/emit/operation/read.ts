/** What every generated file reads off an operation: its docs, its parameters as validated, its stream. */
import type {
	MediaIR,
	ObjectNode,
	OperationIR,
	ParamIR,
	SchemaNode,
} from '../../ir/types';
import { type ParamGroup, paramKey } from '../context';

/** A parameter's schema as it is validated: documented as the parameter, never null. */
export function valueSchema(param: ParamIR): SchemaNode {
	return {
		...param.schema,
		nullable: false,
		description: param.description ?? param.schema.description,
		deprecated: param.deprecated === true || param.schema.deprecated === true,
	};
}

/** A parameter location's object: each parameter by key, as validated. */
export function groupObject(group: ParamGroup): ObjectNode {
	return {
		kind: 'object',
		properties: group.params.map((param) => ({
			name: paramKey(param),
			required: param.required,
			schema: valueSchema(param),
		})),
		// Undeclared parameters are dropped whatever `unknownKeys` says: no index signature.
		additional: 'strict',
		extends: [],
	};
}

/** An operation's summary, description and deprecation, for a JSDoc. */
export function operationDocs(operation: OperationIR): string[] {
	const lines: string[] = [];
	if (operation.summary) lines.push(operation.summary);
	if (operation.description && operation.description !== operation.summary) {
		if (lines.length > 0) lines.push('');
		lines.push(operation.description);
	}
	if (operation.queryMethod) {
		if (lines.length > 0) lines.push('');
		lines.push(
			'A `QUERY`, sent as a `POST`: it changes nothing, and its criteria are the body.',
		);
	}
	if (operation.deprecated) lines.push('@deprecated');
	return lines;
}

/** The stream an operation replies with: the first `sse` or `jsonl` content of a 2xx reply. */
export function streamOf(operation: OperationIR): MediaIR | undefined {
	for (const response of operation.responses) {
		if (response.status < 200 || response.status > 299) continue;
		const media = response.content.find(
			(m) => m.kind === 'sse' || m.kind === 'jsonl',
		);
		if (media) return media;
	}
	return undefined;
}

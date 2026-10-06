import { child, type Location } from '../../loader/location';
import { asString } from '../../util';
import type { SchemaNode } from '../types';
import type { SchemaState } from './state';
import { UNSUPPORTED_KEYWORDS } from './vocabulary';

type AnnotationState = Pick<
	SchemaState,
	'diagnostics' | 'options' | 'legacyFiles'
>;

/** Copies onto `node` the annotations of `s`: `description`, `deprecated`, `nullable`… */
export function annotate(
	state: AnnotationState,
	node: SchemaNode,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const description = asString(s['description']);
	if (description !== undefined) node.description = description;
	if (s['deprecated'] === true) node.deprecated = true;
	if (s['readOnly'] === true) node.readOnly = true;
	if (s['writeOnly'] === true) node.writeOnly = true;
	if ('default' in s) node.default = { value: s['default'] };
	if (s['nullable'] === true) {
		node.nullable = true;
		legacyNullable(state, child(at, 'nullable'));
	}
	return node;
}

function legacyNullable(state: AnnotationState, at: Location): void {
	if (state.options.legacyNullable === 'error') {
		state.diagnostics.error(
			'legacy_nullable',
			'`nullable: true` is OpenAPI 3.0; write `type: [T, "null"]`',
			at,
		);
		return;
	}
	// Once per file: a fragment library written for 3.0 would otherwise
	// bury every other warning.
	if (state.legacyFiles.has(at.file)) return;
	state.legacyFiles.add(at.file);
	state.diagnostics.warning(
		'legacy_nullable',
		'uses OpenAPI 3.0 `nullable: true`, read as `type: [T, "null"]` here and everywhere else in this file',
		at,
	);
}

/** Refuses, each at its pointer, the keywords v1 cannot express. */
export function refuseUnsupported(
	state: Pick<SchemaState, 'diagnostics'>,
	s: Record<string, unknown>,
	at: Location,
): void {
	for (const keyword of UNSUPPORTED_KEYWORDS) {
		if (keyword in s) {
			state.diagnostics.error(
				'unsupported_keyword',
				`\`${keyword}\` is not supported`,
				child(at, keyword),
			);
		}
	}
}

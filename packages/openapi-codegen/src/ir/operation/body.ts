import { child, type Location } from '../../loader/location';
import { asString, isObject } from '../../util';
import { sharedName } from '../naming';
import type { BodyIR } from '../types';
import { content } from './content';
import type { OperationState } from './state';

/** A `requestBody`, its inline shapes named `<name>Body`, or after itself when shared. */
export function body(
	state: Pick<OperationState, 'diagnostics' | 'resolver' | 'schemas'>,
	raw: unknown,
	site: Location,
	name: string,
): BodyIR | undefined {
	const resolved = state.resolver.deref(raw, site);
	if (!isObject(resolved.value)) {
		state.diagnostics.error(
			'invalid_operation',
			'`requestBody` must be an object',
			resolved.location,
		);
		return undefined;
	}
	// A shared body is named after itself, not after whichever operation came first.
	const stem =
		resolved.hops.length > 0
			? sharedName(resolved.location, 'Body')
			: `${name}Body`;
	return {
		required: resolved.value['required'] === true,
		description:
			resolved.description ?? asString(resolved.value['description']),
		content: content(
			state,
			resolved.value['content'],
			child(resolved.location, 'content'),
			stem,
		),
	};
}

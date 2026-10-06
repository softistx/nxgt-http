import { child, type Location } from '../../loader/location';
import { asString, isObject } from '../../util';
import { sharedName } from '../naming';
import type { ResponseIR } from '../types';
import { content } from './content';
import type { OperationState } from './state';

/** The `responses` with an exact status code; `default` and `NXX` are ignored with a warning. */
export function responses(
	state: Pick<OperationState, 'diagnostics' | 'resolver' | 'schemas'>,
	raw: unknown,
	at: Location,
	name: string,
): ResponseIR[] {
	const found: ResponseIR[] = [];
	if (raw === undefined) return found;
	if (!isObject(raw)) {
		state.diagnostics.error(
			'invalid_operation',
			'`responses` must be an object',
			at,
		);
		return found;
	}
	for (const [code, value] of Object.entries(raw)) {
		const codeAt = child(at, code);
		if (!/^[1-5]\d\d$/.test(code)) {
			if (code === 'default' || /^[1-5]XX$/i.test(code)) {
				state.diagnostics.warning(
					'ignored',
					`response \`${code}\` is not generated: replies are typed by exact status code`,
					codeAt,
				);
			} else {
				state.diagnostics.error(
					'invalid_operation',
					`\`${code}\` is not an HTTP status code`,
					codeAt,
				);
			}
			continue;
		}
		const response = state.resolver.deref(value, codeAt);
		if (!isObject(response.value)) {
			state.diagnostics.error(
				'invalid_operation',
				'a response must be an object',
				response.location,
			);
			continue;
		}
		const stem =
			response.hops.length > 0
				? sharedName(response.location, 'Response')
				: `${name}${code}Response`;
		found.push({
			status: Number(code),
			description:
				response.description ?? asString(response.value['description']),
			content: content(
				state,
				response.value['content'],
				child(response.location, 'content'),
				stem,
				true,
			),
			location: response.location,
		});
	}
	return found;
}

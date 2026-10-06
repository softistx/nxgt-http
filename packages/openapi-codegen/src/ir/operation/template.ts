import type { Location } from '../../loader/location';
import type { ParamIR } from '../types';
import type { OperationState } from './state';

/** `{name}` in the path and the `in: path` parameters must match exactly. */
export function checkTemplate(
	state: Pick<OperationState, 'diagnostics'>,
	path: string,
	parameters: ParamIR[],
	at: Location,
): void {
	const template = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
	const declared = parameters
		.filter((parameter) => parameter.in === 'path')
		.map((parameter) => parameter.name);
	for (const name of template) {
		if (declared.includes(name)) continue;
		state.diagnostics.error(
			'path_parameter_mismatch',
			`\`{${name}}\` in the path has no \`in: path\` parameter`,
			at,
		);
	}
	for (const name of declared) {
		if (template.includes(name)) continue;
		state.diagnostics.error(
			'path_parameter_mismatch',
			`path parameter \`${name}\` does not appear in \`${path}\``,
			at,
		);
	}
}

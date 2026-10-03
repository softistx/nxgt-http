/**
 * The library's linter: rules a spec opts into in its `tspconfig.yaml`,
 * each a warning, each one it can turn off.
 *
 * ```yaml
 * linter:
 *   extends:
 *     - "@nxgt/typespec/recommended"
 * ```
 */
import { defineLinter } from '@typespec/compiler';
import { errorBodyShape } from './rules/error-body-shape';
import { listReturnsPage } from './rules/list-returns-page';
import { serviceOperationIds } from './rules/service-operation-ids';

const rules = [listReturnsPage, serviceOperationIds, errorBodyShape];

export const $linter = defineLinter({
	rules,
	ruleSets: {
		recommended: {
			enable: Object.fromEntries(
				rules.map(({ name }) => [`@nxgt/typespec/${name}`, true]),
			),
		},
	},
});

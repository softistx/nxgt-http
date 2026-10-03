/**
 * A list returns a page: `Page<Item>` or `CursorPage<Item>`, never a bare
 * array, which cannot grow a `total` or a `nextCursor` without breaking its
 * clients. A list is an operation named `list`, `search` or `query`, alone
 * or followed by more: `listUsers`, `searchPosts`.
 */
import { createRule, isArrayModelType, paramMessage } from '@typespec/compiler';
import { getHttpOperation } from '@typespec/http';
import { isWritten } from './written';

const LIST = /^(list|search|query)(?=[A-Z]|$)/;

export const listReturnsPage = createRule({
	name: 'list-returns-page',
	severity: 'warning',
	description:
		'A list, search or query returns Page<Item> or CursorPage<Item>.',
	messages: {
		default: paramMessage`${'operation'} returns an array: return Page<Item> or CursorPage<Item>, which can carry a total or a next cursor.`,
	},
	create: (context) => ({
		operation(operation) {
			if (!isWritten(operation) || !LIST.test(operation.name)) return;
			const [http] = getHttpOperation(context.program, operation);
			const array = http.responses.some(
				({ statusCodes, responses }) =>
					typeof statusCodes === 'number' &&
					statusCodes >= 200 &&
					statusCodes < 300 &&
					responses.some(
						({ body }) =>
							body?.type.kind === 'Model' && isArrayModelType(body.type),
					),
			);
			if (!array) return;
			context.reportDiagnostic({
				format: { operation: operation.name },
				target: operation,
			});
		},
	}),
});

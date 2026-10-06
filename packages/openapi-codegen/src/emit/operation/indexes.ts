/** The indexes of `types.ts`: operations by route and by tag, paths by method and by tag. */
import { HTTP_METHODS, type OperationIR } from '../../ir/types';
import { type EmitContext, routeKey } from '../context';
import { jsString, propertyKey } from '../printer';

/** `OperationsByRoute`, `PathsByMethod`, `OperationsByTag` and `PathsByTag`, in that order. */
export function operationIndexes(ctx: EmitContext): string[] {
	const tags = byTag(ctx);
	return [
		index(
			'The operation behind each route: `routes.put(path)` finds it here.',
			'OperationsByRoute',
			ctx.ir.operations.map(
				(operation) =>
					`\t${jsString(routeKey(operation))}: ${jsString(operation.operationId)};`,
			),
		),
		`/** The paths with an operation for each method. */\nexport interface PathsByMethod ${pathsByMethod(ctx.ir.operations, '')}`,
		index(
			'The operations under each tag.',
			'OperationsByTag',
			[...tags].map(
				([tag, operations]) =>
					`\t${propertyKey(tag)}: ${operations.map((o) => jsString(o.operationId)).join(' | ')};`,
			),
		),
		index(
			'`PathsByMethod`, for each tag.',
			'PathsByTag',
			[...tags].map(
				([tag, operations]) =>
					`\t${propertyKey(tag)}: ${pathsByMethod(operations, '\t')};`,
			),
		),
	];
}

function index(doc: string, name: string, lines: readonly string[]): string {
	return lines.length === 0
		? `/** ${doc} */\nexport interface ${name} {}`
		: `/** ${doc} */\nexport interface ${name} {\n${lines.join('\n')}\n}`;
}

/** The operations of each tag, tags and operations in spec order. */
function byTag(ctx: EmitContext): Map<string, OperationIR[]> {
	const tags = new Map<string, OperationIR[]>();
	for (const operation of ctx.ir.operations) {
		for (const tag of new Set(operation.tags)) {
			tags.set(tag, [...(tags.get(tag) ?? []), operation]);
		}
	}
	return tags;
}

/** Every method, with the paths that have an operation for it. */
function pathsByMethod(
	operations: readonly OperationIR[],
	indent: string,
): string {
	const lines = HTTP_METHODS.map((method) => {
		const paths = [
			...new Set(
				operations
					.filter((operation) => operation.method === method)
					.map((operation) => jsString(operation.path)),
			),
		];
		return `${indent}\t${method}: ${paths.length === 0 ? 'never' : paths.join(' | ')};`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}

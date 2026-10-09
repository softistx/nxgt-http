/**
 * One reply per status: `@typespec/openapi3` merges two replies of one
 * status into one without a word. A reply without a body beside one with a
 * body is lost in the merge, an error; a `void` body is none, as the emitter
 * sees it. Two bodies of one content type are merged under the first reply's
 * description, a warning where the status is a code. Under `*` or a range,
 * where undocumented `@error` models share one description, they pass.
 * Bodies of different content types are one reply, negotiated, and pass.
 */
import { isVoidType, type Program } from '@typespec/compiler';
import type {
	HttpOperationResponse,
	HttpStatusCodesEntry,
} from '@typespec/http';
import { eachHttpOperation } from './http-operations';
import { $lib } from './lib';

function statusOf(code: HttpStatusCodesEntry): string {
	return typeof code === 'object' ? `${code.start}-${code.end}` : `${code}`;
}

/** What the emitter's merge costs: a reply, a description, or nothing. */
function mergeOf({
	statusCodes,
	responses,
}: HttpOperationResponse):
	| 'duplicate-status-reply'
	| 'merged-status-reply'
	| undefined {
	const bodies = responses.flatMap(({ body }) =>
		body && !isVoidType(body.type) ? [body] : [],
	);
	if (bodies.length > 0 && bodies.length < responses.length) {
		return 'duplicate-status-reply';
	}
	if (typeof statusCodes !== 'number') return undefined;
	const seen = new Set<string>();
	for (const body of bodies) {
		if (body.contentTypes.some((type) => seen.has(type))) {
			return 'merged-status-reply';
		}
		for (const type of body.contentTypes) seen.add(type);
	}
	return undefined;
}

/** Checks each operation of each service, as the emitter sees it, once. */
export function validateOneReplyPerStatus(program: Program): void {
	eachHttpOperation(program, (operation) => {
		for (const response of operation.responses) {
			const code = mergeOf(response);
			if (code === undefined) continue;
			$lib.reportDiagnostic(program, {
				code,
				format: {
					operation: operation.operation.name,
					status: statusOf(response.statusCodes),
				},
				target: operation.operation,
			});
		}
	});
}

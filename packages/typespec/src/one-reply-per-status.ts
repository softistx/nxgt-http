/**
 * One reply per status: `@typespec/openapi3` merges two replies of one
 * status into one without a word, and a reply without a body is lost in the
 * merge. Two bodies of different content types are one reply, negotiated,
 * and pass.
 */
import type { Program } from '@typespec/compiler';
import {
	getAllHttpServices,
	type HttpOperationResponse,
	type HttpOperationResponseContent,
	type HttpStatusCodesEntry,
} from '@typespec/http';
import { $lib } from './lib';

function statusOf(code: HttpStatusCodesEntry): string {
	return typeof code === 'object' ? `${code.start}-${code.end}` : `${code}`;
}

/** Whether the emitter would merge the two: one has no body, or both share a content type. */
function collide(
	a: HttpOperationResponseContent,
	b: HttpOperationResponseContent,
): boolean {
	if (a.body === undefined || b.body === undefined) return true;
	const types = new Set(a.body.contentTypes);
	return b.body.contentTypes.some((type) => types.has(type));
}

function isMerged({ responses }: HttpOperationResponse): boolean {
	return responses.some((a, i) =>
		responses.slice(i + 1).some((b) => collide(a, b)),
	);
}

/**
 * Checks each operation of each service, as the emitter sees it. The
 * services' own diagnostics are the emitter's to report.
 */
export function validateOneReplyPerStatus(program: Program): void {
	const [services] = getAllHttpServices(program);
	for (const service of services) {
		for (const operation of service.operations) {
			for (const response of operation.responses) {
				if (!isMerged(response)) continue;
				$lib.reportDiagnostic(program, {
					code: 'duplicate-status-reply',
					format: {
						operation: operation.operation.name,
						status: statusOf(response.statusCodes),
					},
					target: operation.operation,
				});
			}
		}
	}
}

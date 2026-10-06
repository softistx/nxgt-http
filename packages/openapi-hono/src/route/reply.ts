/**
 * The last step of a route: runs the handler, then, with
 * `validateResponses`, checks its reply against the declared ones.
 */
import type { MiddlewareHandler } from 'hono';
import type { RuntimeMedia, RuntimeOperation } from '../engine';
import { toIssues, type ValidationIssue } from '../errors';
import { fail } from './fail';
import { match, mediaType } from './media';
import type { Handler, Running, Settings } from './types';

export function reply(
	id: string,
	operation: RuntimeOperation,
	handler: Handler,
	settings: Settings,
	running: Running,
): MiddlewareHandler {
	return async (c, next) => {
		running.set(c, { id, operation, settings });
		const response = await handler(c, next);
		if (!settings.validateResponses || !(response instanceof Response)) {
			return response as Response | undefined;
		}
		const issues = await checkReply(id, operation, response);
		if (issues.length === 0) return response;
		return fail(c, settings, {
			kind: 'response',
			operationId: id,
			method: operation.method,
			path: operation.path,
			status: response.status,
			issues,
		});
	};
}

/** Bodies that may never end: reading one to check it would hang the reply. */
const STREAMS = new Set([
	'text/event-stream',
	'application/x-ndjson',
	'application/jsonl',
	'application/json-seq',
]);

/**
 * What `c.json()` and `c.text()` send, `application/json` and `text/plain`,
 * stands for a declared media type of the same kind: `application/problem+json`,
 * `text/csv`.
 */
function sentBy(
	content: { readonly [mediaType: string]: RuntimeMedia },
	type: string,
): RuntimeMedia | undefined {
	const kind =
		type === 'application/json'
			? 'json'
			: type === 'text/plain'
				? 'text'
				: undefined;
	return Object.values(content).find((media) => media.kind === kind);
}

async function checkReply(
	id: string,
	operation: RuntimeOperation,
	response: Response,
): Promise<ValidationIssue[]> {
	const issue = (code: string, message: string): ValidationIssue[] => [
		{ target: 'response', path: [], code, message },
	];
	const declared = operation.responses[response.status];
	if (!declared) {
		return issue(
			'undeclared_status',
			`${id} declares no ${response.status} reply`,
		);
	}
	const types = Object.keys(declared);
	if (types.length === 0) return [];
	const header = response.headers.get('content-type');
	const type = header === null ? undefined : mediaType(header);
	const media =
		type === undefined
			? undefined
			: (match(declared, type) ?? sentBy(declared, type));
	if (!media) {
		return issue(
			'invalid_content_type',
			`A ${response.status} reply of ${id} is ${types.join(' or ')}, not ${header ?? 'untyped'}`,
		);
	}
	if (
		!media.schema ||
		(media.kind !== 'json' && media.kind !== 'text') ||
		STREAMS.has(type ?? '')
	) {
		return [];
	}
	const text = await response.clone().text();
	let value: unknown = text;
	if (media.kind === 'json') {
		try {
			value = JSON.parse(text);
		} catch {
			return issue('invalid_json', 'The reply body is not valid JSON');
		}
	}
	const result = media.schema.safeParse(value);
	return result.success ? [] : toIssues('response', result.error.issues);
}

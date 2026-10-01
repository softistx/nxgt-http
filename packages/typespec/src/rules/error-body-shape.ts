/**
 * An error reply's body is the envelope `@nxgt/openapi-hono` sends: a
 * `status`, a `message` and a `timestamp`, as `ErrorBody<Status>` declares
 * them. A reply without a body passes: `AuthenticationRequired` has none.
 */
import {
	createRule,
	isVoidType,
	type Model,
	paramMessage,
	walkPropertiesInherited,
} from '@typespec/compiler';
import { getHttpOperation } from '@typespec/http';
import { isWritten } from './written';

const ENVELOPE = ['status', 'message', 'timestamp'];

/** Its own properties and those of the models it extends. */
function isEnvelope(body: Model): boolean {
	const names = new Set(
		[...walkPropertiesInherited(body)].map(({ name }) => name),
	);
	return ENVELOPE.every((name) => names.has(name));
}

function statusOf(code: number | { start: number; end: number } | '*'): string {
	return typeof code === 'object' ? `${code.start}-${code.end}` : `${code}`;
}

export const errorBodyShape = createRule({
	name: 'error-body-shape',
	severity: 'warning',
	description:
		'An error reply has the nxgt envelope: status, message and timestamp.',
	messages: {
		default: paramMessage`${'operation'} answers ${'status'} with a body that is not the nxgt envelope: declare BadRequest, NotFound or another of the library's errors, or a body that spreads or extends ErrorBody<Status>.`,
	},
	create: (context) => ({
		operation(operation) {
			if (!isWritten(operation)) return;
			const [http] = getHttpOperation(context.program, operation);
			for (const { statusCodes, responses } of http.responses) {
				const error =
					statusCodes === '*' ||
					(typeof statusCodes === 'number'
						? statusCodes >= 400
						: statusCodes.start >= 400);
				if (!error) continue;
				const wrong = responses.some(({ body }) => {
					if (body === undefined || isVoidType(body.type)) return false;
					return body.type.kind !== 'Model' || !isEnvelope(body.type);
				});
				if (!wrong) continue;
				context.reportDiagnostic({
					format: { operation: operation.name, status: statusOf(statusCodes) },
					target: operation,
				});
			}
		},
	}),
});

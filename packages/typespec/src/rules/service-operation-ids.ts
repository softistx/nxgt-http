/**
 * A service without `@operationIds` gets the emitter's ids: `Users_list`,
 * which the generated client's methods are named after.
 */
import { createRule, isService, paramMessage } from '@typespec/compiler';
import { isMarkedNamespace } from '../operation-ids';

export const serviceOperationIds = createRule({
	name: 'service-operation-ids',
	severity: 'warning',
	description:
		'A service namespace marks its operation ids with @operationIds.',
	messages: {
		default: paramMessage`The service ${'service'} has no @operationIds: its ids are the emitter's, such as Users_list. Mark the namespace with @operationIds.`,
	},
	create: (context) => ({
		namespace(namespace) {
			const { program } = context;
			if (!isService(program, namespace)) return;
			if (isMarkedNamespace(program, namespace)) return;
			context.reportDiagnostic({
				format: { service: namespace.name },
				target: namespace,
			});
		},
	}),
});

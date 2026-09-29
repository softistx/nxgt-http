/** The library's definition: its name, diagnostics and state keys. */
import { createTypeSpecLibrary, paramMessage } from '@typespec/compiler';

export const $lib = createTypeSpecLibrary({
	name: '@nxgt/typespec',
	diagnostics: {
		'duplicate-operation-id': {
			severity: 'error',
			messages: {
				default: paramMessage`Two operations are named ${'id'}: an OpenAPI operation id must be unique.`,
			},
		},
		'duplicate-status-reply': {
			severity: 'error',
			messages: {
				default: paramMessage`${'operation'} declares a reply without a body and one with a body of status ${'status'}: the emitter merges them into one, and the reply without a body is lost. Declare the one the route sends.`,
			},
		},
		'merged-status-reply': {
			severity: 'warning',
			messages: {
				default: paramMessage`${'operation'} declares two replies with a body of status ${'status'}: the emitter merges their bodies under the first one's description. Declare the one the route sends.`,
			},
		},
	},
	state: {
		operationIds: { description: 'The interfaces marked with @operationIds' },
		itemOperations: {
			description: "The operations named after an item, and the item's model",
		},
	},
});

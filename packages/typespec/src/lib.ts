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
				default: paramMessage`${'operation'} declares two replies of status ${'status'}: the emitter merges them into one, and a reply without a body is lost. Declare the one the route sends.`,
			},
		},
	},
	state: {
		operationIds: { description: 'The interfaces marked with @operationIds' },
	},
});

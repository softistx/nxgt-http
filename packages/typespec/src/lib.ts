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
	},
	state: {
		operationIds: { description: 'The interfaces marked with @operationIds' },
	},
});

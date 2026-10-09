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
		'resource-name-on-namespace': {
			severity: 'error',
			messages: {
				default:
					"`singular` and `plural` name an interface's resource: a namespace has none. Put them on the interface.",
			},
		},
		'verb-method-mismatch': {
			severity: 'warning',
			messages: {
				default: paramMessage`${'operation'} is sent with ${'method'}, where its verb ${'verb'} is sent with ${'expected'}. Give it that method, or a name that is not a verb.`,
			},
		},
		'query-method-not-post': {
			severity: 'error',
			messages: {
				default: paramMessage`${'operation'} is marked @queryMethod and sent with ${'method'}: a QUERY is sent as a POST until @typespec/http declares it. Make it a @post.`,
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
		queryMethod: {
			description: 'The operations marked with @queryMethod',
		},
		operationIds: {
			description: 'The interfaces and namespaces marked with @operationIds',
		},
		operationIdsOptions: {
			description:
				"Each marked interface's or namespace's @operationIds options",
		},
	},
});

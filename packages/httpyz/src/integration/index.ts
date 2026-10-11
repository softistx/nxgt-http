/**
 * What an integration builds on: the pieces of the client that a binding
 * such as `@nxgt/openapi-httpyz` reuses, so the requests it writes and checks
 * are written exactly as the client's own. An app has no use for most of them, but `createSseParser` reads the events of
 * a stream it holds as text, such as the body of an error reply.
 */
export { METHODS } from '../client/create-http-client';
export {
	absent,
	fields,
	text,
	toFormData,
	toSearchParams,
} from '../request/encode';
export { type Checked, check } from '../schema/standard-schema';
export {
	createSseParser,
	type ServerEvent,
	type SseParser,
} from '../stream/sse-parser';

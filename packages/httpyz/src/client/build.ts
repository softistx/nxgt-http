/**
 * A request's parts, from a call's options: its URL, and its init but for
 * the signal.
 */
import { fillPath, joinUrl, writeBody, writeQuery } from '../request/encode';
import type { BodyInput, QueryInput } from '../request/types';
import { type ClientState, contextOf, sharedHeaders } from './state';
import type { CallOptions, Method } from './types';

/** What a request is built from, as the client reads a call's options. */
export type Given = BodyInput &
	CallOptions & {
		readonly param?: Readonly<Record<string, unknown>>;
		readonly query?: QueryInput;
	};

/** `adjust` has the last word on the headers. */
export const build = async (
	state: ClientState,
	method: Method,
	path: string,
	given: Given,
	adjust?: (headers: Headers) => void,
) => {
	const { options } = state;
	const {
		param,
		query,
		json,
		form,
		text,
		body,
		operationId,
		timeout = options.timeout,
		retry = options.retry,
		headers: own,
		signal,
		...rest
	} = given;
	const context = contextOf(method, path, operationId);
	const headers = await sharedHeaders(state);
	const callHeaders = new Headers(own);
	callHeaders.forEach((value, name) => {
		headers.set(name, value);
	});
	adjust?.(headers);
	const url = joinUrl(
		options.baseUrl,
		fillPath(context, param),
		writeQuery(query),
	);
	const payload = writeBody(
		{ json, form, text, body } as BodyInput,
		headers,
		callHeaders.get('content-type'),
	);
	const init = {
		...options.init,
		...rest,
		method: method.toUpperCase(),
		headers,
		body: payload,
		// A stream is sent as it is read, which fetch has to be told.
		...(payload instanceof ReadableStream ? { duplex: 'half' } : {}),
	} as RequestInit;
	return { context, url, init, timeout, retry, signal: signal ?? undefined };
};

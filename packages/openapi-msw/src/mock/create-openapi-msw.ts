/**
 * `createOpenApiMsw`: MSW handlers for the generated operations, each typed by
 * its operation. A handler reads the request as the server does, answers with
 * the server's 400 what it would refuse, and replies only as the spec
 * declares.
 */
import type { ValidationFailure, ValidationIssue } from '@nxgt/httpyz';
import { METHODS } from '@nxgt/httpyz/integration';
import type {
	OperationsShape,
	OperationTable,
	RoutesOf,
	RuntimeOperation,
} from '@nxgt/openapi-httpyz';
import { HttpHandler, type RequestHandlerOptions } from 'msw';
import { MockReplyError } from '../errors/mock-reply-error';
import { checkReply, createReply } from '../reply/reply';
import { readRequest } from '../request/read-request';
import type { OpenApiMsw, OpenApiMswOptions } from './types';

type Resolver = (info: Record<string, unknown>) => unknown;

/** The 400 `@nxgt/openapi-hono` answers: `ErrorResponse`, with the issues. */
const refused = (issues: ValidationIssue[]): Response =>
	Response.json(
		{
			status: 400,
			message: 'errors.validation-failed',
			timestamp: new Date().toISOString(),
			issues,
		},
		{ status: 400 },
	);

/** The path MSW matches: on `baseUrl`, or on any origin. */
const located = (baseUrl: string | undefined, path: string): string =>
	baseUrl === undefined ? `*${path}` : `${baseUrl.replace(/\/+$/, '')}${path}`;

/**
 * ```ts
 * const mock = createOpenApiMsw(operations, { baseUrl: 'https://api.example.com' });
 * const server = setupServer(
 * 	mock.get('/employees/{id}', ({ param, reply }) =>
 * 		reply(200, { id: param.id, name: 'Ada' }),
 * 	),
 * );
 * ```
 */
export function createOpenApiMsw<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
>(
	operations: OperationTable<Ops>,
	options: OpenApiMswOptions = {},
): OpenApiMsw<Ops, Routes> {
	const { baseUrl, validate = true, onValidationError } = options;
	const checks = {
		request:
			validate === true ||
			(typeof validate === 'object' && validate.request !== false),
		reply:
			validate === true ||
			(typeof validate === 'object' && validate.reply !== false),
	};
	const table = operations as unknown as {
		readonly [id: string]: RuntimeOperation;
	};
	const byRoute = new Map<string, string>();
	for (const [id, operation] of Object.entries(table)) {
		byRoute.set(`${operation.method} ${operation.path}`, id);
	}

	const handle = (
		id: string,
		resolver: Resolver,
		handlerOptions: RequestHandlerOptions | undefined,
	): HttpHandler => {
		const operation = table[id];
		if (!operation) throw new Error(`${id} is not an operationId of the spec`);
		// MSW names the parameters by position, whatever their name in the spec.
		const names: string[] = [];
		const path = operation.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
			names.push(name);
			return `:p${names.length - 1}`;
		});
		const context = {
			operationId: id,
			method: operation.method,
			path: operation.path,
		};
		const reply = createReply(context, operation);
		return new HttpHandler(
			operation.method.toUpperCase(),
			located(baseUrl, path),
			async ({ request, params, cookies }) => {
				const param: Record<string, string> = {};
				names.forEach((name, index) => {
					const value = params[`p${index}`];
					if (typeof value === 'string') param[name] = value;
				});
				const { received, issues } = await readRequest(
					operation,
					request,
					param,
				);
				if (checks.request && issues.length > 0) {
					const failure: ValidationFailure = {
						kind: 'request',
						...context,
						issues,
					};
					const answer = await onValidationError?.(failure, request);
					return answer instanceof Response ? answer : refused(issues);
				}
				const response = await resolver({
					...received,
					request,
					cookies,
					operationId: id,
					reply,
				});
				if (checks.reply && response instanceof Response) {
					const found = await checkReply(response);
					if (found.length > 0) {
						throw new MockReplyError({
							kind: 'response',
							...context,
							status: response.status,
							issues: found,
						});
					}
				}
				return response as Response | undefined;
			},
			handlerOptions,
		);
	};

	const mock: Record<string, unknown> = {
		operations,
		op: (
			id: string,
			resolver: Resolver,
			handlerOptions?: RequestHandlerOptions,
		) => handle(id, resolver, handlerOptions),
	};
	// Only the spec's methods, as the types have them.
	const methods = new Set(Object.values(table).map(({ method }) => method));
	for (const method of METHODS) {
		if (!methods.has(method)) continue;
		mock[method] = (
			path: string,
			resolver: Resolver,
			handlerOptions?: RequestHandlerOptions,
		) => {
			const id = byRoute.get(`${method} ${path}`);
			if (id === undefined) {
				throw new Error(
					`the spec has no operation at ${method.toUpperCase()} ${path}`,
				);
			}
			return handle(id, resolver, handlerOptions);
		};
	}
	return mock as unknown as OpenApiMsw<Ops, Routes>;
}

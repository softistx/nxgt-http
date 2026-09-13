import { describe, expect, it } from 'bun:test';
import { CodegenError } from '../errors';
import { loadDocument } from '../loader/document';
import { createMemoryFileSystem } from '../loader/fs';
import { buildIR } from './index';
import { mediaKind } from './operations';

const ROOT = '/spec/openapi.json';
const ok = { '200': { description: 'ok' } };
const idParam = {
	name: 'id',
	in: 'path',
	required: true,
	schema: { type: 'string' },
};

const spec = (
	paths: Record<string, unknown>,
	extra: Record<string, unknown> = {},
	openapi = '3.2.0',
) =>
	JSON.stringify({
		openapi,
		info: { title: 't', version: '1' },
		paths,
		...extra,
	});

const build = async (json: string) =>
	buildIR(
		await loadDocument(ROOT, { fs: createMemoryFileSystem({ [ROOT]: json }) }),
	);

async function errors(json: string) {
	const error = await build(json).catch((e: unknown) => e);
	if (!(error instanceof CodegenError))
		throw new Error('expected a CodegenError');
	return error.diagnostics
		.filter((d) => d.severity === 'error')
		.map(({ code, pointer }) => ({ code, pointer }));
}

describe('buildIR — operations', () => {
	it('registers every method, `query` in 3.2 included, with its Hono path', async () => {
		const api = await build(
			spec({
				'/employees/{id}': {
					parameters: [idParam],
					get: { operationId: 'getEmployee', responses: ok },
					query: { operationId: 'searchEmployee', responses: ok },
				},
			}),
		);
		expect(
			api.operations.map((o) => [o.method, o.honoPath, o.operationId, o.name]),
		).toEqual([
			['get', '/employees/:id', 'getEmployee', 'GetEmployee'],
			['query', '/employees/:id', 'searchEmployee', 'SearchEmployee'],
		]);
	});

	it('refuses `query` in a 3.1 document', async () => {
		expect(
			await errors(spec({ '/a': { query: { responses: ok } } }, {}, '3.1.0')),
		).toEqual([{ code: 'unsupported_operation', pointer: '/paths/~1a/query' }]);
	});

	it("merges the path item's parameters, the operation's replacing them", async () => {
		const api = await build(
			spec({
				'/employees': {
					parameters: [
						{ name: 'limit', in: 'query', schema: { type: 'integer' } },
						{ name: 'X-Trace', in: 'header', schema: { type: 'string' } },
					],
					get: {
						parameters: [
							{
								name: 'limit',
								in: 'query',
								required: true,
								schema: { type: 'integer', maximum: 50 },
							},
							{
								name: 'Authorization',
								in: 'header',
								schema: { type: 'string' },
							},
						],
						responses: ok,
					},
				},
			}),
		);
		expect(api.operations[0]?.parameters).toMatchObject([
			{
				name: 'limit',
				in: 'query',
				required: true,
				explode: true,
				schema: { kind: 'number', integer: true, maximum: 50 },
			},
			{ name: 'X-Trace', in: 'header', required: false, explode: false },
		]);
		expect(api.operations[0]?.parameters).toHaveLength(2);
	});

	it('refuses parameters a URL cannot carry, and a path that does not match its parameters', async () => {
		const at = '/paths/~1e~1{id}/get';
		expect(
			await errors(
				spec({
					'/e/{id}': {
						get: {
							parameters: [
								{ name: 'session', in: 'cookie', schema: { type: 'string' } },
								{
									name: 'filter',
									in: 'query',
									style: 'deepObject',
									schema: { type: 'object' },
								},
								{ name: 'q', in: 'query', content: { 'application/json': {} } },
								{
									name: 'where',
									in: 'query',
									schema: {
										type: 'object',
										properties: { a: { type: 'string' } },
									},
								},
								{
									name: 'other',
									in: 'path',
									required: true,
									schema: { type: 'string' },
								},
							],
							responses: ok,
						},
					},
				}),
			),
		).toEqual([
			{ code: 'unsupported_parameter', pointer: `${at}/parameters/0/in` },
			{ code: 'unsupported_parameter', pointer: `${at}/parameters/1/style` },
			{ code: 'unsupported_parameter', pointer: `${at}/parameters/2/content` },
			{ code: 'path_parameter_mismatch', pointer: at },
			{ code: 'path_parameter_mismatch', pointer: at },
			{ code: 'unsupported_parameter', pointer: `${at}/parameters/3/schema` },
		]);
	});

	it('derives a missing operationId, and refuses a duplicate', async () => {
		const api = await build(
			spec({
				'/employees/{id}': { parameters: [idParam], delete: { responses: ok } },
			}),
		);
		expect(api.operations[0]?.operationId).toBe('deleteEmployeesById');
		expect(api.warnings.map((w) => w.code)).toEqual(['missing_operation_id']);

		expect(
			await errors(
				spec({
					'/a': { get: { operationId: 'same', responses: ok } },
					'/b': { get: { operationId: 'same', responses: ok } },
				}),
			),
		).toEqual([
			{ code: 'duplicate_operation_id', pointer: '/paths/~1b/get/operationId' },
		]);
	});

	it('names inline bodies and responses after the operation, shared ones after themselves', async () => {
		const api = await build(
			spec(
				{
					'/employees': {
						post: {
							operationId: 'createEmployee',
							requestBody: {
								required: true,
								content: {
									'application/json': {
										schema: {
											type: 'object',
											properties: { name: { type: 'string' } },
										},
									},
								},
							},
							responses: {
								'201': {
									description: 'created',
									content: {
										'application/json': {
											schema: { $ref: '#/components/schemas/Employee' },
										},
									},
								},
								'204': { description: 'nothing' },
								'404': { $ref: '#/components/responses/NotFound' },
								default: { description: 'anything else' },
							},
						},
					},
				},
				{
					components: {
						schemas: {
							Employee: {
								type: 'object',
								properties: { id: { type: 'string' } },
							},
						},
						responses: {
							NotFound: {
								description: 'not found',
								content: {
									'application/json': {
										schema: {
											type: 'object',
											properties: { message: { type: 'string' } },
										},
									},
								},
							},
						},
					},
				},
			),
		);
		const operation = api.operations[0];
		expect(api.schemas.map((s) => s.name).sort()).toEqual([
			'CreateEmployeeBody',
			'Employee',
			'NotFoundResponse',
		]);
		expect(operation?.body).toMatchObject({
			required: true,
			content: [
				{
					mediaType: 'application/json',
					kind: 'json',
					schema: { kind: 'ref' },
				},
			],
		});
		expect(
			operation?.responses.map((r) => [r.status, r.content.length]),
		).toEqual([
			[201, 1],
			[204, 0],
			[404, 1],
		]);
		expect(operation?.responses[0]?.content[0]?.schema).toEqual({
			kind: 'ref',
			target: `${ROOT}#/components/schemas/Employee`,
		});
		expect(api.warnings.map((w) => [w.code, w.pointer])).toEqual([
			['ignored', '/paths/~1employees/post/responses/default'],
		]);
	});

	it('sorts media types into json, form, text and binary', () => {
		expect(
			[
				'application/json',
				'application/problem+json; charset=utf-8',
				'multipart/form-data',
				'application/x-www-form-urlencoded',
				'text/plain',
				'application/octet-stream',
				'image/png',
			].map(mediaKind),
		).toEqual(['json', 'json', 'form', 'form', 'text', 'binary', 'binary']);
	});
});

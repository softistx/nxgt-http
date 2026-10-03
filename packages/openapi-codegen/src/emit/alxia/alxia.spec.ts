import { afterAll, describe, expect, it } from 'bun:test';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operations as kitchenSink } from '../../../test/generated/kitchen-sink/alxia';
import { CodegenError } from '../../errors';
import { type GenerateOptions, generate, generateFiles } from '../../generate';
import { createMemoryFileSystem } from '../../loader/fs';

const doc = (paths: object, schemas: object = {}, openapi = '3.2.0') =>
	JSON.stringify({
		openapi,
		info: { title: 't', version: '1' },
		paths,
		components: { schemas },
	});

const json = (schema: object) => ({ 'application/json': { schema } });
const ok = { '200': { description: 'ok', content: json({ type: 'string' }) } };

/** `alxia.ts` for `spec`, and the warnings it came with. */
async function alxia(
	spec: string,
	options: Partial<GenerateOptions> = {},
): Promise<{ code: string; operations: string; messages: string[] }> {
	const { files, warnings } = await generateFiles(
		{ input: '/s/openapi.json', output: '/s/gen', alxia: true, ...options },
		{ fs: createMemoryFileSystem({ '/s/openapi.json': spec }) },
	);
	const content = (name: string) =>
		files.find((f) => f.path === `/s/gen/${name}`)?.content ?? '';
	return {
		code: content('alxia.ts'),
		operations: content('operations.ts'),
		messages: warnings.map((w) => `${w.code}: ${w.message}`),
	};
}

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true }))));

describe('alxia.ts', () => {
	it('writes the path with :name, the method uppercased, and the detail the spec gives', async () => {
		const { code } = await alxia(
			doc({
				'/pets/{petId}/toys/{toyId}': {
					get: {
						operationId: 'getToy',
						summary: 'A toy.',
						tags: ['toys'],
						parameters: ['petId', 'toyId'].map((name) => ({
							name,
							in: 'path',
							required: true,
							schema: { type: 'string' },
						})),
						responses: ok,
					},
				},
				'/pets': {
					query: { operationId: 'searchPets', responses: ok },
				},
			}),
		);
		expect(code).toContain(
			"\tmethod: 'GET',\n\tpath: '/pets/:petId/toys/:toyId',",
		);
		expect(code).toContain("\tmethod: 'QUERY',\n\tpath: '/pets',");
		expect(code).toContain(
			"detail: { operationId: 'getToy', summary: 'A toy.', tags: ['toys'] },",
		);
		expect(code).toContain("detail: { operationId: 'searchPets' },");
		expect(code).toContain(
			'export const operations = {\n\tgetToy,\n\tsearchPets,\n} as const;',
		);
		expect(code).not.toContain('@alxia/core');
	});

	it('reads a query list given once as a list of one, and splits a list sent with commas', async () => {
		const { query, headers } = kitchenSink.getPet.schema;
		expect(query.parse({ fields: 'name', ids: '1,2' })).toMatchObject({
			fields: ['name'],
			ids: [1, 2],
			verbose: false,
		});
		expect(query.parse({ fields: ['a', 'b'] }).fields).toEqual(['a', 'b']);
		expect(query.safeParse({ ids: '1,x' }).success).toBe(false);
		// Headers arrive lowercased, as alxia reads them.
		const id = '6f1c2b8e-1d3a-4b5c-9e7f-0a1b2c3d4e5f';
		expect(headers.parse({ 'x-request-id': id })).toEqual({
			'x-request-id': id,
		});
		expect(kitchenSink.getPet.schema.params.parse({ petId: '3' })).toEqual({
			petId: 3,
		});
		expect(
			kitchenSink.getPet.schema.params.safeParse({ petId: '' }).success,
		).toBe(false);
		// A reply with no content: alxia sends it with no body.
		expect(kitchenSink.deletePet.schema.response[204].parse(undefined)).toBe(
			undefined,
		);
	});

	it('splits a header list, and pipes a path enum of strings from a string', async () => {
		const { code } = await alxia(
			doc({
				'/kinds/{kind}': {
					get: {
						operationId: 'getKind',
						parameters: [
							{
								name: 'kind',
								in: 'path',
								required: true,
								schema: { enum: ['cat', 'dog'] },
							},
							{
								name: 'X-Tags',
								in: 'header',
								schema: { type: 'array', items: { type: 'string' } },
							},
						],
						responses: ok,
					},
				},
			}),
		);
		expect(code).toContain("kind: z.string().pipe(z.enum(['cat', 'dog'])),");
		expect(code).toContain(
			"'x-tags': z.preprocess(headerList, z.array(z.string())).optional(),",
		);
		expect(code).toContain('const headerList = ');
	});

	it('leaves out the 400 validationErrors declares, and keeps the one the spec does', async () => {
		const parameters = [{ name: 'q', in: 'query', schema: { type: 'string' } }];
		const { code, operations } = await alxia(
			doc(
				{
					'/a': { get: { operationId: 'a', parameters, responses: ok } },
					'/b': {
						get: {
							operationId: 'b',
							parameters,
							responses: {
								...ok,
								'400': {
									description: 'refused',
									content: json({ $ref: '#/components/schemas/Problem' }),
								},
							},
						},
					},
				},
				{
					Problem: {
						type: 'object',
						properties: { title: { type: 'string' } },
					},
				},
			),
		);
		expect(operations).toContain('zValidationErrorBody');
		expect(code).not.toContain('ValidationErrorBody');
		expect(code).toContain('\t\t\t400: zProblem,');
		expect(code.match(/\t400:/g)).toHaveLength(1);
	});

	it('leaves out, with a warning, what alxia cannot route or validate', async () => {
		const reply = (content: object) => ({
			'200': { description: 'ok', content },
		});
		const { code, messages } = await alxia(
			doc({
				'/files/{name}.json': {
					get: {
						operationId: 'mixed',
						parameters: [
							{
								name: 'name',
								in: 'path',
								required: true,
								schema: { type: 'string' },
							},
						],
						responses: ok,
					},
				},
				'/items/{item-id}': {
					get: {
						operationId: 'dashed',
						parameters: [
							{
								name: 'item-id',
								in: 'path',
								required: true,
								schema: { type: 'string' },
							},
						],
						responses: ok,
					},
				},
				'/users/{id}': {
					get: {
						operationId: 'byId',
						parameters: [
							{
								name: 'id',
								in: 'path',
								required: true,
								schema: { type: 'string' },
							},
						],
						responses: ok,
					},
				},
				'/users/{name}': {
					put: {
						operationId: 'byName',
						parameters: [
							{
								name: 'name',
								in: 'path',
								required: true,
								schema: { type: 'string' },
							},
						],
						responses: ok,
					},
				},
				'/trace': { trace: { operationId: 'traced', responses: ok } },
				'/upload': {
					post: {
						operationId: 'upload',
						requestBody: {
							content: { 'application/octet-stream': {} },
						},
						responses: ok,
					},
				},
				'/download': {
					get: {
						operationId: 'download',
						responses: reply({ 'application/pdf': {} }),
					},
				},
				'/lines': {
					get: {
						operationId: 'lines',
						responses: reply({
							'application/jsonl': { itemSchema: { type: 'string' } },
						}),
					},
				},
				'/events': {
					get: {
						operationId: 'events',
						responses: reply({
							'text/event-stream': {
								itemSchema: {
									type: 'object',
									required: ['event'],
									properties: { event: { const: 'ping' } },
								},
							},
						}),
					},
				},
			}),
		);
		expect(code).toContain('export const operations = {\n\tbyId,\n} as const;');
		const ignored = messages.filter((m) => m.startsWith('ignored: '));
		expect(ignored).toEqual([
			'ignored: mixed: alxia.ts leaves it out. alxia cannot route /files/{name}.json: a path parameter must fill its whole segment, and {name}.json does not',
			'ignored: dashed: alxia.ts leaves it out. alxia cannot route /items/{item-id}: :item-id is not a parameter name it reads. Name it with letters, digits and _',
			'ignored: byName: alxia.ts leaves it out. alxia cannot route /users/{name} beside /users/{id}: the two match the same requests with other parameter names. Name the parameters alike',
			'ignored: traced: alxia.ts leaves it out. alxia has no TRACE routes',
			'ignored: upload: alxia.ts leaves it out. Its body is application/octet-stream, which alxia hands over as bytes, unvalidated: binary bodies and streams are not declared yet',
			'ignored: download: alxia.ts leaves it out. Its 200 reply is application/pdf: binary replies are not declared yet',
			'ignored: lines: alxia.ts leaves it out. Its 200 reply is JSON Lines (application/jsonl), which alxia does not stream yet',
			'ignored: events: alxia.ts leaves it out. Its 200 reply streams events alxia cannot send: its eventStream sends unnamed events, each its data as JSON',
		]);
	});

	it('takes application/json out of several media types, with a warning, and drops a status alxia has no type for', async () => {
		const { code, messages } = await alxia(
			doc({
				'/notes': {
					post: {
						operationId: 'addNote',
						requestBody: {
							required: true,
							content: {
								'text/plain': { schema: { type: 'string' } },
								...json({
									type: 'object',
									properties: { text: { type: 'string' } },
								}),
							},
						},
						responses: {
							'201': {
								description: 'made',
								content: {
									'text/html': { schema: { type: 'string' } },
									...json({
										type: 'object',
										properties: { id: { type: 'string' } },
									}),
								},
							},
							'306': { description: 'unused' },
						},
					},
				},
			}),
		);
		expect(code).toContain('\t\tbody: zAddNoteBody,');
		expect(code).toContain('\t\t\t201: zAddNote201Response,');
		expect(code).not.toContain('306');
		expect(messages.filter((m) => m.startsWith('not_enforced: '))).toEqual([
			'not_enforced: addNote: alxia validates a body with one schema, so it is declared as application/json: a body sent as text/plain is checked against that schema too',
			'not_enforced: addNote: alxia declares one schema per status, so its 201 reply is declared as application/json only, not text/html',
			'not_enforced: addNote: alxia has no status 306, so alxia.ts leaves that reply out, and the handler cannot send it',
		]);
	});

	it('reads a form body as alxia does, and makes a body the spec does not require optional', async () => {
		const { code } = await alxia(
			doc({
				'/forms': {
					post: {
						operationId: 'sendForm',
						requestBody: {
							content: {
								'application/x-www-form-urlencoded': {
									schema: {
										type: 'object',
										required: ['n'],
										properties: {
											n: { type: 'integer' },
											tags: { type: 'array', items: { type: 'string' } },
										},
									},
								},
							},
						},
						responses: { '204': { description: 'done' } },
					},
				},
			}),
		);
		expect(code).toContain(
			[
				'\t\tbody: z.object({',
				'\t\t\tn: numeric.pipe(z.int()),',
				'\t\t\ttags: z.preprocess(repeated, z.array(z.string())).optional(),',
				'\t\t}).optional(),',
			].join('\n'),
		);
		expect(code).toContain('\t\t\t204: z.undefined(),');
	});

	it('declares an operation whose id is not an identifier by its camelCase, keyed by the id', async () => {
		const { code } = await alxia(
			doc({ '/board': { get: { operationId: 'get-board', responses: ok } } }),
		);
		expect(code).toContain('export const getBoard = {');
		expect(code).toContain("\t'get-board': getBoard,");
		expect(code).toContain("`app.route(operations['get-board'], handler)`");
	});

	it('refuses an operationId that would shadow a name alxia.ts declares', async () => {
		for (const operationId of ['operations', 'zPet', 'numeric']) {
			const error = await alxia(
				doc(
					{ '/x': { get: { operationId, responses: ok } } },
					{ Pet: { type: 'string' } },
				),
			).catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(CodegenError);
			expect((error as CodegenError).diagnostics.map((d) => d.code)).toEqual([
				'name_collision',
			]);
		}
		// Without the option, nothing is claimed.
		const { files } = await generateFiles(
			{ input: '/s/openapi.json', output: '/s/gen' },
			{
				fs: createMemoryFileSystem({
					'/s/openapi.json': doc({
						'/x': { get: { operationId: 'operations', responses: ok } },
					}),
				}),
			},
		);
		expect(files.map((f) => f.path)).not.toContain('/s/gen/alxia.ts');
	});

	it('renames a const that would shadow a reserved word or a global the helpers call', async () => {
		const path = (operationId: string, at: string) => ({
			[at]: {
				get: {
					operationId,
					parameters: [
						{
							name: 'n',
							in: 'path',
							required: true,
							schema: { type: 'integer' },
						},
					],
					responses: ok,
				},
			},
		});
		const { code } = await alxia(
			doc({ ...path('Number', '/a/{n}'), ...path('delete', '/b/{n}') }),
		);
		expect(code).toContain('export const NumberOperation = {');
		expect(code).toContain('export const deleteOperation = {');
		expect(code).toContain(
			'\tNumber: NumberOperation,\n\tdelete: deleteOperation,',
		);
		expect(code).toContain('.transform(Number);');
	});

	it('lets an operation share its name with a schema: alxia.ts declares values, types.ts types', async () => {
		const { code } = await alxia(
			doc(
				{
					'/pet': {
						get: {
							operationId: 'Pet',
							responses: {
								'200': {
									description: 'ok',
									content: json({ $ref: '#/components/schemas/Pet' }),
								},
							},
						},
					},
				},
				{ Pet: { type: 'string' } },
			),
		);
		expect(code).toContain('export const Pet = {');
		expect(code).toContain('\t\t\t200: zPet,');
	});

	it('leaves out a path that names a parameter twice, or holds what alxia reads as one', async () => {
		const { messages } = await alxia(
			doc({
				'/d/{x}/{x}': {
					get: {
						operationId: 'twice',
						parameters: [
							{
								name: 'x',
								in: 'path',
								required: true,
								schema: { type: 'string' },
							},
						],
						responses: ok,
					},
				},
				'/files/*': { get: { operationId: 'star', responses: ok } },
			}),
		);
		expect(messages.filter((m) => m.startsWith('ignored: '))).toEqual([
			'ignored: twice: alxia.ts leaves it out. alxia cannot route /d/{x}/{x}: it declares :x twice',
			'ignored: star: alxia.ts leaves it out. alxia cannot route /files/*: it would read * as a parameter',
		]);
	});

	it('warns when a form body is not read field by field', async () => {
		const { code, messages } = await alxia(
			doc(
				{
					'/forms': {
						post: {
							operationId: 'sendForm',
							requestBody: {
								required: true,
								content: {
									'multipart/form-data': {
										schema: {
											allOf: [{ $ref: '#/components/schemas/Base' }],
											properties: { age: { type: 'integer' } },
										},
									},
								},
							},
							responses: ok,
						},
					},
				},
				{ Base: { type: 'object', properties: { name: { type: 'string' } } } },
			),
		);
		expect(code).toContain('\t\tbody: zSendFormBody,');
		expect(messages).toContain(
			'not_enforced: sendForm: its multipart/form-data body is not a flat object, so its fields are not read from text: a number or a boolean sent in the form is refused',
		);
	});

	it('declares a text or JSON body and reply with no schema as any text, or any value', async () => {
		const { code } = await alxia(
			doc({
				'/raw': {
					post: {
						operationId: 'raw',
						requestBody: { required: true, content: { 'text/plain': {} } },
						responses: {
							'200': { description: 'ok', content: { 'text/plain': {} } },
							'201': { description: 'ok', content: { 'application/json': {} } },
						},
					},
				},
			}),
		);
		expect(code).toContain('\t\tbody: z.string(),');
		expect(code).toContain('\t\t\t200: z.string(),\n\t\t\t201: z.unknown(),');
	});

	it('writes an empty table, importing nothing, when alxia can route no operation', async () => {
		const { code } = await alxia(
			doc({ '/t': { trace: { operationId: 'traced', responses: ok } } }),
		);
		expect(code).not.toContain('import');
		expect(code).toContain(
			'/** Every operation alxia routes, by operationId. */\nexport const operations = {} as const;',
		);
	});

	it('refuses an alxia option that is not a boolean', async () => {
		const error = await alxia(doc({}), {
			alxia: 'yes' as unknown as boolean,
		}).catch((caught: unknown) => caught);
		expect((error as CodegenError).diagnostics[0]?.code).toBe('invalid_option');
	});

	it('is removed once the option is off', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'openapi-codegen-alxia-'));
		dirs.push(cwd);
		await writeFile(join(cwd, 'openapi.json'), doc({}));
		const options = { input: 'openapi.json', output: 'gen' };
		await generate({ ...options, alxia: true }, { cwd });
		await access(join(cwd, 'gen/alxia.ts'));
		const { removed } = await generate(options, { cwd });
		expect(removed).toEqual([join(cwd, 'gen/alxia.ts')]);
	});
});

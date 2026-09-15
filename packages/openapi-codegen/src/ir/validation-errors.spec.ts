/** The engine's 400, declared beside what the spec declares. */
import { describe, expect, it } from 'bun:test';
import { CodegenError } from '../errors';
import { generateFiles } from '../generate';
import { loadDocument } from '../loader/document';
import { createMemoryFileSystem } from '../loader/fs';
import { buildIR } from './index';
import type { ApiIR } from './types';
import {
	VALIDATION_ERROR_BODY,
	withValidationErrors,
} from './validation-errors';

const SPEC = `openapi: 3.1.0
info: { title: Items, version: '1' }
paths:
  /health:
    get:
      operationId: health
      responses:
        '200': { description: up }
  /items:
    post:
      operationId: createItem
      requestBody:
        required: true
        content: { application/json: { schema: { type: object } } }
      responses:
        '201': { description: created }
        '400':
          description: refused
          content: { text/plain: { schema: { type: string } } }
  /items/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: integer } }
    get:
      operationId: getItem
      responses:
        '200': { description: found }
        '404': { description: missing }
    put:
      operationId: putItem
      requestBody:
        required: true
        content: { application/json: { schema: { type: object } } }
      responses:
        '204': { description: done }
        '400':
          description: refused
          content:
            application/json: { schema: { $ref: '#/components/schemas/Problem' } }
    patch:
      operationId: patchItem
      requestBody:
        required: true
        content: { application/json: { schema: { type: object } } }
      responses:
        '204': { description: done }
        '400':
          description: refused
          content:
            application/problem+json: { schema: { $ref: '#/components/schemas/Problem' } }
components:
  schemas:
    Problem:
      type: object
      properties: { title: { type: string } }
`;

const FILE = '/spec/openapi.yaml';
const memory = (spec: string) => createMemoryFileSystem({ [FILE]: spec });

async function declared(spec = SPEC): Promise<ApiIR> {
	const doc = await loadDocument(FILE, { fs: memory(spec) });
	return withValidationErrors(buildIR(doc), doc.entry);
}

const responsesOf = (ir: ApiIR, id: string) =>
	ir.operations.find((operation) => operation.operationId === id)?.responses ??
	[];

describe('withValidationErrors', () => {
	it('declares the body once, and a 400 on an operation the spec gives none', async () => {
		const ir = await declared();
		const [body] = ir.schemas;
		expect(body?.name).toBe(VALIDATION_ERROR_BODY);
		const ref = { kind: 'ref' as const, target: body?.id ?? '' };
		const getItem = responsesOf(ir, 'getItem');
		expect(getItem.map((r) => r.status)).toEqual([200, 400, 404]);
		expect(getItem[1]?.content).toEqual([
			{ mediaType: 'application/json', kind: 'json', schema: ref },
		]);
	});

	it('leaves an operation that takes nothing, which the engine never refuses', async () => {
		const ir = await declared();
		expect(responsesOf(ir, 'health').map((r) => r.status)).toEqual([200]);
	});

	it('adds its JSON to a 400 with none, and joins the schema a JSON reply is read as', async () => {
		const ir = await declared();
		const four = (id: string) =>
			responsesOf(ir, id).find((r) => r.status === 400)?.content ?? [];
		expect(four('createItem').map((m) => m.mediaType)).toEqual([
			'text/plain',
			'application/json',
		]);
		// `application/json` itself, or the JSON type `c.json()` stands for.
		for (const [id, type] of [
			['putItem', 'application/json'],
			['patchItem', 'application/problem+json'],
		] as const) {
			const [only, ...rest] = four(id);
			expect([only?.mediaType, rest.length]).toEqual([type, 0]);
			const schema = only?.schema;
			expect(
				schema?.kind === 'union' && schema.variants.map((v) => v.kind),
			).toEqual(['ref', 'ref']);
		}
	});

	it('changes nothing in a spec whose operations take nothing', async () => {
		const doc = await loadDocument(FILE, {
			fs: memory(SPEC.split('  /items:')[0] ?? ''),
		});
		const ir = buildIR(doc);
		expect(withValidationErrors(ir, doc.entry)).toBe(ir);
	});
});

describe('the validationErrors option', () => {
	const types = async (options: { validationErrors?: unknown } = {}) => {
		const { files } = await generateFiles(
			{ input: FILE, output: '/out', ...(options as object) },
			{ fs: memory(SPEC) },
		);
		return files.find((file) => file.path.endsWith('/types.ts'))?.content;
	};

	it('is on by default, and off with false', async () => {
		expect(await types()).toContain('export interface ValidationErrorBody {');
		expect(await types({ validationErrors: false })).not.toContain(
			VALIDATION_ERROR_BODY,
		);
	});

	it('refuses anything but a boolean, and a schema of the same name', async () => {
		const wrong = await types({ validationErrors: 'yes' }).catch(
			(caught: unknown) => caught,
		);
		expect((wrong as CodegenError).diagnostics[0]?.code).toBe('invalid_option');

		const taken = await generateFiles(
			{ input: FILE, output: '/out' },
			{
				fs: memory(`${SPEC}    ValidationErrorBody: { type: object }\n`),
			},
		).catch((caught: unknown) => caught);
		expect(taken).toBeInstanceOf(CodegenError);
		expect((taken as CodegenError).diagnostics[0]?.code).toBe('name_collision');
	});
});

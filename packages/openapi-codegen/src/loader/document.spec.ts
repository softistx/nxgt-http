import { describe, expect, it } from 'bun:test';
import { CodegenError } from '../errors';
import { loadDocument } from './document';
import { createMemoryFileSystem } from './fs';

const loadRoot = (text: string) =>
	loadDocument('openapi.yaml', {
		cwd: '/spec',
		fs: createMemoryFileSystem({ '/spec/openapi.yaml': text }),
	});

async function rejectionOf(text: string) {
	const error = await loadRoot(text).catch((e: unknown) => e);
	if (!(error instanceof CodegenError))
		throw new Error('expected a CodegenError');
	return error;
}

describe('loadDocument — the version gate', () => {
	it('accepts OpenAPI 3.1 and 3.2', async () => {
		const v31 = await loadRoot('openapi: 3.1.1\ninfo: {}\npaths: {}\n');
		const v32 = await loadRoot('openapi: 3.2.0\ninfo: {}\npaths: {}\n');
		expect([v31.version, v31.openapi]).toEqual(['3.1', '3.1.1']);
		expect([v32.version, v32.openapi]).toEqual(['3.2', '3.2.0']);
	});

	it('rejects 3.0 and Swagger at the field that says so, before crawling', async () => {
		// The broken $ref is not reported: the version is the one error that matters.
		const v30 = await rejectionOf(
			'openapi: 3.0.3\npaths: { /a: { $ref: ./missing.yaml } }\n',
		);
		expect(v30.diagnostics.map((d) => [d.code, d.pointer])).toEqual([
			['unsupported_version', '/openapi'],
		]);

		const swagger = await rejectionOf("swagger: '2.0'\n");
		expect(swagger.diagnostics.map((d) => [d.code, d.pointer])).toEqual([
			['unsupported_version', '/swagger'],
		]);
	});

	it('says a file with no `openapi` field is probably not the root', async () => {
		const error = await rejectionOf('type: object\n');
		expect(error.diagnostics.map((d) => d.code)).toEqual(['missing_version']);
	});

	it('reports a missing entry file', async () => {
		const error = await loadDocument('/spec/nope.yaml', {
			fs: createMemoryFileSystem({}),
		}).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(CodegenError);
		expect((error as CodegenError).diagnostics.map((d) => d.code)).toEqual([
			'file_not_found',
		]);
	});

	it('names each problem relative to the spec, with its code', async () => {
		const error = await rejectionOf(
			'openapi: 3.2.0\npaths: { /a: { $ref: ./paths/missing.yaml } }\n',
		);
		expect(error.message).toContain(
			'error openapi.yaml#/paths/~1a/$ref: cannot find /spec/paths/missing.yaml [file_not_found]',
		);
	});
});

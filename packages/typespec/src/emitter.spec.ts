/**
 * The emitter `@nxgt/typespec`, run by the compiler on the queries fixture
 * into a scratch folder: what it refuses before `@typespec/openapi3` writes
 * anything, and that a dry run passes through.
 */
import { afterAll, expect, it } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, NodeHost } from '@typespec/compiler';
import { project } from '../test/generate';

const dirs: string[] = [];
afterAll(() =>
	Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))),
);

async function emit(
	options: Record<string, unknown>,
	emitter = '@nxgt/typespec',
	dryRun = false,
) {
	const output = await mkdtemp(join(tmpdir(), 'nxgt-emitter-'));
	dirs.push(output);
	const program = await compile(NodeHost, `${project('queries')}main.tsp`, {
		emit: [emitter],
		dryRun,
		options: {
			[emitter]: { 'emitter-output-dir': output, ...options },
		},
	});
	return {
		codes: program.diagnostics.map(({ code }) => code),
		messages: program.diagnostics.map(({ message }) => message),
		files: await readdir(output, { recursive: true }),
	};
}

it('emits 3.2 with the QUERY', async () => {
	const { codes, files } = await emit({ 'openapi-versions': ['3.2.0'] });
	expect(codes).toEqual([]);
	expect(files).toContain('openapi.yaml');
});

it('refuses an older version beside a @queryMethod, and writes nothing', async () => {
	const { codes, messages, files } = await emit({
		'openapi-versions': ['3.1.0', '3.2.0'],
	});
	expect(codes).toEqual(['@nxgt/typespec/query-method-needs-openapi-3.2']);
	expect(messages).toEqual([
		'search is marked @queryMethod: only OpenAPI 3.2 has a QUERY operation, and openapi-versions asks for 3.1.0. Emit 3.2 only, or take off @queryMethod.',
	]);
	expect(files).toEqual([]);
	// Unset, `@typespec/openapi3` emits 3.0.0.
	expect((await emit({})).codes).toEqual([
		'@nxgt/typespec/query-method-needs-openapi-3.2',
	]);
});

it("checks its options with @typespec/openapi3's schema", async () => {
	const typo = await emit({ 'opanapi-versions': ['3.2.0'] });
	expect(typo.codes).toEqual(['invalid-schema']);
	expect(typo.files).toEqual([]);
	const xml = await emit({ 'openapi-versions': ['3.2.0'], 'file-type': 'xml' });
	// One per rule the value breaks; never a crash of the emitter.
	expect(xml.codes.length).toBeGreaterThan(0);
	expect(new Set(xml.codes)).toEqual(new Set(['invalid-schema']));
});

it('refuses a @queryMethod emitted by @typespec/openapi3, which would write a POST', async () => {
	const { codes, messages } = await emit(
		{ 'openapi-versions': ['3.2.0'] },
		'@typespec/openapi3',
	);
	expect(codes).toContain('@nxgt/typespec/query-method-needs-nxgt-emitter');
	expect(messages).toContain(
		'search is marked @queryMethod: emit with @nxgt/typespec, which writes it as a QUERY; @typespec/openapi3 would write a POST.',
	);
});

it('runs on a dry run, and writes nothing', async () => {
	const { codes, files } = await emit(
		{ 'openapi-versions': ['3.2.0'] },
		undefined,
		true,
	);
	expect(codes).toEqual([]);
	expect(files).toEqual([]);
});

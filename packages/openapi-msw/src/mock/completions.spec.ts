/**
 * What an editor offers in `reply(status, { … })`, asked of TypeScript's
 * language service as an editor asks it: the fields of the body declared for
 * that status, then only those not written yet.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dir, '../..');
/** Not on disk: its unfinished bodies would fail `tsc`. */
const FILE = resolve(ROOT, 'test/types/completions.virtual.ts');
const SOURCE = `
import { createOpenApiMsw } from '../../src/index';
import { operations } from '../generated/operations.js';

const mock = createOpenApiMsw(operations);
mock.get('/items/{id}', ({ reply }) => reply(200, { /*ok*/ }));
mock.get('/items/{id}', ({ reply }) => reply(404, { /*missing*/ }));
mock.op('createItem', ({ reply }) => reply(201, { name: 'a', /*rest*/ }));
mock.get('/items/{id}', async ({ param, reply }) => {
	if (param.id === 1) return reply(200, { /*branch*/ });
	return reply(404, { title: 'gone' });
});
`;

const config = ts.parseJsonConfigFileContent(
	ts.readConfigFile(resolve(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
	ts.sys,
	ROOT,
);
const service = ts.createLanguageService({
	getScriptFileNames: () => [FILE],
	getScriptVersion: () => '1',
	getScriptSnapshot: (name) =>
		name === FILE
			? ts.ScriptSnapshot.fromString(SOURCE)
			: ts.sys.fileExists(name)
				? ts.ScriptSnapshot.fromString(readFileSync(name, 'utf8'))
				: undefined,
	getCurrentDirectory: () => ROOT,
	getCompilationSettings: () => config.options,
	getDefaultLibFileName: ts.getDefaultLibFilePath,
	fileExists: (name) => name === FILE || ts.sys.fileExists(name),
	readFile: (name) => (name === FILE ? SOURCE : ts.sys.readFile(name)),
	readDirectory: ts.sys.readDirectory,
	directoryExists: ts.sys.directoryExists,
	getDirectories: ts.sys.getDirectories,
});

/** The fields offered at `/*marker*\/`, sorted. */
const offered = (marker: string): string[] => {
	const tag = `/*${marker}*/`;
	const position = SOURCE.indexOf(tag) + tag.length;
	const found = service.getCompletionsAtPosition(FILE, position, {});
	return (found?.entries ?? [])
		.filter((entry) => entry.kind === 'property')
		.map((entry) => entry.name)
		.sort();
};

const ITEM = ['createdAt', 'id', 'name', 'price'];

describe('reply completions', () => {
	test('offers the body declared for the status', () => {
		expect(offered('ok')).toEqual(ITEM);
		expect(offered('missing')).toEqual(['title']);
		expect(offered('branch')).toEqual(ITEM);
	}, 60_000);

	test('offers the fields not written yet', () => {
		expect(offered('rest')).toEqual(ITEM.filter((name) => name !== 'name'));
	});
});

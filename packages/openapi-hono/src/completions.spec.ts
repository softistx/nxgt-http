/**
 * What an editor offers in `c.json({ … }, status)`, asked of TypeScript's
 * language service as an editor asks it: the fields of the body declared for
 * that status. Hono's own `c.json` offers none, since its body is any `T`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dir, '..');
/** Not on disk: its unfinished bodies would fail `tsc`. */
const FILE = resolve(ROOT, 'test/types/completions.virtual.ts');
const SOURCE = `
import { Hono } from 'hono';
import { createRoutes as dateRoutes } from '../generated/dates/hono.js';
import { createRoutes } from '../generated/split/hono.js';

const routes = createRoutes(new Hono());
routes.get('/employees/{id}', (c) => c.json({ /*ok*/ }, 200));
routes.get('/employees/{id}', (c) => c.json({ id: '1', /*rest*/ }, 200));
routes.get('/employees/{id}', async (c) => c.json({ /*missing*/ }, 404));
routes.operation('getEmployee', (c) => {
	if (Math.random() > 0.5) return c.json({ /*branch*/ }, 200);
	return c.json({ message: 'gone' }, 404);
});
dateRoutes(new Hono()).post('/events', (c) => c.json({ /*dated*/ }, 201));
`;

const config = ts.parseJsonConfigFileContent(
	ts.readConfigFile(resolve(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
	ts.sys,
	ROOT,
);
const snapshot = (name: string) =>
	name === FILE
		? ts.ScriptSnapshot.fromString(SOURCE)
		: ts.sys.fileExists(name)
			? ts.ScriptSnapshot.fromString(readFileSync(name, 'utf8'))
			: undefined;
const service = ts.createLanguageService({
	getScriptFileNames: () => [FILE],
	getScriptVersion: () => '1',
	getScriptSnapshot: snapshot,
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

const EMPLOYEE = [
	'createdAt',
	'email',
	'id',
	'manager',
	'name',
	'status',
	'tags',
];

describe('c.json completions', () => {
	test('offers the body declared for the status', () => {
		expect(offered('ok')).toEqual(EMPLOYEE);
		expect(offered('missing')).toEqual(['debugMessage', 'message', 'status']);
		expect(offered('branch')).toEqual(EMPLOYEE);
	}, 60_000);

	test('offers the fields not written yet', () => {
		expect(offered('rest')).toEqual(EMPLOYEE.filter((name) => name !== 'id'));
	});

	test('offers them with dates as Dates', () => {
		expect(offered('dated')).toEqual(
			expect.arrayContaining(['createdAt', 'id', 'startsAt', 'title']),
		);
	});
});

/**
 * The `tsp init` template in `templates/`. `tsp init` renders its files with
 * Mustache and installs its packages from npm; here the two placeholders it
 * uses are filled in by hand, into `test/scaffolded/`, where this package
 * resolves. The project compiles, and passes the linter it turns on.
 */
import { afterAll, expect, it } from 'bun:test';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
	compile,
	type LinterRuleSet,
	NodeHost,
	navigateProgram,
} from '@typespec/compiler';
import { getOperationId } from '@typespec/openapi';

const templates = new URL('../templates/', import.meta.url);
const directory = new URL('../test/scaffolded/', import.meta.url);

afterAll(() => rm(directory, { recursive: true, force: true }));

interface Template {
	readonly libraries: readonly string[];
	readonly config: { readonly linter: LinterRuleSet };
	readonly emitters: Record<string, unknown>;
	readonly files: readonly { path: string; destination: string }[];
}

async function template(): Promise<Template> {
	const index = JSON.parse(
		await readFile(new URL('scaffolding.json', templates), 'utf8'),
	);
	return index.nxgt;
}

/** What `tsp init --project-name petstore` writes for the two placeholders. */
function rendered(text: string): string {
	return text
		.replaceAll(
			'{{#casing.pascalCase}}{{name}}{{/casing.pascalCase}}',
			'Petstore',
		)
		.replaceAll('{{name}}', 'petstore');
}

it('lists files that exist, and the packages they import', async () => {
	const { files, libraries, emitters } = await template();
	for (const { path } of files) {
		await access(new URL(path, templates));
	}
	expect(libraries).toContain('@nxgt/typespec');
	expect(libraries).toContain('@nxgt/openapi-codegen');
	expect(Object.keys(emitters)).toEqual(['@typespec/openapi3']);
});

it('scaffolds a spec that compiles and passes the linter', async () => {
	const { files, config } = await template();
	await mkdir(directory, { recursive: true });
	for (const { path, destination } of files) {
		const text = rendered(await readFile(new URL(path, templates), 'utf8'));
		expect(text).not.toContain('{{');
		await writeFile(new URL(destination, directory), text);
	}
	const program = await compile(
		NodeHost,
		fileURLToPath(new URL('main.tsp', directory)),
		{ noEmit: true, linterRuleSet: config.linter },
	);
	expect(program.diagnostics).toEqual([]);
	const ids: string[] = [];
	navigateProgram(program, {
		operation(operation) {
			const id = getOperationId(program, operation);
			if (id !== undefined) ids.push(id);
		},
	});
	expect(ids.sort()).toEqual([
		'createUser',
		'deleteUser',
		'getUser',
		'listUsers',
		'updateUser',
	]);
});

/**
 * The scalars of `lib/scalars/`, held to the registry in `test/scalars/`:
 * the same 65 names as @nxgt/graphql-scalars, one `.tsp` per scalar under its
 * category, each imported by its category's index, each emitting its
 * component, format, pattern, `x-nxgt-scalar` and the URL of its standard, and each sample accepted
 * or refused by the code generated from the scalars fixture, served by
 * `@nxgt/openapi-hono`.
 */
import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { spec, VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/scalars/3.1.0/hono';
import { createRoutes as routes32 } from '../test/generated/scalars/3.2.0/hono';
import {
	CATEGORIES,
	type Entry,
	GRAPHQL_SCALARS,
	type ScalarEntry,
} from '../test/scalars';

const LIB = fileURLToPath(new URL('../lib/', import.meta.url));
const served = { '3.1.0': routes31, '3.2.0': routes32 };

const declared = (entry: Entry): entry is ScalarEntry => 'scalar' in entry;
const kebab = (name: string) =>
	name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const categories = Object.entries(CATEGORIES);
const entries = categories.flatMap(([, list]) => list);

describe('the scalars registry', () => {
	it('has the names @nxgt/graphql-scalars has, each once', () => {
		expect(entries.map((entry) => entry.name).sort()).toEqual(
			[...GRAPHQL_SCALARS].sort(),
		);
	});

	it('has a category for each folder of lib/scalars/, and no other', async () => {
		const folders = (await readdir(`${LIB}scalars`, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		expect(folders.sort()).toEqual(Object.keys(CATEGORIES).sort());
		const index = await readFile(`${LIB}scalars.tsp`, 'utf8');
		for (const category of folders) {
			expect(index).toContain(`import "./scalars/${category}.tsp";`);
		}
	});

	describe.each(categories)('the %s category', (category, list) => {
		it('has one file per declared scalar, each imported by its index', async () => {
			const files = await readdir(`${LIB}scalars/${category}`);
			expect(files.sort()).toEqual(
				list
					.filter(declared)
					.map((entry) => `${kebab(entry.scalar)}.tsp`)
					.sort(),
			);
			const index = await readFile(`${LIB}scalars/${category}.tsp`, 'utf8');
			for (const file of files) {
				expect(index).toContain(`import "./${category}/${file}";`);
			}
		});

		it('declares each scalar under its name', async () => {
			for (const entry of list.filter(declared)) {
				const source = await readFile(
					`${LIB}scalars/${category}/${kebab(entry.scalar)}.tsp`,
					'utf8',
				);
				expect(source).toMatch(
					new RegExp(`\\bscalar ${entry.scalar} extends \\w+`),
				);
			}
		});
	});
});

describe.each([...VERSIONS])('the scalars, in OpenAPI %s', (version) => {
	const components = async (): Promise<
		Record<string, Record<string, unknown>>
	> => {
		const document = Bun.YAML.parse(
			await readFile(spec('scalars', version), 'utf8'),
		) as { components: { schemas: Record<string, Record<string, unknown>> } };
		return document.components.schemas;
	};

	it.each(
		entries.filter(declared).map((entry) => [entry.name, entry] as const),
	)('emits %s as its component', async (name, entry) => {
		const schema = (await components())[name];
		expect(schema).toBeDefined();
		expect(schema?.['x-nxgt-scalar']).toBe(name);
		expect(schema?.['format']).toBe(entry.format);
		if (entry.specifiedBy) {
			expect(schema?.['description']).toContain(
				`Specified by ${entry.specifiedBy}.`,
			);
		}
	});

	describe.each(categories)('POST /%s', (category, list) => {
		const scalars = list.filter(declared);
		const body = Object.fromEntries(
			scalars.map((entry) => [entry.scalar, entry.accept[0]]),
		);
		const post = (value: unknown) => {
			const app = new Hono();
			const routes = served[version](app, { validateResponses: true });
			// The route of each category echoes its body.
			(routes as unknown as Hono).post(`/${category}`, async (c) =>
				c.json(await c.req.json(), 200),
			);
			return app.request(`/${category}`, {
				method: 'POST',
				body: JSON.stringify(value),
				headers: { 'content-type': 'application/json' },
			});
		};

		it('accepts every sample', async () => {
			for (const entry of scalars) {
				for (const sample of entry.accept) {
					const sent = { ...body, [entry.scalar]: sample };
					const reply = await post(sent);
					expect({ [entry.name]: sample, status: reply.status }).toEqual({
						[entry.name]: sample,
						status: 200,
					});
					expect(await reply.json()).toEqual(sent);
				}
			}
		});

		it('refuses every sample it should', async () => {
			for (const entry of scalars) {
				for (const sample of entry.refuse) {
					const reply = await post({ ...body, [entry.scalar]: sample });
					expect({ [entry.name]: sample, status: reply.status }).toEqual({
						[entry.name]: sample,
						status: 400,
					});
				}
			}
		});
	});
});

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
import { generate } from '@nxgt/openapi-codegen';
import { compile, NodeHost } from '@typespec/compiler';
import { Hono } from 'hono';
import { spec, VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/scalars/3.1.0/hono';
import { createRoutes as routes32 } from '../test/generated/scalars/3.2.0/hono';
import {
	type BuiltinEntry,
	CATEGORIES,
	type Entry,
	GRAPHQL_SCALARS,
	type ScalarEntry,
} from '../test/scalars';

/** The numeric scalars the generator maps (`NUMBER_SCALARS` of its IR). */
const NUMBER_SCALARS = [
	'Latitude',
	'Longitude',
	'NegativeFloat',
	'NegativeInt',
	'NonNegativeFloat',
	'NonNegativeInt',
	'NonPositiveFloat',
	'NonPositiveInt',
	'Port',
	'PositiveFloat',
	'PositiveInt',
	'SafeInt',
];
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

	it('has a category for each index of lib/scalars/, each imported', async () => {
		const indexes = (await readdir(`${LIB}scalars`))
			.filter((name) => name.endsWith('.tsp'))
			.map((name) => name.slice(0, -'.tsp'.length));
		expect(indexes.sort()).toEqual(Object.keys(CATEGORIES).sort());
		const index = await readFile(`${LIB}scalars.tsp`, 'utf8');
		for (const category of indexes) {
			expect(index).toContain(`import "./scalars/${category}.tsp";`);
		}
	});

	it('writes each built-in as its entry names it, in a program that compiles', async () => {
		const main = fileURLToPath(
			new URL('../test/programs/value-scalars.tsp', import.meta.url),
		);
		const program = await compile(NodeHost, main, { noEmit: true });
		expect(program.diagnostics).toEqual([]);
		const source = await readFile(main, 'utf8');
		for (const entry of entries.filter(
			(entry): entry is BuiltinEntry => !declared(entry),
		)) {
			expect({ [entry.name]: source.includes(entry.builtin) }).toEqual({
				[entry.name]: true,
			});
		}
	});

	describe.each(categories)('the %s category', (category, list) => {
		it('has one file per declared scalar, each imported by its index', async () => {
			// A category of built-ins only has no folder.
			const files = await readdir(`${LIB}scalars/${category}`).catch(() => []);
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

	it('emits patterns that compile with and without the u flag, alike', async () => {
		const schemas = await components();
		for (const entry of entries.filter(declared)) {
			const pattern = schemas[entry.name]?.['pattern'];
			if (typeof pattern !== 'string') continue;
			const unicode = new RegExp(pattern, 'u');
			const legacy = new RegExp(pattern);
			if (entry.unicode) continue;
			for (const sample of [...entry.accept, ...entry.refuse]) {
				if (typeof sample !== 'string') continue;
				expect({
					[entry.name]: sample,
					same: unicode.test(sample) === legacy.test(sample),
				}).toEqual({ [entry.name]: sample, same: true });
			}
		}
	});

	it('gives each declared scalar a pattern, or a bound for a number', async () => {
		const schemas = await components();
		const bounds = [
			'minimum',
			'maximum',
			'exclusiveMinimum',
			'exclusiveMaximum',
		];
		for (const entry of entries.filter(declared)) {
			const schema = schemas[entry.name] ?? {};
			const ruled =
				schema['type'] === 'string'
					? schema['pattern'] !== undefined
					: bounds.some((bound) => schema[bound] !== undefined);
			expect({ [entry.name]: ruled }).toEqual({
				[entry.name]: true,
			});
		}
	});

	describe.each(categories.filter(([, list]) => list.some(declared)))(
		'POST /%s',
		(category, list) => {
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
		},
	);
});

describe('the scalars the generator knows', () => {
	for (const version of VERSIONS) {
		for (const scalars of ['pattern', 'exact'] as const) {
			it(`warns of no unknown_scalar in the fixture, ${version}, scalars: '${scalars}'`, async () => {
				// `check` writes nothing: the files are only compared with the disk.
				const { warnings } = await generate({
					input: spec('scalars', version),
					output: '/nowhere/generated',
					scalars,
					check: true,
				});
				expect(warnings.filter((w) => w.code === 'unknown_scalar')).toEqual([]);
			});
		}
	}
});

describe('the numeric scalars, with scalars: exact', () => {
	// The schemas of @nxgt/zod, not the bounds of the spec: generated beside the
	// fixtures (git ignores them), then each sample of the registry is run.
	const output = 'test/generated/scalars-exact';
	const numeric = entries.filter(
		(entry): entry is ScalarEntry =>
			declared(entry) &&
			(NUMBER_SCALARS as readonly string[]).includes(entry.name),
	);

	it('accepts and refuses what scalars: pattern does, but -0 of an integer', async () => {
		await generate({
			input: spec('scalars', '3.1.0'),
			output,
			scalars: 'exact',
		});
		const zod = (await import(
			fileURLToPath(new URL(`../${output}/zod.ts`, import.meta.url))
		)) as Record<string, { safeParse(value: unknown): { success: boolean } }>;
		expect(numeric.length).toBe(12);
		for (const entry of numeric) {
			const schema = zod[`z${entry.name}`];
			for (const sample of entry.accept) {
				expect({
					[entry.name]: sample,
					ok: schema?.safeParse(sample).success,
				}).toEqual({ [entry.name]: sample, ok: true });
			}
			for (const sample of entry.refuse) {
				expect({
					[entry.name]: sample,
					ok: schema?.safeParse(sample).success,
				}).toEqual({ [entry.name]: sample, ok: false });
			}
		}
		// `-0`: no JSON Schema can refuse it, and the schemas of @nxgt/zod do
		// for an integer, as GraphQL's `Int` does.
		for (const name of [
			'NonNegativeInt',
			'NonPositiveInt',
			'Port',
			'SafeInt',
		]) {
			expect(zod[`z${name}`]?.safeParse(-0).success, name).toBe(false);
			expect(zod[`z${name}`]?.safeParse(0).success, name).toBe(true);
		}
		for (const name of ['NonNegativeFloat', 'NonPositiveFloat', 'Latitude']) {
			expect(zod[`z${name}`]?.safeParse(-0).success, name).toBe(true);
		}
	});
});

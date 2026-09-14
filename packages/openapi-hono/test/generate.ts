/**
 * Writes what the specs serve under `test/generated/`, which git ignores:
 * the generator's own fixtures, generated with `hono: true`, and the perf
 * case. The fixtures' specs are `@nxgt/openapi-codegen`'s, read where they
 * sit, so both packages test the same code. The package's `test` and
 * `typecheck` scripts run this first.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	createMemoryFileSystem,
	type Dates,
	type GeneratedFile,
	generateFiles,
} from '@nxgt/openapi-codegen';
import { PERF_SIZE, perfRoutes, perfSpec } from './perf';

const TEST_DIR = fileURLToPath(new URL('./', import.meta.url));
const FIXTURES = fileURLToPath(
	new URL('../../openapi-codegen/test/fixtures/', import.meta.url),
);
const CASES = ['split', 'query', 'kitchen-sink', 'dates', 'streams'] as const;

/** What a case is generated with, beside `hono`. */
const OPTIONS: { [name: string]: { dates?: Dates } } = {
	dates: { dates: 'date' },
	streams: { dates: 'date' },
};

async function fixtureFiles(name: string): Promise<GeneratedFile[]> {
	const { files } = await generateFiles({
		input: `${FIXTURES}${name}/openapi.yaml`,
		output: `${TEST_DIR}generated/${name}`,
		hono: true,
		...OPTIONS[name],
	});
	return files;
}

/**
 * The perf case: `PERF_SIZE` generated operations, a route for each, and a
 * `tsconfig.json` so `src/perf.spec.ts` can measure them alone.
 */
async function perfFiles(): Promise<GeneratedFile[]> {
	const input = '/perf/openapi.json';
	const output = `${TEST_DIR}generated/perf`;
	const { files } = await generateFiles(
		{ input, output, hono: true },
		{
			fs: createMemoryFileSystem({
				[input]: JSON.stringify(perfSpec(PERF_SIZE)),
			}),
		},
	);
	return [
		...files,
		{ path: `${output}/routes.ts`, content: perfRoutes(PERF_SIZE) },
		// With the routes, and without: the difference is what the routes cost.
		tsconfig(`${output}/tsconfig.json`, { include: ['./*.ts'] }),
		tsconfig(`${output}/tsconfig.base.json`, { files: ['./hono.ts'] }),
	];
}

function tsconfig(path: string, sources: object): GeneratedFile {
	const config = {
		extends: '../../../tsconfig.json',
		compilerOptions: { rootDir: '../../..', noEmit: true },
		...sources,
	};
	return { path, content: `${JSON.stringify(config, null, '\t')}\n` };
}

// From scratch, so a file the generator stopped writing does not linger.
await rm(`${TEST_DIR}generated`, { recursive: true, force: true });
const cases = await Promise.all(CASES.map((name) => fixtureFiles(name)));
for (const generated of [...cases.flat(), ...(await perfFiles())]) {
	await mkdir(dirname(generated.path), { recursive: true });
	await writeFile(generated.path, generated.content);
}

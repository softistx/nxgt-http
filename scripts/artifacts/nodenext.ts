import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installedTsc, type Tsc } from './emit';
import { type Pkg, ROOT } from './packages';

/**
 * A package whose entry must refuse an unknown option: the proof that a type
 * read across files is the real one and not `any`. The source is the
 * statement; the `@ts-expect-error` above it is the assertion, and tsc
 * reports an expectation with nothing to expect as TS2578.
 */
const NOT_ANY: Record<string, string> = {
	'@nxgt/httpyz': `import { createHttpClient } from '@nxgt/httpyz';
// @ts-expect-error an unknown option is an error, so HttpClientOptions is not \`any\`
createHttpClient({ baseUrl: 'https://api.example.com', notAnOption: true });
`,
};

/** A consumer under `module: nodenext`, which checks the libraries it reads. */
export const NODENEXT_TSCONFIG = {
	compilerOptions: {
		types: ['bun'],
		typeRoots: [join(ROOT, 'node_modules', '@types')],
		lib: ['ESNext', 'DOM'],
		target: 'ESNext',
		module: 'nodenext',
		moduleResolution: 'nodenext',
		strict: true,
		noEmit: true,
		skipLibCheck: false,
	},
	include: ['*.ts'],
};

/** The source of one package's fixture: every subpath imported, and the case. */
export function fixtureSource(pkg: Pick<Pkg, 'name' | 'subpaths'>): string {
	const imports = pkg.subpaths.map(
		(subpath, i) => `import * as m${i} from '${subpath}';\nvoid m${i};\n`,
	);
	return `${imports.join('')}${NOT_ANY[pkg.name] ?? ''}export {};\n`;
}

/**
 * The lines of a tsc run that concern this repository's packages: an error in
 * a package's own declarations (`node_modules/@nxgt/…`) or in the fixture. A
 * dependency's own declarations (hono, msw, nuxt) are not ours to judge under
 * `skipLibCheck: false`.
 */
export function ownErrors(output: string): string[] {
	return output
		.split('\n')
		.filter(
			(line) =>
				/(^|\s)error TS\d+:/.test(line) &&
				(line.includes('node_modules/@nxgt/') ||
					!line.includes('node_modules/')),
		);
}

/**
 * Compiles, under `module: nodenext` with `skipLibCheck: false`, a consumer
 * that imports every subpath of every package from the installed tarballs;
 * false if a package's own declarations fail there.
 *
 * Under `nodenext` an ESM package's relative import must name its file with
 * an extension. The declarations tsc emits copy the sources' extensionless
 * specifiers (`from './client/types'`), which then resolve to nothing: each
 * type read through one is `any`, and `skipLibCheck: true`, which most
 * projects set, says nothing (softistx/nxgt-http#132). `build.ts` writes the
 * extension; this proves it, here and nowhere else, because the workspace
 * resolves a package to its own folder under `bundler`.
 */
export async function declarationsResolve(
	workdir: string,
	packages: readonly Pick<Pkg, 'name' | 'subpaths'>[],
	tsc: Tsc = installedTsc(workdir),
): Promise<boolean> {
	console.log(
		`\nCompiling ${packages.length} package(s) under module nodenext, skipLibCheck off…\n`,
	);
	const dir = join(workdir, 'nodenext');
	await mkdir(dir, { recursive: true });
	await Bun.write(join(dir, 'package.json'), '{"type":"module"}');
	await Bun.write(
		join(dir, 'tsconfig.json'),
		JSON.stringify(NODENEXT_TSCONFIG),
	);
	for (const pkg of packages)
		await Bun.write(
			join(dir, `${pkg.name.replace('/', '__')}.ts`),
			fixtureSource(pkg),
		);
	const { exitCode, output } = await tsc(dir);
	// The exit code alone is 2 whenever a dependency's own declarations fail
	// (nuxt's do), so it only counts when tsc said nothing in `error TS` form:
	// a tsc that did not start ("error: could not find tsc") checked nothing.
	if (exitCode !== 0 && !/(^|\s)error TS\d+:/m.test(output)) {
		console.error(`\ntsc failed without a diagnostic:\n${output.trim()}`);
		return false;
	}
	const errors = ownErrors(output);
	for (const pkg of packages) {
		const file = `${pkg.name.replace('/', '__')}.ts`;
		const mine = errors.some(
			(line) =>
				line.startsWith(file) || line.includes(`node_modules/${pkg.name}/`),
		);
		console.log(`  ${mine ? 'FAIL' : 'ok  '}    ${pkg.name}`);
	}
	if (errors.length === 0) {
		console.log('\nEvery package resolves its own types under nodenext.');
		return true;
	}
	const SHOWN = 20;
	console.log(
		errors
			.slice(0, SHOWN)
			.map(
				(line) =>
					`            ${line.replace(/^(\.\.\/)+.*?node_modules\//, '')}`,
			)
			.join('\n'),
	);
	if (errors.length > SHOWN)
		console.log(`            … and ${errors.length - SHOWN} more`);
	console.error(
		"\nA package's declarations do not resolve for a consumer on\n" +
			'`moduleResolution: nodenext`: a relative import without its `.js`\n' +
			'makes every type behind it `any`. `build.ts` rewrites them; see\n' +
			'AGENTS.md and softistx/nxgt-http#132.',
	);
	return false;
}

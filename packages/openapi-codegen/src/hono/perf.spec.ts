import { describe, expect, test } from 'bun:test';
import { PERF_SIZE } from '../../test/perf';

/**
 * What `routes` costs TypeScript. `test/generated/perf/` holds `PERF_SIZE`
 * generated operations and a route for each; `tsc` checks it with and
 * without the routes, and the difference is theirs. Measured at ~480
 * instantiations a route: a route that stops being two index lookups shows
 * up here long before it shows up in an editor.
 */
const BUDGET_PER_ROUTE = 700;

const DIR = `${import.meta.dir}/../../test/generated/perf`;
const TSC = `${import.meta.dir}/../../node_modules/.bin/tsc`;

async function instantiations(project: string): Promise<number> {
	const tsc = Bun.spawn(
		[TSC, '--extendedDiagnostics', '-p', `${DIR}/${project}`],
		{ stdout: 'pipe', stderr: 'pipe' },
	);
	const [out, code] = await Promise.all([
		new Response(tsc.stdout).text(),
		tsc.exited,
	]);
	expect(code, out).toBe(0);
	const count = /^Instantiations:\s+(\d+)$/m.exec(out)?.[1];
	if (count === undefined)
		throw new Error(`no instantiation count in:\n${out}`);
	return Number(count);
}

describe('routes typing cost', () => {
	test(`${PERF_SIZE} routes stay under ${BUDGET_PER_ROUTE} instantiations each`, async () => {
		const [all, base] = await Promise.all([
			instantiations('tsconfig.json'),
			instantiations('tsconfig.base.json'),
		]);
		expect((all - base) / PERF_SIZE).toBeLessThan(BUDGET_PER_ROUTE);
	}, 120_000);
});

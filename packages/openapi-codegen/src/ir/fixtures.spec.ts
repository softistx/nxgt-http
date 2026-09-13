/**
 * The IR of two whole specs on disk, pinned by snapshot. The split one
 * `$ref`s into `@nxgt/shared-openapi`'s fragments by relative path, the way a
 * consumer does through `node_modules`.
 */
import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../loader/document';
import { buildIR } from './index';

const FIXTURES = fileURLToPath(
	new URL('../../test/fixtures/', import.meta.url),
);
const PACKAGES = fileURLToPath(new URL('../../../', import.meta.url));

/** Machine paths out, so the snapshot is the same on every checkout. */
const portable = (value: unknown): unknown =>
	JSON.parse(JSON.stringify(value).replaceAll(PACKAGES, '<packages>/'));

const irOf = async (name: string) =>
	buildIR(await loadDocument(`${FIXTURES}${name}/openapi.yaml`));

describe('buildIR on whole specs', () => {
	it('builds a spec split across files and shared fragments', async () => {
		const api = await irOf('split');
		expect(api.warnings).toEqual([]);
		expect(api.schemas.map((s) => [s.name, s.source, s.recursive])).toEqual([
			['EmployeeStatus', 'component', false],
			['NewEmployee', 'component', false],
			['Employee', 'component', true],
			['ErrorResponse', 'component', false],
		]);
		expect(api.operations.map((o) => `${o.method} ${o.path}`)).toEqual([
			'get /employees',
			'post /employees',
			'get /employees/{id}',
			'put /employees/{id}',
			'delete /employees/{id}',
		]);
		expect(portable(api)).toMatchSnapshot();
	});

	it('builds an OpenAPI 3.2 `query` operation', async () => {
		const api = await irOf('query');
		expect(api.schemas.map((s) => s.name)).toEqual([
			'Hit',
			'SearchEmployeesBody',
		]);
		expect(portable(api)).toMatchSnapshot();
	});
});

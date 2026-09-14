/**
 * The loader against real fragments on a real disk: a copy, under
 * `test/fixtures/shared-components/`, of the `openapi/components/` that
 * nxgt-core's `@nxgt/shared-openapi` publishes, and that its consumers `$ref`
 * from `node_modules` exactly the way these tests do.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from './document';
import { nodeFileSystem } from './fs';
import { child } from './location';
import { Resolver } from './resolver';

const COMPONENTS = fileURLToPath(
	new URL('../../test/fixtures/shared-components', import.meta.url),
);

describe('the @nxgt/shared-openapi fragments', () => {
	it('resolve, every $ref in every file', async () => {
		const files = [...new Bun.Glob('**/*.yaml').scanSync(COMPONENTS)].sort();
		expect(files.length).toBeGreaterThan(40);

		const resolver = new Resolver(nodeFileSystem);
		for (const file of files) {
			const at = await resolver.load(join(COMPONENTS, file));
			expect(at).toBeDefined();
			if (at) await resolver.crawl(at);
		}
		expect(resolver.diagnostics.list).toEqual([]);
	});

	describe('through a symlinked node_modules', () => {
		let dir: string;

		beforeAll(async () => {
			dir = await mkdtemp(join(tmpdir(), 'openapi-codegen-'));
			const openapi = join(dir, 'node_modules', '@nxgt', 'shared-openapi');
			await mkdir(join(openapi, 'openapi'), { recursive: true });
			await symlink(COMPONENTS, join(openapi, 'openapi', 'components'), 'dir');
		});

		afterAll(() => rm(dir, { recursive: true, force: true }));

		it('are one fragment whichever path reaches them', async () => {
			const direct = relative(
				dir,
				join(COMPONENTS, 'responses', 'NotFound.yaml'),
			);
			await Bun.write(
				join(dir, 'openapi.yaml'),
				`openapi: 3.2.0
info: { title: t, version: '1' }
paths: {}
components:
  responses:
    ViaModules:
      $ref: node_modules/@nxgt/shared-openapi/openapi/components/responses/NotFound.yaml
    ViaPath:
      $ref: ${direct}
`,
			);
			const doc = await loadDocument(join(dir, 'openapi.yaml'));
			const responses = (doc.document.components as any).responses;
			const at = child(doc.entry, 'components', 'responses');
			const viaModules = doc.resolver.deref(
				responses.ViaModules,
				child(at, 'ViaModules'),
			);
			const viaPath = doc.resolver.deref(
				responses.ViaPath,
				child(at, 'ViaPath'),
			);

			expect(viaModules.id).toBe(viaPath.id);
			expect(viaModules.id).toBe(
				`${join(COMPONENTS, 'responses', 'NotFound.yaml')}#`,
			);
		});
	});
});

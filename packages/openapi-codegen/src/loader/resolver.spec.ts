import { describe, expect, it } from 'bun:test';
import { CodegenError } from '../errors';
import { loadDocument } from './document';
import { createMemoryFileSystem } from './fs';
import { child } from './location';

const HEAD = `openapi: 3.2.0
info: { title: t, version: '1' }
`;

const load = (files: Record<string, string>, links?: Record<string, string>) =>
	loadDocument('/spec/openapi.yaml', {
		fs: createMemoryFileSystem(files, links),
	});

/** The diagnostics a document is rejected with, reduced to what tests match on. */
async function rejection(files: Record<string, string>) {
	try {
		await load(files);
	} catch (error) {
		if (!(error instanceof CodegenError)) throw error;
		return error.diagnostics.map(({ code, file, pointer }) => ({
			code,
			file,
			pointer,
		}));
	}
	throw new Error('expected the document to be rejected');
}

describe('Resolver — where a $ref lands', () => {
	it('resolves a $ref against the file it is written in, not the entry', async () => {
		const doc = await load({
			'/spec/openapi.yaml': `${HEAD}paths:
  /employees:
    $ref: paths/employees.yaml
`,
			'/spec/paths/employees.yaml': `get:
  responses:
    '200':
      description: ok
      content:
        application/json:
          schema:
            $ref: ../components/schemas/Employee.yaml
`,
			'/spec/components/schemas/Employee.yaml': `type: object
properties:
  manager:
    $ref: ./Manager.yaml
`,
			'/spec/components/schemas/Manager.yaml': 'type: object\n',
		});

		expect([...doc.resolver.files.keys()].sort()).toEqual([
			'/spec/components/schemas/Employee.yaml',
			'/spec/components/schemas/Manager.yaml',
			'/spec/openapi.yaml',
			'/spec/paths/employees.yaml',
		]);

		const paths = doc.document.paths as any;
		const item = doc.resolver.deref(
			paths['/employees'],
			child(doc.entry, 'paths', '/employees'),
		);
		expect(item.location).toEqual({
			file: '/spec/paths/employees.yaml',
			pointer: '',
		});

		const employee = doc.resolver.deref<any>(
			(item.value as any).get.responses['200'].content['application/json']
				.schema,
			item.location,
		);
		const manager = doc.resolver.deref(
			employee.value.properties.manager,
			child(employee.location, 'properties', 'manager'),
		);
		expect(manager.id).toBe('/spec/components/schemas/Manager.yaml#');
	});

	it('follows local and cross-file pointers, escaped and percent-encoded', async () => {
		const doc = await load({
			'/spec/openapi.yaml': `${HEAD}paths:
  /employees/{id}:
    get:
      responses:
        '200': { description: ok }
components:
  pathItems:
    Employee:
      $ref: other.yaml#/item
  schemas:
    Id: { type: string }
    Alias: { $ref: '#/components/schemas/Id' }
`,
			'/spec/other.yaml': `item:
  $ref: 'openapi.yaml#/paths/~1employees~1%7Bid%7D'
`,
		});
		const components = doc.document.components as any;
		const at = child(doc.entry, 'components');

		const alias = doc.resolver.deref(
			components.schemas.Alias,
			child(at, 'schemas', 'Alias'),
		);
		expect(alias.value).toEqual({ type: 'string' });

		const item = doc.resolver.deref(
			components.pathItems.Employee,
			child(at, 'pathItems', 'Employee'),
		);
		expect(item.id).toBe('/spec/openapi.yaml#/paths/~1employees~1{id}');
		expect(item.hops).toHaveLength(2);
	});

	it('collapses a chain of one-line redirect files to the fragment they name', async () => {
		const doc = await load({
			'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    Error:
      $ref: components/Error.yaml
      description: overridden here
`,
			'/spec/components/Error.yaml':
				'$ref: ../node_modules/@nxgt/shared/Error.yaml\n',
			'/spec/node_modules/@nxgt/shared/Error.yaml':
				'type: object\ndescription: the real one\n',
		});
		const resolved = doc.resolver.deref<any>(
			(doc.document.components as any).schemas.Error,
			child(doc.entry, 'components', 'schemas', 'Error'),
		);
		expect(resolved.hops).toHaveLength(2);
		expect(resolved.id).toBe('/spec/node_modules/@nxgt/shared/Error.yaml#');
		expect(resolved.value.description).toBe('the real one');
		expect(resolved.description).toBe('overridden here');
	});

	it('loads a fragment reached through a symlinked node_modules once, under its real path', async () => {
		const doc = await load(
			{
				'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    ViaModules: { $ref: node_modules/@nxgt/shared/Error.yaml }
    ViaPath: { $ref: ../packages/shared/Error.yaml }
`,
				'/packages/shared/Error.yaml':
					'type: object\nproperties:\n  code: { $ref: ./Code.yaml }\n',
				'/packages/shared/Code.yaml': 'type: integer\n',
			},
			{ '/spec/node_modules/@nxgt/shared': '/packages/shared' },
		);
		const schemas = (doc.document.components as any).schemas;
		const at = child(doc.entry, 'components', 'schemas');
		const viaModules = doc.resolver.deref(
			schemas.ViaModules,
			child(at, 'ViaModules'),
		);
		const viaPath = doc.resolver.deref(schemas.ViaPath, child(at, 'ViaPath'));

		expect(viaModules.id).toBe('/packages/shared/Error.yaml#');
		expect(viaPath.id).toBe(viaModules.id);
		// ./Code.yaml resolved next to the real file, not the symlink.
		expect(doc.resolver.files.has('/packages/shared/Code.yaml')).toBe(true);
		expect(doc.resolver.files.size).toBe(3);
	});

	it('terminates on a recursive schema, which is not an error', async () => {
		const doc = await load({
			'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    Node:
      type: object
      properties:
        children:
          type: array
          items: { $ref: '#/components/schemas/Node' }
`,
		});
		expect(doc.warnings).toEqual([]);
	});
});

describe('Resolver — what it rejects', () => {
	it('rejects a chain of pure $refs that comes back on itself, once', async () => {
		const problems = await rejection({
			'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    A: { $ref: '#/components/schemas/B' }
    B: { $ref: '#/components/schemas/A' }
`,
		});
		expect(problems.map((p) => p.code)).toEqual(['ref_cycle']);
	});

	it('lists every broken $ref at the place it is written, not just the first', async () => {
		const problems = await rejection({
			'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    MissingFile: { $ref: ./nowhere.yaml }
    MissingPointer: { $ref: './other.yaml#/nope' }
    Remote: { $ref: 'https://example.com/schema.yaml' }
    Anchor: { $ref: '#employee' }
    NotAString: { $ref: 42 }
    Fine: { $ref: ./other.yaml }
`,
			'/spec/other.yaml': 'type: string\n',
		});
		const at = (name: string) => `/components/schemas/${name}/$ref`;
		expect(problems).toEqual([
			{
				code: 'file_not_found',
				file: '/spec/openapi.yaml',
				pointer: at('MissingFile'),
			},
			{
				code: 'pointer_not_found',
				file: '/spec/openapi.yaml',
				pointer: at('MissingPointer'),
			},
			{ code: 'remote_ref', file: '/spec/openapi.yaml', pointer: at('Remote') },
			{
				code: 'invalid_ref',
				file: '/spec/openapi.yaml',
				pointer: at('Anchor'),
			},
			{
				code: 'invalid_ref',
				file: '/spec/openapi.yaml',
				pointer: at('NotAString'),
			},
		]);
	});

	it('reports a file that does not parse, and a file with several documents', async () => {
		const problems = await rejection({
			'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    Broken: { $ref: ./broken.yaml }
    Several: { $ref: ./several.yaml }
`,
			'/spec/broken.yaml': 'type: [\n',
			'/spec/several.yaml': 'type: string\n---\ntype: integer\n',
		});
		expect(problems).toEqual([
			{ code: 'parse_error', file: '/spec/broken.yaml', pointer: '' },
			{ code: 'invalid_root', file: '/spec/several.yaml', pointer: '' },
		]);
	});

	it('does not follow a $ref inside literal data, but does inside a property named like a keyword', async () => {
		const problems = await rejection({
			'/spec/openapi.yaml': `${HEAD}paths: {}
components:
  schemas:
    Literal:
      type: object
      example: { $ref: ./not-a-file.yaml }
      default: { $ref: ./not-a-file.yaml }
      enum: [{ $ref: ./not-a-file.yaml }]
      examples: [{ $ref: ./not-a-file.yaml }]
      x-internal: { $ref: ./not-a-file.yaml }
      properties:
        default: { $ref: ./missing.yaml }
`,
		});
		expect(problems).toEqual([
			{
				code: 'file_not_found',
				file: '/spec/openapi.yaml',
				pointer: '/components/schemas/Literal/properties/default/$ref',
			},
		]);
	});

	it('reads YAML response codes as string keys', async () => {
		const doc = await load({
			'/spec/openapi.yaml': `${HEAD}paths:
  /employees:
    get:
      responses:
        200:
          $ref: '#/components/responses/Ok'
components:
  responses:
    Ok: { description: ok }
`,
		});
		const responses = (doc.document.paths as any)['/employees'].get.responses;
		expect(Object.keys(responses)).toEqual(['200']);
	});
});

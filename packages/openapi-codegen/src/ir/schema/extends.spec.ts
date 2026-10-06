import { describe, expect, it } from 'bun:test';
import { type DiagnosticCode, Diagnostics, type Severity } from '../../errors';
import type { Location } from '../../loader/location';
import type { NamedSchema, ObjectNode, Property, SchemaNode } from '../types';
import { checkExtends } from './extends';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

const prop = (
	name: string,
	required: boolean,
	schema: SchemaNode = { kind: 'string' },
): Property => ({ name, required, schema });

const object = (
	properties: Property[] = [],
	over: Partial<ObjectNode> = {},
): ObjectNode => ({
	kind: 'object',
	properties,
	additional: 'default',
	extends: [],
	...over,
});

function run(nodes: SchemaNode[], schemas: Record<string, SchemaNode> = {}) {
	const named = new Map<string, NamedSchema>(
		Object.entries(schemas).map(([id, node]) => [
			id,
			{
				id,
				name: id,
				location: at,
				source: 'component',
				node,
				recursive: false,
			},
		]),
	);
	const resolve = (node: SchemaNode): SchemaNode => {
		let current = node;
		while (current.kind === 'ref') {
			const target = named.get(current.target);
			if (!target) break;
			current = target.node;
		}
		return current;
	};
	const diagnostics = new Diagnostics();
	checkExtends({
		named,
		resolve,
		diagnostics,
		composed: new Map(nodes.map((n) => [n as ObjectNode, at])),
	});
	return diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));
}

interface Reported {
	severity: Severity;
	code: DiagnosticCode;
	message: string;
	pointer: string | undefined;
}

const notChecked = (names: string): Reported => ({
	severity: 'warning',
	code: 'not_enforced',
	message: `\`required\` names ${names}, which no \`properties\` declares: whether the key is present is not checked. Declare it under \`properties\``,
	pointer: '/s',
});

describe('checkExtends', () => {
	describe('with object parents', () => {
		it('keeps `extends` and says nothing when the object adds to its parent', () => {
			const node = object([prop('b', false)], { extends: ['Base'] });
			const problems = run([node], { Base: object([prop('a', true)]) });
			expect(problems).toEqual([]);
			expect(node.kind).toBe('object');
			expect(node.extends).toEqual(['Base']);
		});

		it('meets a property the parent declares too, and keeps it required if the parent requires it', () => {
			const node = object(
				[prop('a', false, { kind: 'string', maxLength: 5 })],
				{ extends: ['Base'] },
			);
			run([node], {
				Base: object([prop('a', true, { kind: 'string', minLength: 1 })]),
			});
			expect(node.properties).toEqual([
				{
					name: 'a',
					required: true,
					schema: { kind: 'string', minLength: 1, maxLength: 5 },
				},
			]);
		});

		it('leaves required what the object requires and the parent does not', () => {
			const node = object([prop('a', true)], { extends: ['Base'] });
			run([node], { Base: object([prop('a', false)]) });
			expect(node.properties[0]?.required).toBe(true);
		});

		it('finds the parent through a `ref`, and a property a grandparent declares', () => {
			const node = object([prop('g', false)], { extends: ['Alias'] });
			run([node], {
				Alias: { kind: 'ref', target: 'Base' },
				Base: object([], { extends: ['Grand'] }),
				Grand: object([prop('g', true)]),
			});
			expect(node.properties[0]?.required).toBe(true);
		});

		it('keeps a `requires` name a parent declares: the emitter requires it through `extends`', () => {
			const node = object([], { extends: ['Base'], requires: ['id'] });
			const problems = run([node], { Base: object([prop('id', false)]) });
			expect(problems).toEqual([]);
			expect(node.requires).toEqual(['id']);
		});

		it('takes the names no parent declares out of `requires`, and warns about them at the object', () => {
			const node = object([], {
				extends: ['Base'],
				requires: ['id', 'ghost', 'x'],
			});
			const problems = run([node], { Base: object([prop('id', false)]) });
			expect(problems).toEqual([notChecked('`ghost`, `x`')]);
			expect(node.requires).toEqual(['id']);
		});

		it('drops `requires` altogether when no name of it is declared', () => {
			const node = object([], { extends: ['Base'], requires: ['ghost'] });
			run([node], { Base: object() });
			expect(node).not.toHaveProperty('requires');
		});
	});

	describe('with a parent that is not an object', () => {
		it('becomes an intersection of the parents and what the object declares, keeping its annotations', () => {
			const node = object([prop('b', true)], {
				extends: ['Str'],
				description: 'd',
				additional: 'strict',
			});
			const problems = run([node], { Str: { kind: 'string' } });
			expect(problems).toEqual([]);
			expect(node as SchemaNode).toEqual({
				kind: 'intersection',
				members: [
					{ kind: 'ref', target: 'Str' },
					{
						kind: 'object',
						properties: [prop('b', true)],
						additional: 'strict',
						extends: [],
					},
				],
				description: 'd',
			});
		});

		it('has no object member when the object declares nothing and allows the default', () => {
			const node = object([], { extends: ['Str', 'Other'] });
			run([node], { Str: { kind: 'string' }, Other: object() });
			expect(node as SchemaNode).toEqual({
				kind: 'intersection',
				members: [
					{ kind: 'ref', target: 'Str' },
					{ kind: 'ref', target: 'Other' },
				],
			});
		});

		it('is an intersection too for a nullable parent, and for one that is missing', () => {
			const nullable = object([], { extends: ['N'] });
			run([nullable], { N: object([], { nullable: true }) });
			expect(nullable.kind).toBe('intersection' as never);

			const missing = object([], { extends: ['Gone'] });
			run([missing]);
			expect(missing.kind).toBe('intersection' as never);
		});

		it('copies, as required, the property a parent declares and `requires` names', () => {
			const node = object([], { extends: ['Str', 'Base'], requires: ['id'] });
			const problems = run([node], {
				Str: { kind: 'string' },
				Base: object([prop('id', false, { kind: 'number', integer: true })]),
			});
			expect(problems).toEqual([]);
			expect(node).toMatchObject({
				kind: 'intersection',
				members: [
					{ kind: 'ref', target: 'Str' },
					{ kind: 'ref', target: 'Base' },
					{
						kind: 'object',
						properties: [prop('id', true, { kind: 'number', integer: true })],
					},
				],
			});
		});

		it('warns about a `requires` name no parent declares', () => {
			const node = object([], { extends: ['Str'], requires: ['ghost'] });
			expect(run([node], { Str: { kind: 'string' } })).toEqual([
				notChecked('`ghost`'),
			]);
		});
	});

	it('settles every composed object, and skips a node that is no longer an object', () => {
		const a = object([], { extends: ['Str'] });
		const b = object([], { extends: ['Base'], requires: ['x'] });
		const gone: SchemaNode = { kind: 'string' };
		const problems = run([gone, a, b], {
			Str: { kind: 'string' },
			Base: object(),
		});
		expect(gone).toEqual({ kind: 'string' });
		expect(a.kind).toBe('intersection' as never);
		expect(problems).toEqual([notChecked('`x`')]);
	});
});

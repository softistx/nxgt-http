import { describe, expect, it } from 'bun:test';
import { loadDocument } from '../loader/document';
import { createMemoryFileSystem } from '../loader/fs';
import { buildIR } from './index';
import type { ApiIR, ObjectNode, SchemaNode } from './types';

const ROOT = '/spec/openapi.json';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ro = { type: 'string', readOnly: true };
const object = (properties: Record<string, unknown>, required?: string[]) => ({
	type: 'object',
	properties,
	...(required ? { required } : {}),
});

/** `bodies` are the request bodies of POST /b0, /b1…; `responses` the 200 replies of GET /r0…. */
async function api(
	schemas: Record<string, unknown>,
	bodies: unknown[],
	responses: unknown[] = [],
	readOnly: 'omit' | 'keep' = 'omit',
): Promise<ApiIR> {
	const paths: Record<string, unknown> = {};
	bodies.forEach((schema, i) => {
		paths[`/b${i}`] = {
			post: {
				operationId: `body${i}`,
				requestBody: { content: { 'application/json': { schema } } },
				responses: { '204': { description: 'ok' } },
			},
		};
	});
	responses.forEach((schema, i) => {
		paths[`/r${i}`] = {
			get: {
				operationId: `reply${i}`,
				responses: {
					'200': {
						description: 'ok',
						content: { 'application/json': { schema } },
					},
				},
			},
		};
	});
	const doc = JSON.stringify({
		openapi: '3.2.0',
		info: { title: 't', version: '1' },
		paths,
		components: { schemas },
	});
	return buildIR(
		await loadDocument(ROOT, { fs: createMemoryFileSystem({ [ROOT]: doc }) }),
		{ readOnly },
	);
}

const named = (ir: ApiIR, name: string) => {
	const found = ir.schemas.find((s) => s.name === name);
	if (!found) throw new Error(`no schema ${name}`);
	return found;
};
const props = (node: SchemaNode) =>
	node.kind === 'object' ? node.properties.map((p) => p.name) : [];
const bodyOf = (ir: ApiIR, i = 0): SchemaNode | undefined =>
	ir.operations.find((o) => o.operationId === `body${i}`)?.body?.content[0]
		?.schema;
const names = (ir: ApiIR) => ir.schemas.map((s) => s.name);

describe('write views', () => {
	it('leaves an IR with no readOnly property as it is', async () => {
		const spec = { A: object({ a: { type: 'string' } }, ['a']) };
		const kept = await api(spec, [ref('A')], [ref('A')], 'keep');
		expect(await api(spec, [ref('A')], [ref('A')])).toEqual(kept);
	});

	it('does nothing under keep', async () => {
		const ir = await api(
			{ A: object({ id: ro }) },
			[ref('A')],
			[ref('A')],
			'keep',
		);
		expect(names(ir)).toEqual(['A']);
		expect(props(named(ir, 'A').node)).toEqual(['id']);
	});

	it('strips a schema only the bodies reach, in place', async () => {
		const ir = await api(
			{ A: object({ id: ro, name: { type: 'string' } }, ['id', 'name']) },
			[ref('A')],
		);
		expect(names(ir)).toEqual(['A']);
		const node = named(ir, 'A').node as ObjectNode;
		expect(node.properties.map((p) => [p.name, p.required])).toEqual([
			['name', true],
		]);
		expect(bodyOf(ir)).toEqual({ kind: 'ref', target: named(ir, 'A').id });
	});

	it('copies a schema the responses share, right after it', async () => {
		const ir = await api(
			{ A: object({ id: ro, name: { type: 'string' } }, ['id']), Z: ref('A') },
			[ref('A')],
			[ref('A')],
		);
		expect(names(ir)).toEqual(['A', 'AWrite']);
		const a = named(ir, 'A');
		const write = named(ir, 'AWrite');
		expect(write.id).toBe(`${a.id}#write`);
		expect(props(a.node)).toEqual(['id', 'name']);
		expect(props(write.node)).toEqual(['name']);
		expect(bodyOf(ir)).toEqual({ kind: 'ref', target: write.id });
		expect(ir.aliases.map((x) => x.name)).toEqual(['Z']);
	});

	it('leaves a schema only the responses reach untouched', async () => {
		const ir = await api(
			{ A: object({ id: ro }), B: object({ x: { type: 'string' } }) },
			[ref('B')],
			[ref('A')],
		);
		expect(names(ir)).toEqual(['A', 'B']);
		expect(props(named(ir, 'A').node)).toEqual(['id']);
	});

	it('follows a nested property and a $ref property', async () => {
		const ir = await api(
			{
				Inner: object({ id: ro, v: { type: 'string' } }),
				Outer: object({
					inner: ref('Inner'),
					deep: object({ id: ro, n: { type: 'number' } }),
					plain: { type: 'string' },
				}),
			},
			[ref('Outer')],
			[ref('Inner')],
		);
		expect(names(ir)).toEqual(['Inner', 'InnerWrite', 'Outer']);
		const outer = named(ir, 'Outer').node as ObjectNode;
		expect(outer.properties[0]?.schema).toEqual({
			kind: 'ref',
			target: named(ir, 'InnerWrite').id,
		});
		expect(props(outer.properties[1]?.schema ?? { kind: 'unknown' })).toEqual([
			'n',
		]);
	});

	it('drops a property whose $ref target is readOnly', async () => {
		const ir = await api(
			{
				Stamp: { type: 'string', readOnly: true },
				A: object({ at: ref('Stamp'), n: { type: 'string' } }),
			},
			[ref('A')],
		);
		expect(props(named(ir, 'A').node)).toEqual(['n']);
	});

	it('follows extends and prunes requires', async () => {
		const ir = await api(
			{
				Base: object({ id: ro, kind: { type: 'string' } }),
				Child: {
					allOf: [
						ref('Base'),
						{
							...object({ own: { type: 'string' } }),
							required: ['id', 'kind'],
						},
					],
				},
			},
			[ref('Child')],
			[ref('Base')],
		);
		expect(names(ir)).toEqual(['Base', 'BaseWrite', 'Child']);
		const child = named(ir, 'Child').node as ObjectNode;
		expect(child.extends).toEqual([named(ir, 'BaseWrite').id]);
		expect(child.requires).toEqual(['kind']);
	});

	it('copies the members of a cycle and marks them recursive', async () => {
		const ir = await api(
			{
				Node: object({ id: ro, next: ref('Node') }),
			},
			[ref('Node')],
			[ref('Node')],
		);
		const write = named(ir, 'NodeWrite');
		expect(props(write.node)).toEqual(['next']);
		expect((write.node as ObjectNode).properties[0]?.schema).toEqual({
			kind: 'ref',
			target: write.id,
		});
		expect(write.recursive).toBe(true);
		expect(named(ir, 'Node').recursive).toBe(true);
	});

	it('unrecurses a cycle stripped in place when its only link was readOnly', async () => {
		const ir = await api(
			{ Node: object({ parent: { ...ref('Node'), readOnly: true } }) },
			[ref('Node')],
		);
		expect(props(named(ir, 'Node').node)).toEqual([]);
		expect(named(ir, 'Node').recursive).toBe(false);
	});

	it('maps unions, arrays and records per member', async () => {
		const ir = await api(
			{
				A: object({ id: ro, a: { type: 'string' } }),
				B: object({ b: { type: 'string' } }),
				U: { oneOf: [ref('A'), ref('B')] },
				L: { type: 'array', items: ref('A') },
				R: { type: 'object', additionalProperties: ref('A') },
			},
			[ref('U'), ref('L'), ref('R')],
			[ref('A')],
		);
		const target = named(ir, 'AWrite').id;
		const u = named(ir, 'U').node;
		expect(u.kind === 'union' && u.variants[0]).toEqual({
			kind: 'ref',
			target,
		});
		expect(u.kind === 'union' && u.variants[1]).toEqual({
			kind: 'ref',
			target: named(ir, 'B').id,
		});
		const l = named(ir, 'L').node;
		expect(l.kind === 'array' && l.items).toEqual({ kind: 'ref', target });
		const r = named(ir, 'R').node;
		expect(r.kind === 'record' && r.values).toEqual({ kind: 'ref', target });
	});

	it('strips an inline body in place', async () => {
		const ir = await api({}, [object({ id: ro, name: { type: 'string' } })]);
		const body = bodyOf(ir);
		expect(body?.kind).toBe('ref');
		const inline = ir.schemas.find((s) => s.source === 'inline');
		expect(props(inline?.node ?? { kind: 'unknown' })).toEqual(['name']);
		expect(names(ir)).toHaveLength(1);
	});

	it('strips a list body written inline', async () => {
		const ir = await api({ A: object({ id: ro }) }, [
			{ type: 'array', items: ref('A') },
		]);
		const body = bodyOf(ir);
		expect(body?.kind).toBe('array');
		expect(props(named(ir, 'A').node)).toEqual([]);
	});

	it('keeps a readOnly discriminator and warns', async () => {
		const ir = await api(
			{
				Cat: object(
					{ kind: { type: 'string', enum: ['cat'], readOnly: true } },
					['kind'],
				),
				Dog: object({ kind: { type: 'string', enum: ['dog'] } }, ['kind']),
				Pet: {
					oneOf: [ref('Cat'), ref('Dog')],
					discriminator: { propertyName: 'kind' },
				},
			},
			[ref('Pet')],
		);
		expect(props(named(ir, 'Cat').node)).toEqual(['kind']);
		expect(ir.warnings.map((w) => w.message).join()).toContain('discriminator');
	});

	it('warns about a body that is itself readOnly, and keeps it', async () => {
		const ir = await api({ A: { ...object({ x: ro }), readOnly: true } }, [
			ref('A'),
		]);
		expect(props(named(ir, 'A').node)).toEqual(['x']);
		expect(ir.warnings.map((w) => w.message).join()).toContain('readOnly');
	});

	it('copies a schema a response reaches only through another response schema', async () => {
		const ir = await api(
			{
				Inner: object({ id: ro }),
				Reply: object({ inner: ref('Inner') }),
				Body: object({ inner: ref('Inner') }),
			},
			[ref('Body')],
			[ref('Reply')],
		);
		expect(names(ir)).toEqual(['Inner', 'InnerWrite', 'Reply', 'Body']);
		expect(props(named(ir, 'Inner').node)).toEqual(['id']);
		expect(props(named(ir, 'InnerWrite').node)).toEqual([]);
	});

	it('follows additionalProperties', async () => {
		const ir = await api(
			{
				A: object({ id: ro }),
				M: {
					type: 'object',
					properties: { k: { type: 'string' } },
					additionalProperties: ref('A'),
				},
			},
			[ref('M')],
			[ref('A')],
		);
		const m = named(ir, 'M').node as ObjectNode;
		expect(m.additional).toEqual({
			schema: { kind: 'ref', target: named(ir, 'AWrite').id },
		});
	});

	it('follows an intersection', async () => {
		const ir = await api(
			{
				A: object({ id: ro }),
				B: object({ b: { type: 'string' } }),
				U: { oneOf: [ref('A'), ref('B')] },
				I: { allOf: [ref('U'), object({ c: { type: 'string' } })] },
			},
			[ref('I')],
			[ref('A')],
		);
		const i = named(ir, 'I').node;
		expect(i.kind).toBe('intersection');
		expect(names(ir)).toContain('AWrite');
		const u = named(ir, 'U').node;
		expect(u.kind === 'union' && u.variants[0]).toEqual({
			kind: 'ref',
			target: named(ir, 'AWrite').id,
		});
	});

	it('follows readOnly inherited through a diamond', async () => {
		const ir = await api(
			{
				Root: object({ id: ro, r: { type: 'string' } }, ['id']),
				Left: { allOf: [ref('Root'), object({ l: { type: 'string' } })] },
				Right: { allOf: [ref('Root'), object({ rt: { type: 'string' } })] },
				Both: { allOf: [ref('Left'), ref('Right')] },
			},
			[ref('Both')],
			[ref('Root')],
		);
		expect(names(ir)).toContain('RootWrite');
		const both = named(ir, 'Both').node as ObjectNode;
		expect(both.extends).toEqual([named(ir, 'Left').id, named(ir, 'Right').id]);
		const left = named(ir, 'Left').node as ObjectNode;
		expect(left.extends).toEqual([named(ir, 'RootWrite').id]);
		expect(left.requires).toBeUndefined();
	});

	it('treats a body behind an alias like its schema', async () => {
		const ir = await api(
			{ A: object({ id: ro, n: { type: 'string' } }), Z: ref('A') },
			[ref('Z')],
		);
		expect(ir.aliases.map((a) => a.name)).toEqual(['Z']);
		expect(props(named(ir, 'A').node)).toEqual(['n']);
	});

	it('explains a name collision and how to fix it', async () => {
		const error = await api(
			{ A: object({ id: ro }), AWrite: object({ x: { type: 'string' } }) },
			[ref('A')],
			[ref('A')],
		).catch((e: unknown) => e);
		const message = (error as Error).message;
		expect(message).toContain('name_collision');
		expect(message).toContain('AWrite');
		expect(message).toContain("names: { '");
		expect(message).toContain('components/schemas/AWrite');
	});

	it('copies what a readOnly body that is kept whole reaches', async () => {
		const ir = await api(
			{
				Inner: object({ id: ro }),
				Whole: { ...object({ inner: ref('Inner') }), readOnly: true },
				Other: object({ inner: ref('Inner') }),
			},
			[ref('Whole'), ref('Other')],
		);
		expect(props(named(ir, 'Inner').node)).toEqual(['id']);
		expect(names(ir)).toContain('InnerWrite');
		const whole = named(ir, 'Whole').node as ObjectNode;
		expect(whole.properties[0]?.schema).toEqual({
			kind: 'ref',
			target: named(ir, 'Inner').id,
		});
	});

	it('leaves the input IR untouched', async () => {
		const spec = { A: object({ id: ro, n: { type: 'string' } }) };
		const kept = await api(spec, [ref('A')], [ref('A')], 'keep');
		const before = structuredClone(kept);
		const { writeViews } = await import('./write-views');
		const { Diagnostics } = await import('../errors');
		const out = writeViews(kept, new Diagnostics(), () => '');
		expect(out).not.toBe(kept);
		expect(kept).toEqual(before);
	});
});

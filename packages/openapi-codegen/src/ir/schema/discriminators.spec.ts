import { describe, expect, it } from 'bun:test';
import { type DiagnosticCode, Diagnostics, type Severity } from '../../errors';
import type { Location } from '../../loader/location';
import type {
	NamedSchema,
	ObjectNode,
	Scalar,
	SchemaNode,
	UnionNode,
} from '../types';
import { checkDiscriminators } from './discriminators';

const at: Location = {
	file: '/spec/openapi.json',
	pointer: '/s/discriminator',
};

const tagged = (
	value: Scalar | Scalar[],
	over: { required?: boolean; nullable?: boolean } = {},
): ObjectNode => ({
	kind: 'object',
	properties: [
		{
			name: 'kind',
			required: over.required ?? true,
			schema: {
				kind: 'literal',
				values: Array.isArray(value) ? value : [value],
				...(over.nullable ? { nullable: true } : {}),
			},
		},
	],
	additional: 'default',
	extends: [],
});

function run(variants: SchemaNode[], schemas: Record<string, SchemaNode> = {}) {
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
	const union: UnionNode = {
		kind: 'union',
		exclusive: true,
		variants,
		discriminator: 'kind',
	};
	const diagnostics = new Diagnostics();
	checkDiscriminators({
		named,
		resolve,
		diagnostics,
		discriminators: new Map([[union, at]]),
	});
	return {
		union,
		problems: diagnostics.list.map(({ severity, code, message, pointer }) => ({
			severity,
			code,
			message,
			pointer,
		})),
	};
}

interface Reported {
	severity: Severity;
	code: DiagnosticCode;
	message: string;
	pointer: string | undefined;
}

const fallback = (why: string): Reported[] => [
	{
		severity: 'warning',
		code: 'discriminator_fallback',
		message: `discriminator \`kind\` cannot pick a variant (${why}); validated as a plain union, which tries each variant in turn`,
		pointer: '/s/discriminator',
	},
];

describe('checkDiscriminators', () => {
	it('keeps a discriminator every variant sets to its own constant', () => {
		const { union, problems } = run([tagged('a'), tagged('b')]);
		expect(union.discriminator).toBe('kind');
		expect(problems).toEqual([]);
	});

	it('accepts a number or a boolean constant, and several values for one variant', () => {
		expect(run([tagged(1), tagged(2)]).problems).toEqual([]);
		expect(run([tagged(true), tagged(false)]).problems).toEqual([]);
		expect(run([tagged(['a', 'b']), tagged('c')]).problems).toEqual([]);
	});

	it('reads variants through their `$ref`', () => {
		const { problems } = run(
			[
				{ kind: 'ref', target: 'A' },
				{ kind: 'ref', target: 'B' },
			],
			{ A: tagged('a'), B: tagged('b') },
		);
		expect(problems).toEqual([]);
	});

	it('finds the discriminating property on a parent', () => {
		const child: ObjectNode = {
			kind: 'object',
			properties: [],
			additional: 'default',
			extends: ['Base'],
		};
		const { problems } = run([child, tagged('b')], { Base: tagged('a') });
		expect(problems).toEqual([]);
	});

	it('accepts a property the variant requires without declaring', () => {
		const lenient = tagged('a', { required: false });
		lenient.requires = ['kind'];
		expect(run([lenient, tagged('b')]).problems).toEqual([]);
	});

	it('drops the discriminator, with a warning at its location, when a variant is not an object', () => {
		const { union, problems } = run([tagged('a'), { kind: 'string' }]);
		expect(union).not.toHaveProperty('discriminator');
		expect(problems).toEqual(fallback('variant 1 is not an object'));
	});

	it('drops it when a variant has no such property', () => {
		const bare: ObjectNode = {
			kind: 'object',
			properties: [],
			additional: 'default',
			extends: [],
		};
		const { union, problems } = run([bare, tagged('b')]);
		expect(union).not.toHaveProperty('discriminator');
		expect(problems).toEqual(fallback('variant 0 has no `kind`'));
	});

	it('drops it when the property is optional in a variant', () => {
		expect(
			run([tagged('a'), tagged('b', { required: false })]).problems,
		).toEqual(fallback('`kind` is optional in variant 1'));
	});

	it('drops it when the property is not a constant, or one that may be `null`', () => {
		const text: ObjectNode = {
			kind: 'object',
			properties: [
				{ name: 'kind', required: true, schema: { kind: 'string' } },
			],
			additional: 'default',
			extends: [],
		};
		expect(run([text, tagged('b')]).problems).toEqual(
			fallback('`kind` is not a constant in variant 0'),
		);
		expect(
			run([tagged('a'), tagged('b', { nullable: true })]).problems,
		).toEqual(fallback('`kind` is not a constant in variant 1'));
	});

	it('drops it when two variants share a value, naming it as JSON', () => {
		expect(run([tagged('a'), tagged('a')]).problems).toEqual(
			fallback('two variants share "a"'),
		);
		expect(run([tagged(1), tagged(['x', 1])]).problems).toEqual(
			fallback('two variants share 1'),
		);
	});

	it('reports the first problem only, and drops the discriminator once', () => {
		const { problems } = run([
			{ kind: 'string' },
			{ kind: 'number', integer: false },
		]);
		expect(problems).toEqual(fallback('variant 0 is not an object'));
	});

	it('skips a union that carries no discriminator', () => {
		const union: UnionNode = {
			kind: 'union',
			exclusive: true,
			variants: [{ kind: 'string' }, { kind: 'number', integer: false }],
		};
		const diagnostics = new Diagnostics();
		checkDiscriminators({
			named: new Map(),
			resolve: (n) => n,
			diagnostics,
			discriminators: new Map([[union, at]]),
		});
		expect(diagnostics.list).toEqual([]);
	});
});

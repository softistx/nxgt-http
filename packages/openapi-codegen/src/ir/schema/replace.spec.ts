import { describe, expect, it } from 'bun:test';
import type { SchemaNode } from '../types';
import { replaceNode } from './replace';

describe('replaceNode', () => {
	it('rewrites the target in place: the same object, a different shape', () => {
		const target = { kind: 'string', minLength: 1 } as SchemaNode;
		const same = target;
		replaceNode(target, { kind: 'boolean' });
		expect(same).toBe(target);
		expect(target).toEqual({ kind: 'boolean' });
	});

	it('keeps what the target was annotated with, and nothing else of it', () => {
		const target = {
			kind: 'string',
			pattern: '^a',
			nullable: true,
			description: 'd',
			deprecated: true,
			readOnly: true,
			writeOnly: true,
			default: { value: null },
		} as SchemaNode;
		replaceNode(target, { kind: 'number', integer: true });
		expect(target).toEqual({
			kind: 'number',
			integer: true,
			nullable: true,
			description: 'd',
			deprecated: true,
			readOnly: true,
			writeOnly: true,
			default: { value: null },
		});
	});

	it('lets the target’s annotation win over the next shape’s', () => {
		const target = { kind: 'string', description: 'old' } as SchemaNode;
		replaceNode(target, { kind: 'boolean', description: 'new' });
		expect(target).toEqual({ kind: 'boolean', description: 'old' });
	});

	it('keeps the next shape’s annotation when the target has none', () => {
		const target = { kind: 'string' } as SchemaNode;
		replaceNode(target, { kind: 'boolean', description: 'new' });
		expect(target).toEqual({ kind: 'boolean', description: 'new' });
	});

	it('does not invent a key for an annotation the target lacks', () => {
		const target = { kind: 'string' } as SchemaNode;
		replaceNode(target, { kind: 'boolean' });
		expect(Object.keys(target)).toEqual(['kind']);
	});
});

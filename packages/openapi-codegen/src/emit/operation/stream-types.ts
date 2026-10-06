/** Each operation's `stream` entry in `types.ts`: what a client reads, or a server writes, an item at a time. */
import type { MediaIR, OperationIR, SchemaNode } from '../../ir/types';
import type { EmitContext } from '../context';
import { jsString } from '../printer';
import { type } from '../types';
import { streamOf } from './read';

/**
 * Each item of a stream: a JSON line, or a union of its events narrowed on
 * `event`. `side` is who holds it: a `client` reads it, decoded or as JSON
 * carries it (`wire`), with the ID the event came with; a `server` writes
 * it, and may give an `id` and a `retry`.
 */
function streamItem(
	ctx: EmitContext,
	media: MediaIR,
	side: 'client' | 'wire' | 'server',
	indent: string,
): string {
	const typed = (node: SchemaNode): string => {
		const decoded = type(ctx, node, false, `${indent}\t`);
		return side === 'wire' ? ctx.wire(node, decoded) : decoded;
	};
	if (media.kind === 'jsonl') return media.item ? typed(media.item) : 'unknown';
	const id =
		side === 'server'
			? 'id?: string; retry?: number'
			: 'id: string | undefined';
	if (!media.events) {
		return `{ event${side === 'server' ? '?' : ''}: string; data: string; ${id} }`;
	}
	const members = media.events.map(
		(event) =>
			`{ event: ${jsString(event.name)}; data: ${event.data ? typed(event.data) : 'string'}; ${id} }`,
	);
	return members.length === 1
		? (members[0] as string)
		: members.map((member) => `\n${indent}\t| ${member}`).join('');
}

/** An operation's `stream` entry, beside its replies. */
export function streamLine(
	ctx: EmitContext,
	operation: OperationIR,
	side: 'client' | 'server',
	indent: string,
): string[] {
	const media = streamOf(operation);
	if (!media) return [];
	const inner = `${indent}\t`;
	// After the key's colon: a space, or a union on the lines below.
	const item = (key: string, of: 'client' | 'wire' | 'server') => {
		const text = streamItem(ctx, media, of, inner);
		return `${inner}${key}:${text.startsWith('\n') ? '' : ' '}${text};`;
	};
	const lines = [`${inner}kind: ${jsString(media.kind)};`];
	if (side === 'client')
		lines.push(item('item', 'client'), item('wire', 'wire'));
	else lines.push(item('item', 'server'));
	return [`${indent}stream: {`, ...lines, `${indent}};`];
}

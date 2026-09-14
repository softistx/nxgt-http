/** Helpers that print JavaScript and TypeScript source text. */
import type { SchemaNode } from '../ir/types';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Past this many characters, a list goes one item per line. */
const WIDTH = 72;

/** What must be escaped in a single-quoted string; line breaks in a regex too. */
const ESCAPES: Record<string, string> = {
	'\\': '\\\\',
	"'": "\\'",
	'\n': '\\n',
	'\r': '\\r',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029',
};

const LINE_BREAKS = new Set(['\n', '\r', '\u2028', '\u2029']);

/** A single-quoted string literal. */
export function jsString(value: string): string {
	return `'${value.replace(/[\\'\n\r\u2028\u2029]/g, (ch) => ESCAPES[ch] ?? ch)}'`;
}

/**
 * An object or interface key. `__proto__` is computed: written plainly in an
 * object literal, it sets the prototype instead of defining a property.
 */
export function propertyKey(name: string): string {
	if (name === '__proto__') return `['__proto__']`;
	return IDENTIFIER.test(name) ? name : jsString(name);
}

/** A JSON value as a JavaScript literal. */
export function jsValue(value: unknown): string {
	if (value === null) return 'null';
	if (typeof value === 'string') return jsString(value);
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(jsValue).join(', ')}]`;
	if (typeof value === 'object') {
		const entries = Object.entries(value).map(
			([key, item]) => `${propertyKey(key)}: ${jsValue(item)}`,
		);
		return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
	}
	return 'undefined';
}

/** Whether `pattern` compiles with the `u` flag. */
const unicode = (pattern: string): boolean => {
	try {
		new RegExp(pattern, 'u');
		return true;
	} catch {
		return false;
	}
};

/**
 * A regular expression literal matching what `new RegExp(pattern)` matches:
 * a `/` outside a character class is escaped, and so are line breaks. It has
 * the `u` flag, since a JSON Schema pattern is Unicode (`\p{L}` is a letter
 * only with it), unless the pattern uses a legacy escape the flag refuses.
 */
export function regexLiteral(pattern: string): string {
	let source = '';
	let inClass = false;
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i] ?? '';
		if (ch === '\\') {
			const next = pattern[i + 1] ?? '';
			source += LINE_BREAKS.has(next) ? (ESCAPES[next] ?? '') : `\\${next}`;
			i++;
			continue;
		}
		if (ch === '[') inClass = true;
		else if (ch === ']') inClass = false;
		if (ch === '/' && !inClass) source += '\\/';
		else if (LINE_BREAKS.has(ch)) source += ESCAPES[ch] ?? '';
		else source += ch;
	}
	// `//` would open a comment.
	return `/${source || '(?:)'}/${unicode(pattern) ? 'u' : ''}`;
}

/** A JSDoc block, or nothing when there is nothing to say. */
export function docComment(lines: readonly string[], indent: string): string[] {
	const text = lines
		.flatMap((line) => line.split(/\r?\n/))
		.map((line) => line.replaceAll('*/', '*\\/').trimEnd());
	while (text.length > 0 && text.at(-1) === '') text.pop();
	if (text.length === 0) return [];
	if (text.length === 1) return [`${indent}/** ${text[0]} */`];
	return [
		`${indent}/**`,
		...text.map((line) =>
			line === '' ? `${indent} *` : `${indent} * ${line}`,
		),
		`${indent} */`,
	];
}

/** What a schema's JSDoc says: its description, its default, whether it is deprecated. */
export function docLines(node: SchemaNode): string[] {
	const lines: string[] = [];
	if (node.description) lines.push(node.description);
	if (node.default !== undefined) {
		lines.push(`@default ${jsValue(node.default.value)}`);
	}
	if (node.deprecated) lines.push('@deprecated');
	return lines;
}

/**
 * `open` + items + `close` on one line when it is short, else one item per
 * line at `indent` plus a tab.
 */
export function list(
	open: string,
	items: readonly string[],
	close: string,
	indent: string,
): string {
	const flat = `${open}${items.join(', ')}${close}`;
	if (!flat.includes('\n') && flat.length <= WIDTH) return flat;
	const inner = `${indent}\t`;
	return `${open.trimEnd()}\n${items.map((item) => `${inner}${item},`).join('\n')}\n${indent}${close.trimStart()}`;
}

/** Whether `text` has one of `operators` outside brackets and quotes. */
function hasTopLevel(text: string, operators: string): boolean {
	let depth = 0;
	let quote: string | undefined;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] ?? '';
		if (quote !== undefined) {
			if (ch === '\\') i++;
			else if (ch === quote) quote = undefined;
		} else if (ch === '/' && text[i + 1] === '*') {
			// A JSDoc holds prose: an apostrophe or a bracket there is not code.
			const end = text.indexOf('*/', i + 2);
			i = end < 0 ? text.length : end + 1;
		} else if (ch === "'" || ch === '"') quote = ch;
		else if ('([{<'.includes(ch)) depth++;
		else if (')]}>'.includes(ch)) depth--;
		else if (depth === 0 && operators.includes(ch)) return true;
	}
	return false;
}

/** `A | B` in parentheses where it would otherwise bind wrongly: `(A | B)[]`. */
export const group = (text: string, operators = '|&'): string =>
	hasTopLevel(text, operators) ? `(${text})` : text;

/** A whole file: sections separated by a blank line, ending in a newline. */
export const file = (sections: readonly string[]): string =>
	`${sections.join('\n\n')}\n`;

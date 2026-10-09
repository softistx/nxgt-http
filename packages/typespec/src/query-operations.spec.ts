/**
 * `withQueryOperations`, on documents written by hand: what moves in a 3.2
 * document, what stays in 3.1, and the files it leaves alone.
 */
import { expect, it } from 'bun:test';
import { parse } from 'yaml';
import { withQueryOperations } from './query-operations';

const marked = {
	operationId: 'searchBooks',
	'x-nxgt-method': 'query',
	responses: { '200': { description: 'ok' } },
};
const document = (openapi: string) => ({
	openapi,
	paths: {
		'/books/search': {
			parameters: [],
			post: marked,
			get: { operationId: 'x' },
		},
		'/books': { post: { operationId: 'createBook' } },
	},
});

it('moves a marked post to query in a 3.2 document, in place, without the mark', () => {
	const text = withQueryOperations(JSON.stringify(document('3.2.0'), null, 2));
	const paths = JSON.parse(text).paths;
	expect(Object.keys(paths['/books/search'])).toEqual([
		'parameters',
		'query',
		'get',
	]);
	expect(paths['/books/search'].query).toEqual({
		operationId: 'searchBooks',
		responses: { '200': { description: 'ok' } },
	});
	expect(paths['/books']).toEqual({ post: { operationId: 'createBook' } });
	expect(text.endsWith('}\n')).toBe(true);
});

it('does the same in YAML', () => {
	const yaml = `openapi: 3.2.0\npaths:\n  /books/search:\n    post:\n      operationId: searchBooks\n      x-nxgt-method: query\n`;
	expect(parse(withQueryOperations(yaml))).toEqual({
		openapi: '3.2.0',
		paths: { '/books/search': { query: { operationId: 'searchBooks' } } },
	});
});

it('leaves a 3.1 document, a document with nothing marked, and any other file as written', () => {
	const v31 = JSON.stringify(document('3.1.0'));
	expect(withQueryOperations(v31)).toBe(v31);
	const unmarked =
		'openapi: 3.2.0\npaths:\n  /books:\n    post: {operationId: createBook}\n';
	expect(withQueryOperations(unmarked)).toBe(unmarked);
	expect(withQueryOperations('post')).toBe('post');
});

it('keeps CRLF line endings, as `new-line: crlf` wrote them', () => {
	const yaml =
		'openapi: 3.2.0\r\npaths:\r\n  /books/search:\r\n    post:\r\n      x-nxgt-method: query\r\n';
	const text = withQueryOperations(yaml);
	expect(text).toBe(
		'openapi: 3.2.0\r\npaths:\r\n  /books/search:\r\n    query: {}\r\n',
	);
});

it('leaves a path that has a query already, and a document with no paths', () => {
	const both = JSON.stringify({
		openapi: '3.2.0',
		paths: { '/books': { post: marked, query: { operationId: 'q' } } },
	});
	expect(withQueryOperations(both)).toBe(both);
	const none = 'openapi: 3.2.0\ninfo: {title: t}\n';
	expect(withQueryOperations(none)).toBe(none);
});

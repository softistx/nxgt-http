import { describe, expect, test } from 'bun:test';
import { computed, reactive, ref } from 'vue';
import { queryArgs, takesInput, unrefDeep } from './args';

const operations = {
	getItem: {
		method: 'get',
		path: '/items/{id}',
		parameters: [{ name: 'id' }],
	},
	health: { method: 'get', path: '/health', parameters: [] },
	createItem: {
		method: 'post',
		path: '/items',
		parameters: [],
		body: { content: { 'application/json': {} } },
	},
};

describe('takesInput', () => {
	test('reads the parameters and the body, as the client does', () => {
		expect(takesInput(operations, 'get', '/items/{id}')).toBe(true);
		expect(takesInput(operations, 'post', '/items')).toBe(true);
		expect(takesInput(operations, 'get', '/health')).toBe(false);
	});

	test('refuses an operation the spec does not have', () => {
		expect(() => takesInput(operations, 'get', '/nothing')).toThrow(
			'the spec has no GET /nothing operation',
		);
	});
});

describe('queryArgs', () => {
	test('puts the input first when the operation takes one', () => {
		const input = { param: { id: 1 } };
		const options = { enabled: false };
		expect(
			queryArgs(operations, 'get', '/items/{id}', [input, options]),
		).toEqual({ takes: true, input, options });
	});

	test('reads the options first when it takes none', () => {
		const options = { enabled: false };
		expect(queryArgs(operations, 'get', '/health', [options])).toEqual({
			takes: false,
			input: undefined,
			options,
		});
	});
});

describe('unrefDeep', () => {
	test('reads refs, getters and reactive objects, at any depth', () => {
		const id = ref(7);
		const page = computed(() => id.value + 1);
		const input = {
			param: reactive({ id }),
			query: { page, tags: [ref('a'), 'b'], size: () => 10 },
		};
		expect(unrefDeep(input)).toEqual({
			param: { id: 7 },
			query: { page: 8, tags: ['a', 'b'], size: 10 },
		});
		id.value = 9;
		expect(unrefDeep(input)).toEqual({
			param: { id: 9 },
			query: { page: 10, tags: ['a', 'b'], size: 10 },
		});
	});

	test('keeps what is not a plain object as it is', () => {
		const at = new Date(0);
		const blob = new Blob(['x']);
		const form = new FormData();
		const read = unrefDeep({ at: ref(at), blob, form }) as Record<
			string,
			unknown
		>;
		expect(read.at).toBe(at);
		expect(read.blob).toBe(blob);
		expect(read.form).toBe(form);
	});
});

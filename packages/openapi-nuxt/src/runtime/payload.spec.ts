import { describe, expect, test } from 'bun:test';
import { keyedArgs, toPayload } from './index';

describe('toPayload', () => {
	test("takes a reply's Response off, and keeps the rest", () => {
		const reply = {
			status: 200,
			type: 'application/json',
			data: { id: 1 },
			response: new Response('{}'),
		};
		expect(toPayload(reply)).toEqual({
			status: 200,
			type: 'application/json',
			data: { id: 1 },
		});
	});

	test('leaves anything else as it is', () => {
		const item = { id: 1, response: 'not a Response' };
		expect(toPayload(item)).toBe(item);
		expect(toPayload(null)).toBeNull();
		expect(toPayload('text')).toBe('text');
	});
});

describe('keyedArgs', () => {
	const handler = () => Promise.resolve(1);
	const options = { lazy: true };

	test('reads the key the call gives', () => {
		expect(keyedArgs(['item', handler])).toEqual(['item', handler, undefined]);
		expect(keyedArgs(['item', handler, options])).toEqual([
			'item',
			handler,
			options,
		]);
	});

	test('prefers the key given to the one the compiler appended', () => {
		expect(keyedArgs(['item', handler, '$auto'])).toEqual([
			'item',
			handler,
			undefined,
		]);
	});

	test('takes the appended key when the call gives none', () => {
		expect(keyedArgs([handler, '$auto'])).toEqual([
			'$auto',
			handler,
			undefined,
		]);
		expect(keyedArgs([handler, options, '$auto'])).toEqual([
			'$auto',
			handler,
			options,
		]);
	});

	test('throws with no key at all, or no handler', () => {
		expect(() => keyedArgs([handler])).toThrow('takes a key, or none');
		expect(() => keyedArgs(['item'])).toThrow('takes a key, or none');
	});
});

import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { ParamIR } from '../types';
import { checkTemplate } from './template';

const at: Location = { file: '/spec/openapi.json', pointer: '/paths/~1e/get' };

const param = (name: string, where: ParamIR['in'] = 'path'): ParamIR => ({
	name,
	in: where,
	required: true,
	explode: false,
	schema: { kind: 'string' },
	location: at,
});

function run(path: string, parameters: ParamIR[]) {
	const diagnostics = new Diagnostics();
	checkTemplate({ diagnostics }, path, parameters, at);
	return diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));
}

describe('checkTemplate', () => {
	it('is silent when the template and the path parameters match', () => {
		expect(run('/e/{a}/f/{b}', [param('b'), param('a')])).toEqual([]);
		expect(run('/e', [])).toEqual([]);
	});

	it('names a template variable with no path parameter', () => {
		expect(run('/e/{id}', [])).toEqual([
			{
				severity: 'error',
				code: 'path_parameter_mismatch',
				message: '`{id}` in the path has no `in: path` parameter',
				pointer: at.pointer,
			},
		]);
	});

	it('names a path parameter missing from the template', () => {
		expect(run('/e', [param('id')])).toEqual([
			{
				severity: 'error',
				code: 'path_parameter_mismatch',
				message: 'path parameter `id` does not appear in `/e`',
				pointer: at.pointer,
			},
		]);
	});

	it('ignores parameters that are not in the path', () => {
		expect(run('/e/{id}', [param('id'), param('id', 'query')])).toEqual([]);
		expect(run('/e', [param('q', 'query'), param('s', 'cookie')])).toEqual([]);
	});
});

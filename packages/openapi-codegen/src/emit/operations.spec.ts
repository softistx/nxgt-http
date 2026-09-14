/** The generated operation table and parameter validators, against the golden files. */
import { describe, expect, it } from 'bun:test';
import { operations as pets } from '../../test/generated/kitchen-sink/operations';
import { operations } from '../../test/generated/split/operations';
import { operations as streams } from '../../test/generated/streams/operations';

const getPet = pets.getPet;

describe('generated operations', () => {
	it('reads path parameters strictly as numbers', () => {
		expect(getPet.param.parse({ petId: '7' })).toEqual({ petId: 7 });
		for (const bad of ['', ' ', '0', '1.5', '0x10', 'abc']) {
			expect(getPet.param.safeParse({ petId: bad }).success).toBe(false);
		}
	});

	it('reads query lists, flags, mixed enums and defaults', () => {
		expect(
			getPet.query.parse({
				fields: ['name', 'kind'],
				ids: ['1', '2'],
				verbose: 'true',
				level: '2',
			}),
		).toEqual({
			fields: ['name', 'kind'],
			ids: [1, 2],
			verbose: true,
			level: 2,
		});
		expect(getPet.query.parse({ level: 'max' })).toEqual({
			verbose: false,
			level: 'max',
		});
		expect(getPet.query.parse({ cachebuster: '1' })).toEqual({
			verbose: false,
		});
		for (const bad of [
			{ verbose: 'yes' },
			{ level: '3' },
			{ ids: ['1', 'x'] },
		]) {
			expect(getPet.query.safeParse(bad).success).toBe(false);
		}
	});

	it('keys headers lowercased', () => {
		const id = '3f1c2a4e-8b7d-4c1e-9a2b-1c2d3e4f5a6b';
		expect(getPet.header.parse({ 'x-request-id': id })).toEqual({
			'x-request-id': id,
		});
		expect(getPet.header.safeParse({}).success).toBe(false);
	});

	it('describes each parameter for whoever reads or writes the request', () => {
		expect(
			getPet.parameters.map((p) => [p.name, p.in, p.explode, p.list]),
		).toEqual([
			['petId', 'path', false, false],
			['fields', 'query', true, true],
			['ids', 'query', false, true],
			['verbose', 'query', true, false],
			['level', 'query', true, false],
			['tier', 'query', true, false],
			['X-Request-Id', 'header', false, false],
		]);
	});

	it('points bodies and replies at their validators', () => {
		const create = operations.createEmployee;
		const json = create.body?.content['application/json'];
		expect(create.body?.required).toBe(true);
		expect(
			json?.schema?.safeParse({ name: 'Ada', email: 'ada@example.com' })
				.success,
		).toBe(true);
		expect(Object.keys(create.responses)).toEqual(['201', '400']);
		const upload = pets.upload;
		expect(upload.body?.content['application/octet-stream']).toEqual({
			kind: 'binary',
		});
		expect(upload.tags).toEqual([]);
		expect(upload.responses[201]).toEqual({
			'application/pdf': { kind: 'binary' },
		});
	});

	it('drops parameters where none are declared', () => {
		expect(operations.createEmployee.query.parse({ anything: '1' })).toEqual(
			{},
		);
	});

	it('checks each event and each line of a stream with its own validator', () => {
		const feed = streams.watchFeed.responses[200]?.['text/event-stream'];
		expect(feed?.kind).toBe('sse');
		expect(Object.keys(feed?.events ?? {})).toEqual([
			'update',
			'removed',
			'ping',
		]);
		// Text data has no validator: it is yielded as it came.
		expect(feed?.events?.ping).toBeNull();
		expect(
			feed?.events?.update?.parse({
				id: 'a',
				name: 'b',
				updatedAt: '2026-09-14T10:00:00Z',
			}),
		).toEqual({
			id: 'a',
			name: 'b',
			updatedAt: new Date('2026-09-14T10:00:00Z'),
		});
		expect(
			Object.keys(
				streams.listenMessages.responses[200]?.['text/event-stream']?.events ??
					{},
			),
		).toEqual(['message']);
		expect(streams.tailLogs.responses[200]?.['text/event-stream']).toEqual({
			kind: 'sse',
		});
		const lines = streams.exportItems.responses[200]?.['application/jsonl'];
		expect(lines?.kind).toBe('jsonl');
		expect(lines?.item?.safeParse({ id: 'a' }).success).toBe(false);
	});
});

import { afterEach, describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import {
	createLogger,
	createTelemetry,
	type Exporter,
	type LogRecord,
	type Signal,
	type SpanRecord,
	type SpanScope,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { telemetry } from './telemetry';

afterEach(() => uninstallTelemetry());

function collecting() {
	const signals: Signal[] = [];
	const exporter: Exporter = {
		export(_resource, batch) {
			signals.push(...batch);
		},
	};
	const instance = createTelemetry('alxia-test', {
		exporters: [exporter],
		batch: 1,
	});
	return {
		instance,
		signals,
		spans: () =>
			signals.filter((signal): signal is SpanRecord => signal.type === 'span'),
		logs: () =>
			signals.filter((signal): signal is LogRecord => signal.type === 'log'),
	};
}

const log = createLogger('UsersRoute');

function appWith(
	instance: ReturnType<typeof createTelemetry>,
	traceResponse = false,
) {
	return alxia()
		.use(
			telemetry({
				instance,
				traced: (ctx) => ctx.url.pathname !== '/health',
				traceResponse,
			}),
		)
		.get('/users/:id', ({ params, span, reply }) => {
			expectTypeOf(span).toEqualTypeOf<SpanScope | undefined>();
			span?.attribute('user.id', params.id);
			log.info('user read');
			return reply(200, { id: params.id });
		})
		.get('/guarded', ({ reply }) => reply(401, { error: 'no' }))
		.get('/boom', () => {
			throw new Error('boom');
		})
		.get('/health', ({ reply }) => reply(200));
}

describe('telemetry', () => {
	test('one server span named for the route, the logs inside carrying its trace', async () => {
		const { instance, spans, logs } = collecting();
		await appWith(instance).request('/users/7');
		await instance.close();
		const [span] = spans();
		expect(span?.name).toBe('GET /users/:id');
		expect(span?.kind).toBe('server');
		expect(span?.status).toBe('ok');
		expect(span?.attributes).toMatchObject({
			'http.route': '/users/:id',
			'url.path': '/users/7',
			'http.response.status_code': 200,
			'user.id': '7',
		});
		expect(logs()[0]?.span?.traceId).toBe(span?.context.traceId);
	});

	test('an inbound traceparent is continued, and can be said back', async () => {
		const { instance, spans } = collecting();
		const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
		const response = await appWith(instance, true).request('/users/1', {
			headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
		});
		await instance.close();
		expect(spans()[0]?.context.traceId).toBe(traceId as never);
		expect(spans()[0]?.parent).toBe('00f067aa0ba902b7' as never);
		expect(response.headers.get('traceparent')).toContain(traceId);
	});

	test('a 4xx is ok, a 5xx an error with its exception, a 404 keeps its path', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const { instance, spans } = collecting();
			const app = appWith(instance);
			await app.request('/guarded');
			await app.request('/boom');
			await app.request('/nowhere');
			await instance.close();
			const [guarded, boom, missing] = spans();
			expect(guarded?.status).toBe('ok');
			expect(boom?.status).toBe('error');
			expect(boom?.error?.message).toBe('boom');
			expect(missing?.name).toBe('GET /nowhere');
			expect(missing?.attributes['http.route']).toBeUndefined();
		} finally {
			console.error = original;
		}
	});

	test('traced: false leaves a request without a span', async () => {
		const { instance, spans } = collecting();
		await appWith(instance).request('/health');
		await instance.close();
		expect(spans()).toHaveLength(0);
	});
});

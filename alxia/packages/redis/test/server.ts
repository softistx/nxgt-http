/**
 * The Redis the specs run against: `$REDIS_URL` when it is set — CI's
 * service container — or a `redis-server` from `$PATH`, started on a free
 * port and stopped after the file. Each test starts from an empty database.
 */
import { afterAll, beforeAll, beforeEach } from 'bun:test';
import { RedisClient } from 'bun';

export interface TestRedis {
	readonly client: RedisClient;
	readonly uri: string;
}

export function useRedis(): TestRedis {
	const state = {} as {
		client: RedisClient;
		uri: string;
		server?: Bun.Subprocess;
	};
	beforeAll(async () => {
		let uri = process.env['REDIS_URL'];
		if (uri === undefined) {
			const binary = Bun.which('redis-server');
			if (binary === null) {
				throw new Error(
					'These specs need Redis: set REDIS_URL, or put redis-server on PATH',
				);
			}
			const port = 20_000 + Math.floor(Math.random() * 20_000);
			state.server = Bun.spawn(
				[binary, '--port', String(port), '--save', '', '--appendonly', 'no'],
				{ stdout: 'ignore', stderr: 'ignore' },
			);
			uri = `redis://127.0.0.1:${port}`;
			for (let attempt = 0; ; attempt++) {
				try {
					const probe = new RedisClient(uri);
					await probe.connect();
					probe.close();
					break;
				} catch (error) {
					if (attempt > 50) throw error;
					await Bun.sleep(20);
				}
			}
		}
		state.uri = uri;
		state.client = new RedisClient(uri);
		await state.client.connect();
	});
	beforeEach(async () => {
		await state.client.send('FLUSHDB', []);
	});
	afterAll(() => {
		state.client?.close();
		state.server?.kill();
	});
	return {
		get client() {
			return state.client;
		},
		get uri() {
			return state.uri;
		},
	};
}

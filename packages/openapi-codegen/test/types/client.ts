/**
 * A client's `request()`, typed from nothing but the generated `Operations`
 * map. It compiles only if the map carries what a client needs: which
 * parameters and body to send, and which replies can come back.
 */
import type {
	OperationIds,
	Operations,
	PathsByMethod,
} from '../generated/split/types.gen.js';

type Key = keyof Operations;

type Init<K extends Key> = {
	param: Operations[K]['paramInput'];
	query?: Operations[K]['queryInput'];
	header?: Operations[K]['headerInput'];
} & (Operations[K] extends { jsonInput: infer Body }
	? { json: Body }
	: { json?: never });

type Reply<K extends Key> = {
	[Status in keyof Operations[K]['responses']]: {
		status: Status;
		body: Operations[K]['responses'][Status] extends {
			'application/json': infer Body;
		}
			? Body
			: undefined;
	};
}[keyof Operations[K]['responses']];

declare function request<K extends Key>(
	key: K,
	init: Init<K>,
): Promise<Reply<K>>;

declare function call<Id extends keyof OperationIds>(
	id: Id,
	init: Init<OperationIds[Id]>,
): Promise<Reply<OperationIds[Id]>>;

export async function examples(): Promise<void> {
	const updated = await request('put /employees/{id}', {
		param: { id: '1' },
		json: { name: 'Ada', email: 'ada@example.com' },
	});
	if (updated.status === 200) updated.body.createdAt satisfies string;
	if (updated.status === 404) updated.body.message satisfies string | undefined;
	// @ts-expect-error 500 is not a status this operation declares
	void (updated.status === 500);

	await request('get /employees', { param: {}, query: { page: 2 } });
	// @ts-expect-error page is a number
	await request('get /employees', { param: {}, query: { page: '2' } });
	// @ts-expect-error creating an employee needs a body
	await request('post /employees', { param: {} });
	// @ts-expect-error no operation patches /employees
	await request('patch /employees', { param: {} });

	const deleted = await call('deleteEmployee', { param: { id: '1' } });
	deleted.status satisfies 204 | 404;

	'/employees/{id}' satisfies PathsByMethod['delete'];
	// @ts-expect-error nothing is deleted at /employees
	'/employees' satisfies PathsByMethod['delete'];
}

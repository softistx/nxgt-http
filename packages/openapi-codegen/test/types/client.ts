/**
 * `ClientOperations`, as a client reads it: a call takes `args` after the
 * `operationId` and resolves to one of the declared replies, narrowed on its
 * status.
 */
import type {
	ClientOperations,
	Employee,
	ErrorResponse,
} from '../generated/split/types.js';

type Equal<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
type Assert<T extends true> = T;

type Reply<K extends keyof ClientOperations> = ClientOperations[K]['reply'];

declare function call<K extends keyof ClientOperations>(
	id: K,
	...args: [...ClientOperations[K]['args'], init?: { signal?: AbortSignal }]
): Promise<Reply<K>>;

export type Checks = [
	Assert<
		Equal<
			ClientOperations['updateEmployee']['args'][0]['param'],
			{ id: string }
		>
	>,
	Assert<Equal<Reply<'deleteEmployee'>['status'], 204 | 404>>,
	Assert<
		Equal<Extract<Reply<'getEmployee'>, { status: 200 }>['data'], Employee>
	>,
	Assert<
		Equal<Extract<Reply<'getEmployee'>, { status: 404 }>['data'], ErrorResponse>
	>,
	Assert<
		Equal<Extract<Reply<'deleteEmployee'>, { status: 204 }>['data'], undefined>
	>,
];

export async function calls(): Promise<void> {
	// Nothing in the query is required: the input may be left out.
	await call('listEmployees');
	await call('listEmployees', { query: { page: 2 } }, {});
	await call('deleteEmployee', { param: { id: 'x' } });
	// @ts-expect-error the path parameter is required
	await call('deleteEmployee');
	// @ts-expect-error a page is a number, not the string of the query
	await call('listEmployees', { query: { page: '2' } });
	const reply = await call('getEmployee', { param: { id: 'x' } });
	if (reply.status === 200) {
		const name: string = reply.data.name;
		void name;
	}
}

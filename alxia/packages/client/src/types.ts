import type {
	Empty,
	Method,
	Outcome,
	RouteRecord,
	SuccessStatus,
} from '@alxia/core';

/** Anything the client can call: an app, typed by its routes. */
export interface AppLike {
	readonly '~routes': object;
}

export type RoutesOf<App> = App extends { readonly '~routes': infer Routes }
	? Routes
	: never;

/** The paths of `Routes` that answer `M`. */
export type PathsFor<Routes, M extends Method> = {
	[Path in keyof Routes]: M extends keyof Routes[Path] ? Path : never;
}[keyof Routes] &
	string;

type RecordAt<Routes, Path, M extends Method> = Path extends keyof Routes
	? M extends keyof Routes[Path]
		? Routes[Path][M] extends RouteRecord
			? Routes[Path][M]
			: never
		: never
	: never;

export type InputOf<Routes, Path, M extends Method> = RecordAt<
	Routes,
	Path,
	M
>['input'];

export type OutputOf<Routes, Path, M extends Method> = RecordAt<
	Routes,
	Path,
	M
>['output'];

/** What every call may add, whatever its route. */
export interface CallOptions {
	/** Headers sent with this call, under the ones its route types. */
	readonly init?: Omit<RequestInit, 'method' | 'body'>;
	readonly signal?: AbortSignal;
}

/** The options of a call: optional when its route needs nothing. */
export type CallArgs<Input> = Empty extends Input
	? [options?: Input & CallOptions]
	: [options: Input & CallOptions];

/**
 * What a call resolves to: one member per status the route may answer, so
 * checking `status`, or `ok`, narrows `data`.
 */
export type CallResult<Output> =
	Output extends Outcome<infer Status, infer Data>
		? {
				readonly status: Status;
				readonly ok: Status extends SuccessStatus ? true : false;
				readonly data: Data;
				readonly response: Response;
			}
		: never;

export type CallMethod<Routes, M extends Method> = <
	const Path extends PathsFor<Routes, M>,
>(
	path: Path,
	...args: CallArgs<InputOf<Routes, Path, M>>
) => Promise<CallResult<OutputOf<Routes, Path, M>>>;

/** The client of an app: one method per HTTP method its routes answer. */
export type Client<App> = {
	readonly [M in Method as [PathsFor<RoutesOf<App>, M>] extends [never]
		? never
		: Lowercase<M>]: CallMethod<RoutesOf<App>, M>;
};

import type {
	Empty,
	Method,
	Outcome,
	RouteRecord,
	SocketRecord,
	SuccessStatus,
} from '@alxia/core';

/** Anything the client can call: an app, typed by its routes. */
export interface AppLike {
	readonly '~routes': object;
}

export type RoutesOf<App> = App extends { readonly '~routes': infer Routes }
	? Routes
	: never;

/** The paths of `Routes` that answer `M`: a method, or `WS` for a socket. */
export type PathsFor<Routes, M extends Method | 'WS'> = {
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

type SocketAt<Routes, Path> = Path extends keyof Routes
	? 'WS' extends keyof Routes[Path]
		? Routes[Path]['WS' & keyof Routes[Path]] extends SocketRecord
			? Routes[Path]['WS' & keyof Routes[Path]]
			: never
		: never
	: never;

/** A socket, typed: what it sends, and what it receives. */
export interface TypedSocket<Send, Receive> extends AsyncIterable<Receive> {
	/** The browser's or Bun's own socket. */
	readonly raw: WebSocket;
	/** Settles once the socket is open; rejects if it fails first. */
	readonly opened: Promise<void>;
	/** Sends `message` as JSON; queued until the socket is open. */
	send(message: Send): void;
	/** Calls `listener` with each message received, until the function returned is called. */
	on(listener: (message: Receive) => void): () => void;
	close(code?: number, reason?: string): void;
}

export type SocketMethod<Routes> = <const Path extends PathsFor<Routes, 'WS'>>(
	path: Path,
	...args: CallArgs<SocketAt<Routes, Path>['input']>
) => TypedSocket<
	SocketAt<Routes, Path>['send'],
	SocketAt<Routes, Path>['receive']
>;

/** The client of an app: one method per HTTP method its routes answer, and `ws` for its sockets. */
export type Client<App> = {
	readonly [M in Method as [PathsFor<RoutesOf<App>, M>] extends [never]
		? never
		: Lowercase<M>]: CallMethod<RoutesOf<App>, M>;
} & ([PathsFor<RoutesOf<App>, 'WS'>] extends [never]
	? Empty
	: { readonly ws: SocketMethod<RoutesOf<App>> });

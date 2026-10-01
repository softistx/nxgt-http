/**
 * WebSockets, typed: what a socket route validates before the upgrade, what
 * the client sends it, and what it sends back.
 */
import type {
	BaseContext,
	Empty,
	MaybePromise,
	RouteDetail,
	RouteInput,
} from '../app/types';
import type { ValidationErrorBody } from '../errors/errors';
import type {
	InferInput,
	InferOutput,
	StandardSchemaV1,
} from '../schema/standard-schema';
import type { Jsonify } from '../types/json';
import type { PathParams } from '../types/path';

export interface SocketSchema {
	/** Checked before the upgrade, as a route's: a refused one is a 400, never a socket. */
	readonly params?: StandardSchemaV1;
	readonly query?: StandardSchemaV1;
	readonly headers?: StandardSchemaV1;
	readonly cookies?: StandardSchemaV1;
	/** Each message the client sends, as JSON. A refused one is answered with the issues, the socket kept open. */
	readonly message?: StandardSchemaV1;
	/** Each message the server sends: checked, then sent as its output. */
	readonly send?: StandardSchemaV1;
	readonly detail?: RouteDetail;
}

type SchemaAt<Schema, Key extends keyof SocketSchema> = Key extends keyof Schema
	? Schema[Key] extends StandardSchemaV1
		? Schema[Key]
		: never
	: never;

type OutputAt<Schema, Key extends keyof SocketSchema, Fallback> = [
	SchemaAt<Schema, Key>,
] extends [never]
	? Fallback
	: InferOutput<SchemaAt<Schema, Key>>;

type InputAt<Schema, Key extends keyof SocketSchema, Fallback> = [
	SchemaAt<Schema, Key>,
] extends [never]
	? Fallback
	: InferInput<SchemaAt<Schema, Key>>;

/** What a socket's handlers read as `socket.data`: the upgrade request, validated, and what each hook added. */
export type SocketContext<Ctx, Path extends string, Schema> = Omit<
	BaseContext,
	'reply' | 'redirect' | 'set'
> &
	Ctx & {
		readonly params: OutputAt<Schema, 'params', PathParams<Path>>;
		readonly query: OutputAt<
			Schema,
			'query',
			Readonly<Record<string, string | readonly string[]>>
		>;
		readonly headers: OutputAt<
			Schema,
			'headers',
			Readonly<Record<string, string>>
		>;
		readonly cookies: OutputAt<
			Schema,
			'cookies',
			Readonly<Record<string, string>>
		>;
	};

/** What the server sends: the input of the `send` schema, or any JSON. */
export type SocketSend<Schema> = InputAt<Schema, 'send', unknown>;

/** What the server receives: the output of the `message` schema, or the raw message. */
export type SocketMessage<Schema> = OutputAt<
	Schema,
	'message',
	string | Uint8Array
>;

/** One open socket, as its handlers see it. */
export interface Socket<Data, Send> {
	readonly data: Data;
	/** Sends `message` as JSON, checked by the `send` schema when the route has one. */
	send(message: Send): Promise<void>;
	/** Sends `message` to every socket subscribed to `topic`, this one excepted. */
	publish(topic: string, message: Send): Promise<void>;
	subscribe(topic: string): void;
	unsubscribe(topic: string): void;
	isSubscribed(topic: string): boolean;
	close(code?: number, reason?: string): void;
	/** Bun's own socket, for what this one does not cover. */
	readonly raw: Bun.ServerWebSocket<unknown>;
}

export interface SocketHandlers<Data, Send, Message> {
	open?(socket: Socket<Data, Send>): MaybePromise<void>;
	message(socket: Socket<Data, Send>, message: Message): MaybePromise<void>;
	close?(
		socket: Socket<Data, Send>,
		code: number,
		reason: string,
	): MaybePromise<void>;
	drain?(socket: Socket<Data, Send>): void;
}

/** A socket route, as the client knows it. */
export interface SocketRecord<
	Input = unknown,
	Send = unknown,
	Receive = unknown,
> {
	readonly input: Input;
	/** What the client sends. */
	readonly send: Send;
	/** What the client receives. */
	readonly receive: Receive;
}

export type SocketEntryOf<Path extends string, Schema> = {
	readonly [P in Path]: {
		readonly WS: SocketRecord<
			RouteInput<Path, Omit<Schema, 'body'>>,
			InputAt<Schema, 'message', unknown>,
			| Jsonify<OutputAt<Schema, 'send', unknown>>
			| ([SchemaAt<Schema, 'message'>] extends [never]
					? never
					: ValidationErrorBody)
		>;
	};
};

export type { Empty };

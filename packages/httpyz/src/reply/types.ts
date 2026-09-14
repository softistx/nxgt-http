/**
 * The replies a call declares, and the union it resolves to: one member per
 * declared status, so a check of `status` narrows `data`.
 */
import type {
	InferInput,
	InferOutput,
	StandardSchemaV1,
} from '../schema/standard-schema';

/**
 * A reply of one status: a schema for JSON, `null` for no content, or a
 * schema per media type, `null` where the body is not checked.
 */
export type Declared =
	| StandardSchemaV1
	| null
	| { readonly [mediaType: string]: StandardSchemaV1 | null };

/** The replies a call expects, by status: `{ 200: Employee, 404: Problem, 204: null }`. */
export type Responses = { readonly [status: number]: Declared };

/** What an unchecked body is read as, by its media type. */
type Unchecked<Type extends string> = Type extends `text/${string}`
	? string
	: Type extends 'multipart/form-data' | 'application/x-www-form-urlencoded'
		? FormData
		: Type extends 'application/json' | `application/${string}+json`
			? unknown
			: Blob;

/** What a checked value is: the schema's output, or its input with `decode: false`. */
export type SchemaData<
	Schema,
	Decoded extends boolean,
> = Schema extends StandardSchemaV1
	? Decoded extends true
		? InferOutput<Schema>
		: InferInput<Schema>
	: never;
type Data<Schema, Decoded extends boolean> = SchemaData<Schema, Decoded>;

/** The declared replies, as a union narrowed on `status`. */
export type ReplyOf<R extends Responses, Decoded extends boolean = true> = {
	[Status in keyof R & number]: R[Status] extends null
		? {
				readonly status: Status;
				readonly type: undefined;
				readonly data: undefined;
			}
		: R[Status] extends StandardSchemaV1
			? {
					readonly status: Status;
					readonly type: string;
					readonly data: Data<R[Status], Decoded>;
				}
			: {
					[Type in keyof R[Status] & string]: {
						readonly status: Status;
						readonly type: Type;
						readonly data: R[Status][Type] extends StandardSchemaV1
							? Data<R[Status][Type], Decoded>
							: Unchecked<Type>;
					};
				}[keyof R[Status] & string];
}[keyof R & number];

/** A reply of a call that declares none: whatever came, read by its media type. */
export interface AnyReply {
	readonly status: number;
	readonly type: string | undefined;
	readonly data: unknown;
}

/**
 * A reply, with the `Response` it was read from: for its headers, since its
 * body has been read into `data`.
 */
export type WithResponse<Reply> = Reply & { readonly response: Response };

export type HttpReply<
	R extends Responses | undefined,
	Decoded extends boolean = true,
> = WithResponse<R extends Responses ? ReplyOf<R, Decoded> : AnyReply>;

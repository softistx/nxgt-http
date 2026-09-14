/**
 * What a call sends: its path's parameters, typed from the path itself, its
 * query, and at most one body.
 */

/** A path parameter, a query value or a header: written as text, a `Date` as its ISO string. */
export type ParamValue = string | number | boolean | bigint | Date;

/** The `{name}`s of a path: `'id' | 'noteId'` from `'/items/{id}/notes/{noteId}'`. */
export type PathParamNames<Path extends string> =
	Path extends `${string}{${infer Name}}${infer Rest}`
		? Name | PathParamNames<Rest>
		: never;

/** `param`: required, with exactly its names, when the path has `{name}`s; else absent. */
export type PathInput<Path extends string> = [PathParamNames<Path>] extends [
	never,
]
	? { readonly param?: undefined }
	: {
			readonly param: {
				readonly [Name in PathParamNames<Path>]: ParamValue;
			};
		};

/** A query value: a list is sent as a repeated key; `null` and `undefined` are left out. */
export type QueryValue = ParamValue | readonly ParamValue[] | null | undefined;

export type QueryInput =
	| { readonly [name: string]: QueryValue }
	| URLSearchParams;

/**
 * A form's fields: each value as text, a list as a repeated field, a `Blob`
 * as a file, and any other object as JSON.
 */
export type FormFields = { readonly [name: string]: unknown };

type BodyKey = 'json' | 'form' | 'text' | 'body';
type Only<Key extends BodyKey, Value> = { readonly [K in Key]: Value } & {
	readonly [K in Exclude<BodyKey, Key>]?: undefined;
};

/** At most one body. */
export type BodyInput =
	/** Sent as `JSON.stringify` gives it, as `application/json`. */
	| Only<'json', unknown>
	/**
	 * URL-encoded, or multipart when a field is a file. A `FormData` is
	 * multipart and a `URLSearchParams` URL-encoded, whatever they hold.
	 */
	| Only<'form', FormFields | FormData | URLSearchParams>
	/** As `text/plain`. */
	| Only<'text', string>
	/** As it is: as a `Blob`'s own type, else `application/octet-stream`. */
	| Only<'body', Blob | ArrayBuffer | ArrayBufferView | ReadableStream>
	| { readonly [K in BodyKey]?: undefined };

/** What a call to `Path` sends. */
export type RequestInput<Path extends string> = PathInput<Path> &
	BodyInput & {
		readonly query?: QueryInput;
	};

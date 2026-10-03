/**
 * A stand-in for `@alxia/core`, as the generated `alxia.ts` sees it. The
 * generator does not depend on alxia, so `tsc` checks its fixtures' `alxia.ts`
 * against this copy of the part they touch: `eventStream`, and the
 * `RouteOperation` that `app.route(operation, handler)` takes, which
 * `test/types/alxia.ts` holds every fixture's operations to. A deliberate
 * copy, kept in step with alxia by hand: see AGENTS.md.
 */

export interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (value: unknown) => unknown;
		readonly types?:
			| { readonly input: Input; readonly output: Output }
			| undefined;
	};
}

type InferInput<Schema extends StandardSchemaV1> = NonNullable<
	Schema['~standard']['types']
>['input'];

type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
	Schema['~standard']['types']
>['output'];

export type StatusCode =
	| 100
	| 101
	| 102
	| 103
	| 200
	| 201
	| 202
	| 203
	| 204
	| 205
	| 206
	| 207
	| 208
	| 226
	| 300
	| 301
	| 302
	| 303
	| 304
	| 307
	| 308
	| 400
	| 401
	| 402
	| 403
	| 404
	| 405
	| 406
	| 407
	| 408
	| 409
	| 410
	| 411
	| 412
	| 413
	| 414
	| 415
	| 416
	| 417
	| 418
	| 421
	| 422
	| 423
	| 424
	| 425
	| 426
	| 428
	| 429
	| 431
	| 451
	| 500
	| 501
	| 502
	| 503
	| 504
	| 505
	| 506
	| 507
	| 508
	| 510
	| 511;

export interface RouteSchema {
	readonly params?: StandardSchemaV1;
	readonly query?: StandardSchemaV1;
	readonly headers?: StandardSchemaV1;
	readonly cookies?: StandardSchemaV1;
	readonly body?: StandardSchemaV1;
	readonly response?: { readonly [Status in StatusCode]?: StandardSchemaV1 };
	readonly detail?: {
		readonly summary?: string;
		readonly description?: string;
		readonly operationId?: string;
		readonly tags?: readonly string[];
		readonly deprecated?: boolean;
	};
}

export interface RouteOperation {
	readonly method:
		| 'GET'
		| 'POST'
		| 'PUT'
		| 'PATCH'
		| 'DELETE'
		| 'OPTIONS'
		| 'HEAD'
		| 'QUERY';
	readonly path: `/${string}`;
	readonly schema?: RouteSchema;
}

export interface EventStreamSchema<Item extends StandardSchemaV1>
	extends StandardSchemaV1<
		AsyncIterable<InferInput<Item>>,
		AsyncIterable<InferOutput<Item>>
	> {
	readonly '~eventStream': Item;
}

export declare function eventStream<Item extends StandardSchemaV1>(
	item: Item,
): EventStreamSchema<Item>;

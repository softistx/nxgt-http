/**
 * Every fixture's `alxia.ts` is what alxia's `app.route(operation, ...middlewares, handler)`
 * takes: a `RouteOperation` each, whose `params` accept the path's
 * parameters as the strings they arrive as. Checked against the stand-in of
 * `test/alxia/core.ts`, since the generator does not depend on alxia.
 */
import type {
	RouteOperation,
	StandardSchemaV1,
	StatusCode,
} from '../alxia/core';
import type { operations as alxia } from '../generated/alxia/alxia';
import type { operations as oaiQuery } from '../generated/conformance/oai-query-3.2/alxia';
import type { operations as oaiTags } from '../generated/conformance/oai-tags-3.2/alxia';
import type { operations as oaiTictactoe } from '../generated/conformance/oai-tictactoe/alxia';
import type { operations as oaiWebhook } from '../generated/conformance/oai-webhook/alxia';
import type { operations as redoclyMuseum } from '../generated/conformance/redocly-museum/alxia';
import type { operations as dates } from '../generated/dates/alxia';
import type { operations as kitchenSink } from '../generated/kitchen-sink/alxia';
import type { operations as query } from '../generated/query/alxia';
import type { operations as split } from '../generated/split/alxia';
import type { operations as streams } from '../generated/streams/alxia';
import type { operations as typespec } from '../generated/typespec/alxia';

type Assert<T extends true> = T;

/** `/pets/:petId/tags` → `{ petId: string }`, as alxia hands the parameters over. */
type PathParams<Path extends string> = {
	readonly [Name in ParamName<Path>]: string;
};
type ParamName<Path extends string> = Path extends `${string}:${infer Rest}`
	? Rest extends `${infer Name}/${infer Tail}`
		? Name | ParamName<Tail>
		: Rest
	: never;

type InputOf<Schema extends StandardSchemaV1> = NonNullable<
	Schema['~standard']['types']
>['input'];

/** Every status a route declares is one alxia types: a plain `extends` lets any key through. */
type KnownStatuses<Operation> = Operation extends {
	readonly schema: { readonly response: infer Responses };
}
	? [Exclude<keyof Responses, StatusCode>] extends [never]
		? true
		: false
	: true;

/** The cookies arrive by name as strings, as alxia hands them over: its `cookies` schema must take them so. */
type CookiesFit<Operation> = Operation extends {
	readonly schema: { readonly cookies: infer Cookies extends StandardSchemaV1 };
}
	? { [Name in keyof InputOf<Cookies>]: string } extends InputOf<Cookies>
		? true
		: false
	: true;

type Fits<Operation> = Operation extends RouteOperation
	? KnownStatuses<Operation> extends false
		? false
		: CookiesFit<Operation> extends false
			? false
			: Operation extends {
						readonly schema: {
							readonly params: infer Params extends StandardSchemaV1;
						};
					}
				? PathParams<Operation['path']> extends InputOf<Params>
					? keyof InputOf<Params> extends ParamName<Operation['path']>
						? true
						: false
					: false
				: true
	: false;

type AllFit<Table> = false extends {
	[Id in keyof Table]: Fits<Table[Id]>;
}[keyof Table]
	? false
	: true;

export type Checks = [
	Assert<AllFit<typeof kitchenSink>>,
	Assert<AllFit<typeof query>>,
	Assert<AllFit<typeof split>>,
	Assert<AllFit<typeof dates>>,
	Assert<AllFit<typeof streams>>,
	Assert<AllFit<typeof alxia>>,
	Assert<AllFit<typeof typespec>>,
	Assert<AllFit<typeof oaiQuery>>,
	Assert<AllFit<typeof oaiTags>>,
	Assert<AllFit<typeof oaiTictactoe>>,
	Assert<AllFit<typeof oaiWebhook>>,
	Assert<AllFit<typeof redoclyMuseum>>,
	// A table that is not one fails: the check can fail.
	Assert<
		false extends AllFit<{ x: { method: 'TRACE'; path: '/' } }> ? true : false
	>,
	Assert<
		false extends AllFit<{
			x: { method: 'GET'; path: '/'; schema: { response: { 299: never } } };
		}>
			? true
			: false
	>,
	Assert<
		false extends AllFit<{
			x: {
				method: 'GET';
				path: '/';
				schema: { cookies: StandardSchemaV1<{ n: number }> };
			};
		}>
			? true
			: false
	>,
];

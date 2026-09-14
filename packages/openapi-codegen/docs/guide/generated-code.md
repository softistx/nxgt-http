# The generated code

Most examples on this page come from one small spec: an `Employee` API with
`GET /employees` (paged with `page` and `size`), `POST /employees`, and
`GET`, `PUT` and `DELETE /employees/{id}`. The `getPet` and `upload`
examples come from a second one, with a pet store's parameters and a form.

## Names

| From the spec | Type | Validator |
| --- | --- | --- |
| `components.schemas.Employee` | `Employee` | `zEmployee` |
| a `$ref`'d file, `schemas/employee-status.yaml` | `EmployeeStatus` | `zEmployeeStatus` |
| an object written inline as `createEmployee`'s body | `CreateEmployeeBody` | `zCreateEmployeeBody` |
| … as `getEmployee`'s 200 response | `GetEmployee200Response` | `zGetEmployee200Response` |
| a body or response shared through `components` | named after itself: `NotFoundResponse` | `zNotFoundResponse` |
| `getPet`'s path, query or header parameters | `GetPetParam`, `GetPetQuery`, `GetPetHeader` | `zGetPetParam`, … |
| `upload`'s form body, read from text | the body's own type | `zUploadForm`, in `operations.ts` |
| a schema whose defaults make input differ from output | `Employee` and `EmployeeInput` | `zEmployee` |

Scalars and lists written inline stay inline: only objects, unions,
intersections and maps get a name. Two schemas that would get the same name
are an error. Rename one with the [`names` option](options.md#names).

## `types.ts`

```ts
export interface NewEmployee {
	name: string;
	email: string;
	status?: EmployeeStatus | undefined;
	tags?: string[] | undefined;
}

export interface Employee extends NewEmployee {
	id: string;
	createdAt: string;
	/** Who this employee reports to, if anyone. */
	manager?: Employee | null | undefined;
}

export const EmployeeStatus = {
	Active: 'active',
	OnLeave: 'on_leave',
	Left: 'left',
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];
```

- **An interface wherever one can be written.** It keeps its name in errors
  and hovers, and `allOf` over objects becomes `extends`.
- **`?: T | undefined`, not `?: T`**, which is what the validator returns, so
  the two agree under `exactOptionalPropertyTypes`.
- **`XInput`** appears only when a default makes what the validator accepts
  differ from what it returns:

  ```ts
  export interface ListQuery {
  	/** @default 20 */
  	first: number; // always there after validation
  }
  export interface ListQueryInput {
  	first?: number | undefined; // may be left out by the caller
  }
  ```

- **Descriptions and `deprecated`** become JSDoc.
- **A named enum is an `as const` object** and the union of its values.
  - `EmployeeStatus.OnLeave` reads as a value, and a plain `'on_leave'` still
    types as `EmployeeStatus`. A TypeScript `enum` would refuse that, and
    `erasableSyntaxOnly` refuses the `enum` itself.
  - Member names come from `x-enum-varnames` (or `x-enumNames`) when the spec
    gives them. Otherwise each value is PascalCased.
  - Inline enums, enums with a boolean, and single constants stay unions.
  - [`enums: 'union'`](options.md#enums) turns the objects off.
- **Nothing is imported.** The enum objects are the only runtime values, so a
  front end can use the types without shipping Zod.

## `zod.ts`

```ts
import { z } from 'zod';
import { EmployeeStatus } from './types.js';
import type { Employee } from './types.js';

export const zEmployeeStatus = z.enum(EmployeeStatus);

export const zNewEmployee = z.object({
	name: z.string().min(1),
	email: z.email(),
	status: zEmployeeStatus.optional(),
	tags: z.array(z.string()).optional(),
});

export const zEmployee: z.ZodType<Employee, Employee> = zNewEmployee.extend({
	id: z.guid(),
	createdAt: z.iso.datetime({ offset: true }),
	get manager() {
		return zEmployee.nullable().optional();
	},
});
```

- **One validator per named schema**, `z<Name>`, in dependency order.
- **A schema that refers to itself**, directly or through others, is
  annotated with its type. That annotation is what lets TypeScript type it at
  all. It stays a full validator: `zEmployee.parse()` checks the whole tree.
- **Unknown keys are stripped** unless the spec or
  [`unknownKeys`](options.md#unknownkeys) says otherwise.
- **Defaults are filled in**, a fresh object or array on every parse.

Every type and its validator are printed from the same reading of the spec.
The package's own tests check, for every schema of every fixture, that
`z.output<typeof zX>` is `X` and `z.input<typeof zX>` is `XInput`.

## The `Operations` map

`types.ts` also describes every operation, keyed by its `operationId`,
as a server sees it:

```ts
export interface Operations {
	updateEmployee: {
		method: 'put';
		path: '/employees/{id}';
		honoPath: '/employees/:id';
		param: UpdateEmployeeParam;
		query: {};
		header: {};
		json: NewEmployee;
		responses: {
			200: { 'application/json': Employee };
			404: { 'application/json': ErrorResponse };
		};
	};
	// …
}
```

| Key | Holds |
| --- | --- |
| `method`, `path`, `honoPath` | the route, as the spec writes it and as Hono does |
| `param`, `query`, `header` | parameters as validated: numbers are numbers, defaults filled in |
| `json` | a JSON request body as validated, when there is one; `\| undefined` when it is optional |
| `form` | a form or multipart body, likewise |
| `responses` | status code → media type → body; `{}` for a response with no content |
| `stream` | only on an operation that replies with a [stream](#streams): its `kind`, and the `item` a handler writes |

What a caller sends, before defaults, is in [`paths.ts`](#pathsgents).

Four indexes come with it:

```ts
/** The operation behind each route: `routes.put(path)` finds it here. */
export interface OperationsByRoute {
	'put /employees/{id}': 'updateEmployee';
	// …
}

/** The paths with an operation for each method. */
export interface PathsByMethod {
	get: '/employees' | '/employees/{id}';
	put: '/employees/{id}';
	options: never; // every method is listed
	// …
}

/** The operations under each tag. */
export interface OperationsByTag {
	employees: 'listEmployees' | 'createEmployee' | 'getEmployee' | …;
}

/** `PathsByMethod`, for each tag. */
export interface PathsByTag {
	employees: { get: '/employees' | '/employees/{id}'; /* … */ };
}
```

They are plain interfaces, so a lookup costs TypeScript the same whatever
the size of the spec:

```ts
import type { Operations, OperationsByRoute } from './generated/types.js';

type Id = OperationsByRoute['put /employees/{id}']; // 'updateEmployee'
type Updated = Operations[Id]['responses'][200]['application/json']; // Employee
```

## The `ClientOperations` map

`types.ts` describes each operation a second time, as a client calls it.
This is the map [`@nxgt/openapi-httpyz`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-httpyz/README.md)
reads, to type a client over `@nxgt/httpyz`:

```ts
export interface ClientOperations {
	updateEmployee: {
		method: 'put';
		path: '/employees/{id}';
		args: [input: {
			param: { id: string };
			json: NewEmployee;
		}];
		reply:
			| { status: 200; type: 'application/json'; data: Employee }
			| { status: 404; type: 'application/json'; data: ErrorResponse };
		wire: …; // the same, as JSON carries it
	};
	// …
}
```

| Key | Holds |
| --- | --- |
| `args` | what a call takes after the `operationId`: `[input]`, `[input?]` when nothing in it is required, `[]` when the operation takes nothing |
| `param`, `query`, `header` in the input | parameters as the caller writes them, before defaults |
| `json`, `form`, `text`, `body` in the input | the request body, keyed by kind; `body` is binary. A spec that accepts several kinds gives a union of inputs, one kind each |
| `reply` | every declared reply as `{ status, type, data }`, the body decoded; `type` and `data` are `undefined` for a reply with no content |
| `wire` | the same replies as JSON carries them: with [`dates: 'date'`](options.md#dates), their dates are strings |
| `stream` | only on an operation that replies with a [stream](#streams): its `kind`, each `item` decoded, and the same as JSON carries it in `wire` |

As in `Operations`, only exact statuses appear: an operation that declares
none has `reply: never`.

### Streams

A 2xx reply of server-sent events (`text/event-stream`) or of JSON Lines
(`application/jsonl`, `application/x-ndjson`, `application/json-seq`) is
read an item at a time, as OpenAPI 3.2's `itemSchema` describes it. The
operation's entry gets a `stream`:

```yaml
text/event-stream:
  itemSchema:
    oneOf:
      - properties:
          event: { const: update }
          data:
            type: string
            contentMediaType: application/json
            contentSchema: { $ref: '#/components/schemas/Item' }
      - properties:
          event: { const: ping }
          data: { type: string }
```

```ts
stream: {
	kind: 'sse';
	item:
		| { event: 'update'; data: Item; id: string | undefined }
		| { event: 'ping'; data: string; id: string | undefined };
	wire: …; // the same, as JSON carries it
};
```

- Each event is named by the constant of its `event` (a `const`, or an
  `enum` of one). An event with no `event` is a `message`, as `EventSource`
  names it. One whose `event` is not a constant is left out, with a warning:
  a client passes it to `onUnknownEvent`.
- Its `data` is JSON when it has `contentMediaType: application/json`,
  checked by `contentSchema`, and text otherwise. A `contentSchema` written
  inline is named `<Operation><Status>Response<Event>Data`.
- Without an `itemSchema`, any event is yielded, its data as text:
  `{ event: string; data: string; id: string | undefined }`.
- A JSON Lines item is its `itemSchema`, `unknown` without one. One written
  inline is named `<Operation><Status>ResponseItem`.

Only the first stream of an operation's 2xx replies becomes its `stream`.
`reply` still declares the reply read whole: the events as text, the lines as
a `Blob`. A request body is sent whole whatever its media type.

## `operations.ts`

The same operations as data, for code that reads requests at runtime:

```ts
import { operations } from './generated/operations.js';

const op = operations.getPet;
op.param.parse({ petId: '7' }); // { petId: 7 }
op.query.parse({ ids: ['1', '2'], verbose: 'true' }); // { ids: [1, 2], verbose: true }
op.header.parse({ 'x-request-id': '3f1c2a4e-8b7d-4c1e-9a2b-1c2d3e4f5a6b' });
op.responses[200]?.['application/json']?.schema?.parse(body);
```

Each entry, keyed by `operationId`, holds:
- `method`, `path`, `honoPath` and `tags`;
- a `parameters` list;
- the `param`, `query` and `header` validators;
- the `body` media types with their validators, and the same for each
  response. A stream's media has no `schema`: server-sent events carry
  `events`, a validator per event name (`null` for text data), and JSON
  Lines carry `item`, the validator of each line.

```ts
operations.watchFeed.responses[200]?.['text/event-stream'];
// { kind: 'sse', events: { update: zItem, ping: null } }
```

The table is typed
`{ readonly [K in keyof Operations]: OperationSpec<ClientOperations[K]> }`:
this keeps it cheap for TypeScript on large specs, and the precise types are
in `Operations`. The type argument carries each operation's client types, so
`createOpenApiClient(http, operations)` from `@nxgt/openapi-httpyz` needs no
other import.

Parameters arrive as text, so their validators read them strictly:

| Declared | Accepts | Refuses |
| --- | --- | --- |
| `integer` | `7`, `-3`, `1e2` | `1.5`, `''`, `' '`, `0x10`, `01` (`z.coerce.number()` would take the last four) |
| `number` | `7`, `-3`, `1.5`, `1e2` | `''`, `' '`, `0x10`, `01` |
| `boolean` | `true`, `false`, in any case | `1`, `yes`, `''` |
| `enum: [1, 2, max]` | `1`, `2`, `max` | `3` |
| `type: array` | a list of values | |

A list parameter is marked `list: true` in `parameters`. Pass every value of
a repeated query key (`?ids=1&ids=2`, `explode: true`, the default) or split
the one value on commas (`?ids=1,2`, `explode: false`, and headers). Headers
are keyed by lowercased name. A parameter that is not declared is dropped.

A form body carries text too. When its schema is a flat object, it gets a
validator of its own, `z<Operation>Form`, that reads each field the same
way. A list field sent once is taken as a list of one.

## `paths.ts`

The same spec in the shape openapi-typescript prints, so tools built for
openapi-typescript's output, openapi-fetch first, read it unchanged:

```ts
export interface paths {
	'/employees/{id}': {
		parameters: {
			query?: never;
			header?: never;
			path: { id: string };
			cookie?: never;
		};
		/** Fetch an employee. */
		get: operations['getEmployee'];
		put: operations['updateEmployee'];
		post?: never;
		// … every method, `?: never` where the spec has none
	};
}

export interface operations {
	updateEmployee: {
		parameters: {
			query?: never;
			header?: never;
			path: { id: string };
			cookie?: never;
		};
		// NewEmployeeInput instead, where defaults make it differ
		requestBody: { content: { 'application/json': NewEmployee } };
		responses: {
			200: {
				headers: { [name: string]: unknown };
				content: { 'application/json': Employee };
			};
		};
	};
}
```

```ts
import createClient from 'openapi-fetch';
import type { paths } from './generated/paths.js';

const api = createClient<paths>({ baseUrl: 'https://api.example.com' });
const { data } = await api.GET('/employees/{id}', {
	params: { path: { id: '42' } },
}); // data: Employee | undefined
```

- **Same types.** Every schema is its type from `types.ts`, and
  `components['schemas']['Employee']` is `Employee`.
- **What is sent vs what comes back.** Parameters and request bodies are
  typed as a caller sends them (`XInput`, where defaults make it differ).
  Responses are typed as the server returns them.
- **Header names** keep the spec's case here, as a client writes them.
- **Only exact status codes** appear in `responses`, as in `Operations`.
- **Content without a schema** is `globalThis.Blob`.
- **QUERY.** An OpenAPI 3.2 `query` operation appears under `query`, only on
  the paths that have one. openapi-fetch has no method for it.
- **Not filled in.** `webhooks` and `$defs` are empty, and so are
  `components`' `responses`, `parameters`, `requestBodies`, `headers` and
  `pathItems`: they are resolved into `operations`.

## `hono.ts`

Written with the [`hono` option](options.md#hono) only. It holds:
- `Replies`: what each operation may send, as Hono types a reply;
- `HonoSpec`;
- `createRoutes` and `createApi`, bound to the spec;
- `streamEvents` and `streamLines`, when an operation replies with a
  [stream](#streams): its handler writes each item, typed by the
  `operationId`.

They are bound to the runtime in `@nxgt/openapi-hono`. [Typed Hono routes](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/guide.md)
covers how to use them.

```ts
export interface Replies {
	updateEmployee:
		| Hono.TypedResponse<Employee, 200, 'json'>
		| Hono.TypedResponse<ErrorResponse, 404, 'json'>;
	deleteEmployee:
		| Hono.TypedResponse<null, 204, 'body'>
		| Hono.TypedResponse<ErrorResponse, 404, 'json'>;
	// …
}
```

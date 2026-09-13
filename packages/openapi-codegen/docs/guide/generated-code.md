# The generated code

Every example on this page comes from one small spec: an `Employee` API with
`GET /employees` (paged with `page` and `size`), `POST /employees`, and
`GET`, `PUT` and `DELETE /employees/{id}`.

## Names

| From the spec | Type | Validator |
| --- | --- | --- |
| `components.schemas.Employee` | `Employee` | `zEmployee` |
| a `$ref`'d file, `schemas/employee-status.yaml` | `EmployeeStatus` | `zEmployeeStatus` |
| an object written inline as `createEmployee`'s body | `CreateEmployeeBody` | `zCreateEmployeeBody` |
| … as `getEmployee`'s 200 response | `GetEmployee200Response` | `zGetEmployee200Response` |
| a body or response shared through `components` | named after itself: `NotFoundResponse` | `zNotFoundResponse` |
| `getPet`'s path, query or header parameters | `GetPetParam`, `GetPetQuery`, `GetPetHeader` | `zGetPetParam`, … |
| a schema whose defaults make input differ from output | `Employee` and `EmployeeInput` | `zEmployee` |

Scalars and lists written inline stay inline: only objects, unions,
intersections and maps get a name. Two schemas that would get the same name
are an error. Rename one with the [`names` option](options.md#names).

## `types.gen.ts`

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

export type EmployeeStatus = 'active' | 'on_leave' | 'left';
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
- **Nothing is imported**: the file costs nothing at runtime, and a front end
  can use the types without shipping Zod.

## `zod.gen.ts`

```ts
import { z } from 'zod';
import type { Employee } from './types.gen.js';

export const zEmployeeStatus = z.enum(['active', 'on_leave', 'left']);

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

`types.gen.ts` also describes every operation, keyed `'<method> <path>'` as
the spec writes it:

```ts
export interface Operations {
	'put /employees/{id}': {
		operationId: 'updateEmployee';
		method: 'put';
		path: '/employees/{id}';
		honoPath: '/employees/:id';
		param: UpdateEmployeeParam;
		paramInput: UpdateEmployeeParam;
		query: {};
		queryInput: {};
		header: {};
		headerInput: {};
		json: NewEmployee;
		jsonInput: NewEmployeeInput; // or NewEmployee, when they agree
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
| `param`, `query`, `header` | parameters as validated: numbers are numbers, defaults filled in |
| `paramInput`, `queryInput`, `headerInput` | parameters as a caller passes them, before defaults |
| `json`, `jsonInput` | a JSON request body, when there is one; `\| undefined` when it is optional |
| `form`, `formInput` | a form or multipart body, when there is one |
| `responses` | status code → media type → body; `{}` for a response with no content |

Two indexes come with it:

```ts
export interface OperationIds {
	updateEmployee: 'put /employees/{id}';
	// …
}

export interface PathsByMethod {
	get: '/employees' | '/employees/{id}';
	put: '/employees/{id}';
	options: never; // every method is listed
	// …
}
```

They are enough to type a client of your own:

```ts
import type { Operations } from './generated/types.gen.js';

type Reply<K extends keyof Operations, S extends keyof Operations[K]['responses']> =
	Operations[K]['responses'][S] extends { 'application/json': infer Body }
		? Body
		: undefined;

type Updated = Reply<'put /employees/{id}', 200>; // Employee
```

## `operations.gen.ts`

The same operations as data, for code that reads or writes requests at
runtime:

```ts
import { operations } from './generated/operations.gen.js';

const op = operations['get /pets/{petId}'];
op.param.parse({ petId: '7' }); // { petId: 7 }
op.query.parse({ ids: ['1', '2'], verbose: 'true' }); // { ids: [1, 2], verbose: true }
op.header.parse({ 'x-request-id': '3f1c2a4e-8b7d-4c1e-9a2b-1c2d3e4f5a6b' });
op.responses[200]?.['application/json']?.schema?.parse(body);
```

Each entry holds `operationId`, `method`, `path`, `honoPath`, a `parameters`
list, the `param`, `query` and `header` validators, the `body` media types
with their validators, and the same for each response. The table is typed
`{ readonly [K in keyof Operations]: OperationSpec }`: this keeps it cheap for
TypeScript on large specs, and the precise types are in `Operations`.

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

# Typed Hono routes

With the `hono` option, the generator also writes `hono.gen.ts`: the routes
of the spec, typed for a Hono app and validated with the generated
validators.

- A handler gets its parameters and body already validated.
- A request the spec refuses is answered with a 400 that lists every issue.
- A handler that returns a reply the spec does not declare does not compile.

## Setup

`hono.gen.ts` imports `@nxgt/openapi-codegen/hono` at runtime, so the
package becomes a dependency of your app, not a dev dependency:

```sh
bun add @nxgt/openapi-codegen hono zod
```

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	hono: true,
});
```

## Register routes

```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono.gen.js';

const app = new Hono();
const routes = createRoutes(app);

routes.put('/employees/{id}', auth, async (c) => {
	const { id } = c.req.valid('param');
	const employee = await employees.update(id, c.req.valid('json'));
	if (!employee) return c.json({ message: 'errors.not-found' }, 404);
	return c.json(employee, 200);
});

routes.operation('deleteEmployee', auth, async (c) => {
	await employees.remove(c.req.valid('param').id);
	return c.body(null, 204);
});
```

- **Paths are written as the spec writes them**, `{id}` and not `:id`.
  Each method offers only the paths that have an operation for it.
- **`routes.operation(id, …)`** registers an operation by its `operationId`.
- **Middlewares come first, then the handler.**
- **`c.req.valid()`** holds what was validated: `param`, `query`, `header`,
  and `json` or `form` for a body. Numbers are numbers and defaults are
  filled in. Header names are lowercased. A text body is validated too, but
  Hono has no target for it: read it with `c.req.text()`.
- **The handler returns one of the declared replies:**

  | Declared | Return |
  | --- | --- |
  | a JSON body | `c.json(body, status)` |
  | a text body | `c.text(text, status)` |
  | no content | `c.body(null, status)`; for a 3xx other than 304, also `c.redirect(url, status)` |
  | a binary body | `c.body(data, status, headers)` |

## What happens to a request

A route runs as `[...middlewares, validator, handler]`, so `auth` answers
401 before the body is even read.

1. **The validator reads every target**, then answers:
   - **Path, query and headers** are read as text. A query list is every
     value of a repeated key (`?ids=1&ids=2`), or one value split on commas
     with `explode: false`. A header list is split on commas.
   - **The body** is read by its `Content-Type`: the media type itself, then
     `type/*`, then `*/*`.
     - JSON is parsed and validated.
     - A form (`multipart/form-data`, `application/x-www-form-urlencoded`)
       whose schema is a [flat object](schema-mapping.md#form-bodies) has
       each field read from text, and a field sent once is taken as a list
       of one where the schema expects a list.
     - Text is validated as a string.
     - Binary content passes through untouched.
2. **Hono caches the body**, so a middleware that read it and the handler
   can both read it again.
3. **Every issue of every target** goes into one failure: one 400, not the
   first mistake only.

When a middleware needs validated input, `routes.validate` marks where
validation runs:

```ts
// 401 from auth, then 400 from validation, then 403 from ownership
routes.put('/employees/{id}', auth, routes.validate, ownsEmployee, handler);
```

## Validation errors

By default, a refused request gets:

```json
{
	"status": 400,
	"message": "errors.validation-failed",
	"timestamp": "2024-05-01T10:00:00.000Z",
	"issues": [
		{
			"target": "json",
			"path": ["email"],
			"code": "invalid_format",
			"message": "Invalid email address"
		}
	]
}
```

- **`target`** is `param`, `query`, `header`, `json`, `form`, or `body` for
  a text body.
- **`code`** is Zod's issue code, or one of these:

  | Code | When |
  | --- | --- |
  | `invalid_json` | the body is not JSON |
  | `invalid_content_type` | no declared media type matches, or a body came without a `Content-Type` |
  | `missing_body` | a required body is missing: an empty request with no `Content-Type`, or an empty JSON body |

To answer differently, pass `onValidationError`:

```ts
const routes = createRoutes(app, {
	onValidationError: (failure, c) => {
		throw new CustomException(400, 'errors.validation-failed', {
			issues: failure.issues,
		});
	},
});
```

The hook can do three things:
- **return a `Response`** to send it;
- **throw**, to hand the failure to `app.onError`, which is where an app
  translates its messages;
- **return nothing**, to send the default.

`routes.with({ onValidationError })` sets it for the routes registered
through it, and leaves the others alone.

## Checking replies

```ts
const routes = createRoutes(app, {
	validateResponses: process.env.NODE_ENV !== 'production',
});
```

With `validateResponses`, every reply is checked against the spec:
- its status must be declared, or the issue is `undeclared_status`;
- its `Content-Type` must be one of the status's media types, when the
  status declares any;
- a JSON or text body is validated.

A reply that fails goes through `onValidationError` as a `response`
failure, which is a 500 by default. Checking reads every reply body twice:
keep it for development and tests.

Only exact statuses are declared. `default` and `4XX` responses are dropped
with an `ignored` warning, so an operation that declares only those has its
replies typed `Response`: any reply compiles. And with `validateResponses`,
every reply it sends fails as `undeclared_status`. Give each operation its
exact statuses.

## Modules

`createApi()` holds one registry for the whole spec. Each module registers
its routes on its own sub-app:

```ts
import { createApi } from './generated/hono.gen.js';

export const api = createApi();

// employees.routes.ts
const employees = new Hono();
api
	.routes(employees, { prefix: '/employees', tag: 'employees' })
	.get('/employees', listEmployees)
	.get('/employees/{id}', getEmployee);

// app.ts
app.route('/employees', employees);
api.assertComplete(); // throws, listing every operation without a route
```

- **`prefix`** is where the sub-app is mounted, as the spec writes it.
  Routes are registered relative to it. Only paths under it are offered,
  and one outside it fails at startup.
- **`tag`** offers only the operations with that tag, by path and by
  `operationId`.
- **`api.missing(tag?)`** lists the operations without a route, of one tag
  or of all. **`api.assertComplete(tag?)`** throws when there is one.

`createRoutes(app, options)` is `createApi(options).routes(app, options)`:
a registry for that app alone.

## Mistakes caught at startup

Registering a route throws when:
- **the operation already has a route**;
- **an earlier route would always answer first.** Hono tries routes in the
  order they were registered, so `/users/{id}` registered before
  `/users/me` answers for it. Register the static path first;
- **the operation is outside the `prefix` or the `tag`**;
- **the last argument is not the handler**, or `routes.validate` appears
  twice.

## Traps

- **With `dates: 'date'`, a handler gets `Date`s and can reply with them.**
  `c.req.valid()` holds decoded dates. `c.json()` sends a `Date` as its
  ISO string, and `Replies` types replies as JSON carries them (`Wire<T>`),
  so both a `Date` and its string compile.
- **Give `c.json()` a status.** Without one, Hono types the reply with any
  contentful status, and it matches no declared reply.
- **Reply with plain objects.** A Mongoose document is not the JSON it
  serializes to, and its type does not match the schema's. Return `.lean()`
  results, or `toJSON()`.
- **A body declared as both JSON and a form** types `c.req.valid('json')`
  and `c.req.valid('form')` as both present. Only the one the request sent
  is filled in.
- **Keep form schemas flat.** Only a form whose schema is a
  [flat object](schema-mapping.md#form-bodies) is read from text. Any other
  form is validated by its own `z<Name>`, so `copies=2` arrives as the
  string `'2'` and fails an integer.
- **`security` is not enforced.** The spec's security requirements are not
  turned into middlewares; register your own.

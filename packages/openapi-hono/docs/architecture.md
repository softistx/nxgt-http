# Hono runtime

`@nxgt/openapi-hono` is what the generated `hono.ts` binds to its spec. It
imports `hono` for types only, so it loads whether or not `hono` is
installed; `hono` is its peer because the types need it.

| File | Holds |
| --- | --- |
| `engine.ts` | `createApi`: registration, request validation, reply checks |
| `errors.ts` | issues, failures, `validationErrorHandler` |
| `types.ts` | the types of `routes`: `ApiSpec`, `Routes`, `Scope`, `RouteHandler` |
| `routable.ts` | `unroutable`: why Hono cannot route an operation; `@nxgt/openapi-codegen` keeps a copy, to warn at generation |
| `index.ts` | the package's exports, named one by one |

## Registration

`createApi(table)` builds an index from `'<method> <path>'` to
`operationId`, and returns the `Api`. `api.routes(app, options)` returns a
routes object:
- a function per HTTP method;
- `operation`;
- the `validate` marker;
- `with`.

Each registration:

1. **Finds the operation**, by route or by `operationId`, and throws when
   there is none.
2. **Checks the registration**, and throws at startup when it is wrong:
   - the operation must not already have a route;
   - it must carry the `tag`;
   - its path must sit under the `prefix`;
   - the last argument must be the handler;
   - `routes.validate` may appear at most once;
   - the route must not be shadowed.
3. **Registers `[...before, validator, ...after, reply]`** with
   `app.on(METHOD, path)`. `before` is every middleware, or those in front
   of `routes.validate`. `path` is the Hono path minus the prefix.

**Shadowing.** A route is shadowed when a route registered earlier on the
same app, for the same method, has the same number of segments and matches
it segment for segment, where a `:param` matches anything. Hono tries
routes in registration order, so the later route would never run. The
engine keeps each app's routes in a `WeakMap` to check this.

## Validation

The validator reads each target and runs its validator from the table:
- **`param`** is `c.req.param()`.
- **`query`** reads each declared parameter: `c.req.queries()` for an
  exploded list, the one value split on commas for another list,
  `c.req.query()` otherwise.
- **`header`** reads each declared header, keyed lowercased, and splits a
  list on commas.
- **The body** is chosen by `Content-Type`: exact, then `type/*`, then
  `*/*`.
  - JSON is `c.req.text()` then `JSON.parse`, so a parse error is an
    `invalid_json` issue rather than an exception.
  - A form is `c.req.parseBody({ all: true })`, then `z<Operation>Form` for
    a flat form, the form's own `z<Name>` otherwise, or nothing when it has
    no schema.
  - Text is validated as read.
  - Binary is not read.

Hono caches the body under whichever reader ran first and converts it for
the others. This is why a middleware that already read it does not starve
the validator.

A target that passes goes to `c.req.addValidatedData(target, data)`, except
a text body, which Hono's `ValidationTargets` has no key for.
`c.req.valid()` is then Hono's own mechanism, typed by the route's `Input`.
Every target is checked before the validator answers, so one failure
carries every issue.

## Failures

`fail()` calls `onValidationError`:
- a `Response` it returns is sent;
- whatever it throws reaches `app.onError`;
- otherwise `validationErrorHandler` answers: 400 for a request, 500 for a
  reply.

The default answers directly, rather than throwing an `HTTPException`. An
app error handler that rebuilds the body from the error's message would
drop the issues.

With `validateResponses`, `reply` checks the handler's `Response`:
- the status must be declared;
- the `Content-Type` must be one of its media types, when it declares any;
- a JSON or text body is validated, on a clone.

The table holds exact statuses only: the IR drops `default` and `4XX`. An
operation declared only through those fails every reply as
`undeclared_status`, and its `Replies` entry is `Response`.

## Types

`HonoSpec` gathers `Operations`, `Replies` and the indexes. A route costs
TypeScript two index lookups and no conditional type:
- `S['routes'][`${M} ${P}`]` gives the `operationId`;
- `S['operations'][Id]` and `S['replies'][Id]` give the handler's `Input`
  and its return type.

A `Scope` narrows what `routes` offers:
- `Whole<S>` offers everything;
- `Tagged<S, Tag>` offers one tag's `operationId`s and paths, read from
  `OperationsByTag` and `PathsByTag`.

With `dates: 'date'`, a reply body that holds a date is `Wire<T>`, from
`types.ts`. Hono types `c.json(x)` as `JSONParsed<typeof x>`, where a
`Date` is a `string`, so a reply typed with `T` itself would match nothing.
`Wire<T>` is the only conditional type in a reply, and appears only where a
date does.

`ScopeOf` is the one conditional type of `routes`. It is evaluated once per `routes()`
call.

`routes[method]` takes `...chain: [...MiddlewareHandler[], RouteHandler]`.
A rest tuple with the handler last is enough for TypeScript to type `c`
from context, so there are no overloads per middleware count.

## Testing

`test/generate.ts` generates `@nxgt/openapi-codegen`'s fixture specs
(`split`, `query`, `kitchen-sink`, `dates`) with `hono: true` into
`test/generated/`, which git ignores; the `test` and `typecheck` scripts run
it first. The generator is reached through a tsconfig `paths` entry to its
source, not a dependency.

| What | Where | Checks |
| --- | --- | --- |
| routes | `src/engine.spec.ts` | the fixtures' routes on a real Hono app, through `app.request()`: validation, errors and hooks, QUERY, forms, reply checks, modules, registration mistakes |
| routes typing | `test/types/routes.ts` | what `routes` refuses: an undeclared status, a wrong body, a path without that method, an unknown `operationId`, a tag or a path outside the scope |
| routes cost | `src/perf.spec.ts` | `tsc --extendedDiagnostics` on 500 generated routes (`test/perf.ts`) stays under an instantiation budget |

The cost check is what holds the typing to a budget: a lookup that stops
being an index shows up there first.

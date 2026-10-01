# Linter

The linter warns when a spec strays from the conventions the library gives
it: a list that returns an array, a service without `@operationIds`, an error
reply without the envelope.

## Turn it on

Extend the ruleset in `tspconfig.yaml`, beside the emitter:

```yaml
# api/tspconfig.yaml
emit:
  - '@typespec/openapi3'
linter:
  extends:
    - '@nxgt/typespec/recommended'
options:
  '@typespec/openapi3':
    openapi-versions: ['3.1.0']
```

Nothing runs without it: importing `@nxgt/typespec` does not lint the spec.
Each rule is a warning, so `tsp compile` still emits:

```text
warning @nxgt/typespec/list-returns-page: listAll returns an array: return Page<Item> or CursorPage<Item>, which can carry a total or a next cursor.
```

`tsp compile api --warn-as-error` fails on any of them, for CI.

| Rule | Warns when |
| --- | --- |
| [`list-returns-page`](#list-returns-page) | a `list`, `search` or `query` returns an array |
| [`service-operation-ids`](#service-operation-ids) | a `@service` namespace has no `@operationIds` |
| [`error-body-shape`](#error-body-shape) | an error reply's body is not `status`, `message` and `timestamp` |

The library's own checks, such as `verb-method-mismatch` and
`duplicate-operation-id`, run whether or not the linter is on
([Operation ids](operation-ids.md)).

## `list-returns-page`

**Checks:** an operation whose name is `list`, `search` or `query`, alone or
followed by a capital letter (`listUsers`, `searchPosts`), with a success
reply whose body is an array. `listing` and `queryable` are not lists, and
are not checked. The name is checked as written, in an interface or not.

**Why:** an array cannot grow a `total` or a `nextCursor` later without
breaking every client. `Page<Item>` and `CursorPage<Item>` can, and they are
the pages `@nxgt/drizzle` and `@nxgt/mongo` return.

Fails:

```tsp
@route("/users")
interface Users {
  @get list(): User[];
}
```

```text
warning @nxgt/typespec/list-returns-page: list returns an array: return Page<Item> or CursorPage<Item>, which can carry a total or a next cursor.
```

Passes:

```tsp
@route("/users")
interface Users {
  @get list(...PageParameters): Page<User>;
  @get @route("/search") search(...CursorPageParameters): CursorPage<User>;
}
```

More on both pages in [Pagination](pagination.md).

## `service-operation-ids`

**Checks:** a `@service` namespace that is not marked with `@operationIds`,
neither itself nor a namespace around it.

**Why:** without it, the emitter names each operation after its interface,
`Users_list`, and the generated client's methods and types take that name.
`@operationIds` gives `listUsers` ([Operation ids](operation-ids.md)).

Fails:

```tsp
@service
namespace Shop {
  @route("/health") @get op health(): void;
}
```

```text
warning @nxgt/typespec/service-operation-ids: The service Shop has no @operationIds: its ids are the emitter's, such as Users_list. Mark the namespace with @operationIds.
```

Passes, marked on the service or on a namespace around it:

```tsp
@service
@operationIds
namespace Shop {
  @route("/health") @get op health(): void;
}

@operationIds
namespace Admin {
  @service
  namespace Billing {
    @route("/invoices") @get op invoices(): void;
  }
}
```

`@operationIds` on an interface alone does not count: the rule asks for the
namespace.

## `error-body-shape`

**Checks:** each reply of status 400 or above, of a range that starts at 400
or above (`5XX`), or of no status (`default`, an `@error` model without
`@statusCode`), that has a body. The body must be a model with a `status`, a
`message` and a `timestamp` property. A reply without a body passes, such as
`AuthenticationRequired`, `AccessDenied` or `ErrorWithoutBody<404>`.

**Why:** `@nxgt/openapi-hono` answers its own 400 and 500 with that envelope,
and a client written against it reads `message` from every error. A body of
another shape is one more case each client must handle.

Fails:

```tsp
model Teapot {
  @statusCode _: 418;
  @body body: { reason: string };
}

@route("/users")
interface Users {
  @post create(@body user: User): User | Teapot;
}
```

```text
warning @nxgt/typespec/error-body-shape: create answers 418 with a body that is not the nxgt envelope: declare BadRequest, NotFound or another of the library's errors, or a body that spreads or extends ErrorBody<Status>.
```

A range is named by its bounds, `500-599`, and a reply without a status as
`*`.

Passes: one of the library's errors, `ErrorResponse<Status>`, or a body that
spreads `ErrorBody<Status>` and adds its own fields:

```tsp
model TeapotBody {
  ...ErrorBody<418>;
  reason: string;
}

@error
model Teapot {
  @statusCode _: 418;
  @body body: TeapotBody;
}

@route("/users")
interface Users {
  @get @route("/{id}") get(@path id: uuid): User | NotFound | AuthenticationRequired;
  @post create(@body user: User): User | BadRequest | Teapot | ErrorResponse<503>;
}
```

The rule checks the property names, not their types. Each error is in
[Error replies](errors.md).

## Turn a rule off

For the whole spec, in `tspconfig.yaml`, with the reason:

```yaml
linter:
  extends:
    - '@nxgt/typespec/recommended'
  disable:
    '@nxgt/typespec/error-body-shape': 'the legacy routes answer their own errors'
```

For one operation or one namespace, a `#suppress` line above it:

```tsp
@route("/users")
interface Users {
  #suppress "@nxgt/typespec/list-returns-page" "a fixed set of ten"
  @get @route("/top") listTop(): User[];
}

#suppress "@nxgt/typespec/service-operation-ids" "its clients already call Health_check"
@service
namespace Health {
  @route("/health") @get op check(): void;
}
```

Or turn on only the rules you want, without the set:

```yaml
linter:
  enable:
    '@nxgt/typespec/list-returns-page': true
```

## A whole spec

The rules pass on a spec that uses the library throughout:

```tsp
// api/main.tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Shop" })
@operationIds
namespace Shop;

model User {
  @visibility(Lifecycle.Read) id: uuid;
  name: string;
}

@route("/users")
interface Users {
  @get list(...PageParameters): Page<User> | BadRequest;                            // listUsers
  @get @route("/search") search(...CursorPageParameters): CursorPage<User>;          // searchUsers
  @get @route("/{id}") get(@path id: uuid): User | NotFound | AuthenticationRequired; // getUser
  @post create(@body user: User): User | BadRequest | Conflict;                      // createUser
}
```

```sh
bunx --no-install tsp compile api --warn-as-error
```

The messages, with their fixes, are also in
[troubleshooting](../troubleshooting.md).

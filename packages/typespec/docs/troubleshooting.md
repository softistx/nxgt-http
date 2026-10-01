# Troubleshooting

## `schema ValidationErrorBody and schema ValidationErrorBody would both generate ValidationErrorBody`

**When:** the spec declares a schema named `ValidationErrorBody`, for
instance to describe the 400 with its `issues`.

**Why:** `@nxgt/openapi-codegen` declares `ValidationErrorBody` itself, on
every operation that takes a parameter or a body, and refuses two schemas of
one name with `name_collision`.

**Fix:** answer `BadRequest`. Its `BadRequestBody` carries the `issues`,
optional, and the generator adds its own 400 beside it.

```tsp
@patch updatePost(@path postId: string, @body post: MergePatchUpdate<Post>): Post | BadRequest;
```

## `Couldn't resolve import "@nxgt/typespec"`

**When:** `tsp compile` runs on a spec that imports the library.

**Why:** the library is not installed where the spec is, or the project has
no `package.json` to resolve it from.

**Fix:** install it and its peers next to the spec's project, as
devDependencies, with the command in the
[README's Install section](../README.md#install).

## `Duplicate type name: 'NotFoundBody'`

**When:** `tsp compile` runs on a spec that declares its own model named like
one of the library's: `BadRequestBody` … `InternalServerErrorBody`,
`ValidationIssue`, `ValidationTarget`, `Uuid` or `Email` when the spec uses
`uuid` or `email`, or the page of one of its models,
such as `PostPage` beside `Page<Post>`, or `CommentCursorPage` beside
`CursorPage<Comment>`.

```text
error @typespec/openapi/duplicate-type-name: Duplicate type name: 'NotFoundBody'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.
```

**Why:** the library names its schemas with `@friendlyName`, without a
namespace, so they share the spec's schema names.

**Fix:** reuse the library's model, or rename yours:

```tsp
@get getPost(@path postId: string): Post | NotFound;
```

## `Two operations are named listPets: an OpenAPI operation id must be unique`

**When:** `tsp compile` runs on a spec where an operation that
`@operationIds` names has the id of another operation of the same service
(two `@service` namespaces are two documents, and may reuse a name):

- a verb and the id it gives are both in one interface: `list` and
  `listUsers` in `Users` are both `listUsers`;
- one name is in two interfaces of one name, or a name that is not a verb in
  two interfaces: `Store.Pets` and `Shelter.Pets` both give `listPets`,
  whether they declare `list` or `listPets`;
- an interface `extends` another, and so copies names that are not verbs:
  `Drafts extends Posts` gives a second `getPost`, and two interfaces
  extending one template share every such name;
- an `@operationId` written on another operation is a name `@operationIds`
  gives;
- an unmarked operation declared in the service namespace, which the
  emitter names after itself, has a marked operation's name: `op listPets()`
  beside `Pets.listPets`.

```text
error @nxgt/typespec/duplicate-operation-id: Two operations are named listPets: an OpenAPI operation id must be unique.
```

**Why:** `@operationIds` makes each operation's id its name, as written, or
a verb with its interface's resource, without its namespace. `@typespec/openapi3` would emit both
ids without a word, and the generator would then refuse the spec.

**Fix:** give each operation a name of its own. In one interface, keep the
verb or the full name, not both:

```tsp
@route("/users")
interface Users {
  @get list(): User[]; // listUsers
  @get @route("/active") findActiveUsers(): User[]; // findActiveUsers
}
```

Name the operations of an interface others extend with verbs, so each takes
its own resource (`get` is `getPost` in `Posts`, `getDraft` in
`Drafts extends Posts`), or declare distinct operations rather than
extending:

```tsp
@route("/posts")
interface Posts {
  @get getPost(@path postId: uuid): Post | NotFound;
}

@route("/drafts")
interface Drafts {
  @get getDraft(@path draftId: uuid): Post | NotFound;
}
```

Or give one of them its own `@operationId`; an inherited operation takes one
by being declared again in the interface that extends
([Operation ids](guide/operation-ids.md#two-operations-named-alike)):

```tsp
import "@typespec/openapi";

using OpenAPI;

@route("/drafts")
interface Drafts extends Posts {
  @get @operationId("getDraft") getPost(@path postId: uuid): Post | NotFound;
}
```

## `` `singular` and `plural` name an interface's resource: a namespace has none ``

**When:** `tsp compile` runs on a spec that gives `@operationIds` on a
namespace a `singular` or a `plural`:

```tsp
@service
@operationIds(#{ singular: "User" })
namespace Shop;
```

```text
error @nxgt/typespec/resource-name-on-namespace: `singular` and `plural` name an interface's resource: a namespace has none. Put them on the interface.
```

**Why:** the resource a verb takes is an interface's: `list` in `Users` is
`listUsers`. A namespace holds many interfaces, so one name for all of them
would give each the same ids.

**Fix:** keep the namespace's `verbs`, and name the resource on the
interface whose name the rule gets wrong
([Operation ids](guide/operation-ids.md#the-resource)):

```tsp
@service
@operationIds
namespace Shop;

@route("/staff")
@operationIds(#{ singular: "Member" })
interface Staff {
  @post create(): Member; // createMember
}
```

## `Argument of type '{ verbs: … }' is not assignable to parameter of type 'Nxgt.OperationIdsOptions'`

**When:** `tsp compile` runs on a spec whose `@operationIds` gives a verb
something other than `"singular"` or `"plural"`:

```tsp
@service
@operationIds(#{ verbs: #{ archive: "bogus" } })
namespace Shop;
```

```text
error invalid-argument: Argument of type '{ verbs: { archive: "bogus" } }' is not assignable to parameter of type 'Nxgt.OperationIdsOptions'
```

**Why:** a verb only says which name of the resource follows it: the
singular, `archiveUser`, or the plural, `archiveUsers`.

**Fix:** give each verb `"singular"` or `"plural"`
([Operation ids](guide/operation-ids.md)):

```tsp
@service
@operationIds(#{ verbs: #{ archive: "singular" } })
namespace Shop;
```

## `findById is sent with POST, where its verb find is sent with GET or HEAD`

**When:** a warning: an operation `@operationIds` names after one of the
library's verbs, in an interface, alone or before `By…`, is sent with a
method that verb does not name. The method may be implicit: an operation
without `@get` or `@post` that has a body is a `POST`.

```tsp
@route("/users")
interface Users {
  @route("/find") findById(@body id: uuid): User;
}
```

```text
warning @nxgt/typespec/verb-method-mismatch: findById is sent with POST, where its verb find is sent with GET or HEAD. Give it that method, or a name that is not a verb.
```

**Why:** the verb and the method say the same thing twice, and here they
disagree: `find` is a read, and a `POST` tells a cache, a proxy or a retry
it is not safe. Each verb's methods are in
[Operation ids](guide/operation-ids.md#verbs-and-methods).

**Fix:** give it the verb's method:

```tsp
@get @route("/{id}") findById(@path id: uuid): User; // findUserById
```

Or a name that is not a verb, which is its id as written:

```tsp
@post @route("/find") lookUpUser(@body id: uuid): User; // lookUpUser
```

Or, when the route cannot change, its own `@operationId`, which keeps the
id it had and is not checked:

```tsp
@post @route("/find") @operationId("findById") findById(@body id: uuid): User;
```

Or silence that one operation with a reason:

```tsp
#suppress "@nxgt/typespec/verb-method-mismatch" "an older client posts its lookups"
@post @route("/find") findById(@body id: uuid): User;
```

## `declares a reply without a body and one with a body of status …`

**When:** an operation declares, for one status, a reply without a body and
one with a body, such as the guard's 401 and the handler's:

```tsp
@get listPosts(): Post[] | AuthenticationRequired | Unauthorized;
```

```text
error @nxgt/typespec/duplicate-status-reply: listPosts declares a reply without a body and one with a body of status 401: the emitter merges them into one, and the reply without a body is lost. Declare the one the route sends.
```

**Why:** OpenAPI has one reply per status. `@typespec/openapi3` merges the two
without a warning: the 401 keeps the envelope, and a client never learns the
guard's reply has no body.

**Fix:** declare the one the route sends. A route behind a
`@nxgt/janus-hono` guard sends `AuthenticationRequired`; a handler that
answers with the envelope, `Unauthorized`:

```tsp
@get listPosts(): Post[] | AuthenticationRequired;
```

## `declares two replies with a body of status …`

**When:** a warning: an operation declares two replies with a body for one
status code, such as the idempotent write's 409 beside the optimistic
lock's, or its 422, `IdempotencyKeyReused`, beside `UnprocessableEntity`:

```tsp
@post createPost(@body post: Post): Post | IdempotencyInProgress | Conflict;
```

```text
warning @nxgt/typespec/merged-status-reply: createPost declares two replies with a body of status 409: the emitter merges their bodies under the first one's description. Declare the one the route sends.
```

**Why:** `@typespec/openapi3` keeps both bodies, as one reply whose body is
either, under the first one's description: the second's is gone, and a
header either reply declares required becomes optional.

**Fix:** declare the one the route sends. Both carry the envelope, and the
`message` key tells them apart:

```tsp
@post createPost(@body post: Post): Post | IdempotencyInProgress;
```

An alias can hide the duplicate: `CreateErrors` holds a `Conflict`, so
`Post | CreateErrors | IdempotencyInProgress` declares two 409s, and
`UpdateErrors | NotFound` two 404s. Spell the alias's other errors out
instead:

```tsp
@post createPost(@body post: Post): Post | BadRequest | IdempotencyInProgress;
```

Two plain bodies, `Post | Draft`, are one reply whose body is either; two
`@error` models without a `@statusCode` share `default`, and one
description; bodies of different content types are negotiated. All three
pass.

## `Unknown decorator @operationId`

**When:** a spec writes `@operationId` next to `@operationIds`.

**Why:** `@operationIds` comes from `@nxgt/typespec`, but `@operationId`
comes from `@typespec/openapi`, which the file does not import.

**Fix:** import it in that file:

```tsp
import "@typespec/openapi";

using OpenAPI;
```

## `unsupported_version` from the generator

**When:** you generate from what `tsp compile` emitted.

**Why:** `@typespec/openapi3` emits OpenAPI 3.0 by default.

**Fix:** in `tspconfig.yaml`, set `openapi-versions: ['3.1.0']` or
`['3.2.0']` under the `@typespec/openapi3` options.

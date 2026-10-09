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
@patch patchPost(@path postId: string, @body post: PatchRequest<Post>): Post | BadRequest;
```

## `Couldn't resolve import "@nxgt/typespec"`

**When:** `tsp compile` runs on a spec that imports the library.

**Why:** the library is not installed where the spec is, or the project has
no `package.json` to resolve it from.

**Fix:** install it and its peers next to the spec's project, as
devDependencies, with the command in the
[README's Install section](../README.md#install).

## `init-template-invalid-json: Unable to parse …/scaffolding.json: Unexpected token … is not valid JSON`

**When:** `tsp init` with the package's template, before it writes anything.

```text
error init-template-invalid-json: Unable to parse https://unpkg.com/@nxgt/typespec@0.8.0/templates/scaffolding.json: Unexpected token 'N', "Not found:"... is not valid JSON. Check that the template URL is correct.
```

**Why:** the URL names no template, so unpkg answers a page of text, `Not
found: …` or `Package version not found: …`, which `tsp init` cannot parse.
The template ships from 0.9.0 on: a version before it in the URL, a version
that is not published, or a typo in the path all answer that page.

**Fix:** drop the version, or name 0.9.0 or later, and keep the path as it is:

```sh
npm view @nxgt/typespec version   # 0.9.0 or later
npx --package=@typespec/compiler tsp init https://unpkg.com/@nxgt/typespec/templates/scaffolding.json
```

## `init-template-download-failed: Failed to download template from …: fetch failed`

**When:** `tsp init` with the package's template, before it writes anything.

```text
error init-template-download-failed: Failed to download template from https://unpkg.com/@nxgt/typespec/templates/scaffolding.json: fetch failed. Check that the template URL is correct.
```

**Why:** `tsp init` could not reach the host: no network, a firewall or
proxy in the way, or a host name mistyped. Nothing answered, unlike the entry
above, where unpkg answers a page that is not the template.

**Fix:** check that the host answers from that machine, then run `tsp init`
again:

```sh
curl -fsSI https://unpkg.com/@nxgt/typespec/templates/scaffolding.json
```

## `env: 'bun': No such file or directory`

**When:** `nxgt-openapi generate` runs, through `npx`, an npm script such as
the template's `api`, or a CI step, on a machine without Bun. A shell in
another locale quotes it `‘bun’`; macOS prints `env: bun: No such file or
directory`. The exit code is 127.

**Why:** `@nxgt/openapi-codegen`'s CLI, `nxgt-openapi`, runs on
[Bun](https://bun.sh): its first line is `#!/usr/bin/env bun`. `npx` and
`npm run` find the script, then the system looks for `bun` to run it.
`tsp compile` runs on Node and is not affected.

**Fix:** install Bun, and make sure `bun` is on the PATH of the shell or the
CI job that runs the generator:

```sh
curl -fsSL https://bun.sh/install | bash
bunx nxgt-openapi generate
```

In GitHub Actions, add `oven-sh/setup-bun@v2` before the step.

## `Duplicate type name: 'NotFoundBody'`

**When:** `tsp compile` runs on a spec that declares its own model named like
one of the library's: `BadRequestBody` … `InternalServerErrorBody`,
`ValidationIssue`, `ValidationTarget`, `UUID` or `EmailAddress` when the spec
uses `uuid` or `email` (or any other scalar, under its GraphQL name: `Latitude`,
`Currency`), or the page of one of its models,
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

## `list is marked @queryMethod and sent with GET: a QUERY is sent as a POST until @typespec/http declares it. Make it a @post.`

**When:** an error, `query-method-not-post`: an operation marked
`@queryMethod` is sent with a method other than `POST`. The method may be
implicit, `@get` or none.

```tsp
@route("/users")
interface Users {
  @get @queryMethod list(): string[];
}
```

**Why:** `@queryMethod` stands for a `QUERY` sent as a `POST`, because
`@typespec/http` declares no `QUERY`; on a `GET`, a `PUT` or a `DELETE` it
has nothing to stand for.

**Fix:** make it a `@post`, with the criteria in the body:

```tsp
@post @queryMethod @route("/search") search(@body names: string[]): string[];
```

Or drop `@queryMethod`: a `GET` needs no mark. More, in
[Operation ids](guide/operation-ids.md#a-query-sent-as-a-post).

## `findById is sent with QUERY, where its verb find is sent with GET or HEAD`

**When:** a warning, `verb-method-mismatch`: an operation named after one of
the library's verbs other than `search` and `query` is marked `@queryMethod`.

**Why:** a marked `POST` is checked as the `QUERY` it is, and only `search`
and `query` are sent with `QUERY`.

**Fix:** name it `search` or `query`, a name that is not a verb, or take off
`@queryMethod` and give the verb its own method, as in the entry on
[`findById is sent with POST`](#findbyid-is-sent-with-post-where-its-verb-find-is-sent-with-get-or-head).

```tsp
@post @queryMethod @route("/search") searchByName(@body names: string[]): User[]; // searchUserByName
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

## `returns an array: return Page<Item> or CursorPage<Item>`

**When:** a warning, with the ruleset `@nxgt/typespec/recommended` on: an
operation named `list`, `search` or `query`, alone or before a capital
letter, has a success reply whose body is an array.

```tsp
@route("/users")
interface Users {
  @get list(): User[];
}
```

```text
warning @nxgt/typespec/list-returns-page: list returns an array: return Page<Item> or CursorPage<Item>, which can carry a total or a next cursor.
```

**Why:** an array cannot grow a `total` or a `nextCursor` later without
breaking its clients. A page can.

**Fix:** return a page ([Pagination](guide/pagination.md)):

```tsp
@get list(...PageParameters): Page<User>;
```

Or, for a list that will never page, silence that one operation:

```tsp
#suppress "@nxgt/typespec/list-returns-page" "a fixed set of ten"
@get @route("/top") listTop(): User[];
```

## `The service … has no @operationIds: its ids are the emitter's, such as Users_list`

**When:** a warning, with the ruleset `@nxgt/typespec/recommended` on: a
`@service` namespace is not marked with `@operationIds`, neither itself nor
a namespace around it. `@operationIds` on its interfaces alone does not
count.

```tsp
@service
namespace Shop {
  @route("/health") @get op health(): void;
}
```

```text
warning @nxgt/typespec/service-operation-ids: The service Shop has no @operationIds: its ids are the emitter's, such as Users_list. Mark the namespace with @operationIds.
```

**Why:** the emitter names each operation after its interface,
`Users_list`, and the generated client's methods and types take that name.

**Fix:** mark the namespace ([Operation ids](guide/operation-ids.md)):

```tsp
@service
@operationIds
namespace Shop {
  @route("/health") @get op health(): void;
}
```

Marking an existing service renames its operations, and the generated
client's methods with them. To keep the old ids, silence the rule on that
namespace:

```tsp
#suppress "@nxgt/typespec/service-operation-ids" "its clients already call Health_check"
@service
namespace Health {
  @route("/health") @get op check(): void;
}
```

## `answers … with a body that is not the nxgt envelope`

**When:** a warning, with the ruleset `@nxgt/typespec/recommended` on: a
reply of status 400 or above, of a range from 400 up, or `default` (an
`@error` model without `@statusCode`) has a body that is not a model with
`status`, `message` and `timestamp`.

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

A range is named `500-599`, and `default` `*`.

**Why:** `@nxgt/openapi-hono` answers its own 400 and 500 with the envelope,
and a client reads `message` from every error. Another shape is one more
case for each client.

**Fix:** declare one of the library's errors, `ErrorResponse<Status>`, or a
body that spreads or extends `ErrorBody<Status>` ([Error replies](guide/errors.md)):

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
```

A reply without a body, such as `AuthenticationRequired`, passes. For a
spec whose errors have another shape on purpose, turn the rule off in
`tspconfig.yaml` ([Linter](guide/linter.md#turn-a-rule-off)):

```yaml
linter:
  extends:
    - '@nxgt/typespec/recommended'
  disable:
    '@nxgt/typespec/error-body-shape': 'the legacy routes answer their own errors'
```

## `@typespec/openapi3/invalid-model-property: 'Operation' cannot be specified as a model property.`

**When:** `tsp compile` runs on a spec that has `using Nxgt` and declares, in
its own namespace, something named like a scalar (`locale`, `date`, `time`,
`port`, `hostname`…) and also uses the scalar of that name.

```tsp
using Nxgt;

@get op locale(): string;
model Page { language: locale; }
```

```text
error @typespec/openapi3/invalid-model-property: 'Operation' cannot be specified as a model property.
```

**Why:** a declaration of the spec's own namespace shadows what `using Nxgt`
brings in, without a word. With an operation the name resolves to the
operation, and the emitter refuses it. With a model, `model date { … }` and
`day: date`, the property silently gets the model, a `$ref` to `date` where
`Date` was meant.

**Fix:** write the scalar with its namespace, or rename your declaration:

```tsp
model Page { language: Nxgt.locale; }
```

## `` A value the GraphQL scalar refuses is accepted: `ZZ`, `ZZZ`, `Mars/Olympus`, a bad IBAN checksum ``

**When:** a request carries a value that `@nxgt/graphql-scalars` refuses but
the generated validator accepts and answers `2xx`: a country code that is not
assigned (`ZZ`), a currency (`ZZZ`), an IBAN with a wrong checksum, an ISBN
with a wrong check digit, a time zone (`Mars/Olympus`) or a locale that is not
in the registry, a JWT whose segments are not a token, an `Emoji` that is not
one.

**Why:** the scalar's pattern checks the shape. A list (`countryCode`,
`currency`, `timeZone`, `locale`) or a checksum (`iban`, ISBN) does not fit in
a pattern. `x-nxgt-scalar` names the exact rule, but `@nxgt/openapi-codegen`
does not map it to the `@nxgt/zod` schema yet ([roadmap](roadmap.md)).

**Fix:** until it does, check the value in the handler against the exact
rule, the list or the checksum, from `@nxgt/zod` or your own table, and answer
`400` as the generated validator does:

```ts
if (!knownCountries.has(body.country)) {
	return c.json({ status: 400, message: 'Unknown country code' }, 400);
}
```

## `An integer scalar accepts -0`

**When:** a body carries `-0` for `positiveInt`, `nonNegativeInt`, `port`,
`safeInt` and the other integer scalars, and the validator lets it through
where `@nxgt/graphql-scalars` refuses it.

**Why:** `-0` is a JSON number equal to `0`, which no JSON Schema keyword can
tell from `0`. For `nonNegativeInt`, `nonPositiveInt`, `port`, the bound holds,
so the value passes (`positiveInt` and `negativeInt` refuse it by their bound).

**Fix:** normalise in the handler when the sign matters:

```ts
const quantity = Object.is(body.quantity, -0) ? 0 : body.quantity;
```

## `UUID`, `EmailAddress`: generated `Uuid` and `Email` are gone, and an id is answered 400

**When:** after upgrading to 0.10.0, the generated code no longer exports
`Uuid`, `zUuid`, `Email` or `zEmail` (`Module has no exported member 'Uuid'`),
or a request whose id was accepted before is answered `400`.

**Why:** the schemas follow `@nxgt/graphql-scalars`' names, `UUID` and
`EmailAddress`, and `uuid` takes its rule: an RFC 9562 version 1 to 8 with the
RFC variant, or the nil or max UUID. An id of no known version
(`…-91d4-…`) is refused.

**Fix:** rename the imports. For an id that is a shape only, write `guid`
instead of `uuid`:

```ts
import { type UUID, zUUID, type EmailAddress, zEmailAddress } from './generated';
```

```tsp
model Legacy { id: guid; }
```

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

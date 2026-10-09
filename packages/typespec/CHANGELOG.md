# @nxgt/typespec

## 0.12.0

### Minor Changes

- [#126](https://github.com/softistx/nxgt-http/pull/126) [`ff7922f`](https://github.com/softistx/nxgt-http/commit/ff7922f0ab9055b481d7e44d07689d9fe42f3677) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/typespec`: add `@queryMethod`, which marks a `@post` as an HTTP `QUERY`, a safe request with a body, until `@typespec/http` declares the method. It stays a `POST` on the wire and the document gets `x-nxgt-method: query`; `@operationIds` checks its verb as a `QUERY`'s, so `search` and `query` accept it; on anything but a `@post` it is the error `query-method-not-post`.
  
  `@nxgt/openapi-codegen`: read `x-nxgt-method: query` on a `POST` as a `QUERY` sent as a `POST`: its entry in the generated `operations` table has `queryMethod: true`, typed `readonly queryMethod?: true` on `OperationSpec`. With another value, on another method, or on an OpenAPI 3.2 `query` operation, which is a `QUERY` already, it is ignored with the warning `ignored`.

## 0.11.0

### Minor Changes

- [#123](https://github.com/softistx/nxgt-http/pull/123) [`6d29072`](https://github.com/softistx/nxgt-http/commit/6d29072e3969dc5691acbce0ebc47f7ea82589bb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `CreateRequest<T>`, `UpdateRequest<T>` and `PatchRequest<T>`: TypeSpec's `Create`, `Update` and `MergePatchUpdate`, named `Create<T>Request`, `Update<T>Request` and `Patch<T>Request`. The `tsp init` template now uses all three: `update` replaces a user with a `PUT`, `patch` changes some of it with a merge patch.

## 0.10.0

### Minor Changes

- [#120](https://github.com/softistx/nxgt-http/pull/120) [`9375c00`](https://github.com/softistx/nxgt-http/commit/9375c00ff8fc8f855ed6200f53faf580022305a0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The scalars of `@nxgt/graphql-scalars`, under the same names: each one emits an OpenAPI component named as in GraphQL, a `format`, a pattern or bounds approximating the rule, and `x-nxgt-scalar`. See the scalars guide.
  
  Breaking: `uuid` emits the component `UUID`, not `Uuid`, and refuses a UUID of no known version (write `guid` for the shape only). `email` is now an alias of `emailAddress` and emits `EmailAddress`, not `Email`.

## 0.9.2

### Patch Changes

- [#99](https://github.com/softistx/nxgt-http/pull/99) [`6611e89`](https://github.com/softistx/nxgt-http/commit/6611e8918a93567a48d00ccea41ae6b134b37131) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accept TypeScript 7: the `typescript` peer is `^6.0.3 || ^7.0.0`, as in every `@nxgt` package of this repository, so a project on TypeScript 7.0 installs without an incorrect-peer warning.

## 0.9.1

### Patch Changes

- [#91](https://github.com/softistx/nxgt-http/pull/91) [`12c74d5`](https://github.com/softistx/nxgt-http/commit/12c74d5e5633ac28977e16d82523cb685c70d4bc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `IdempotencyInProgress` and `IdempotencyKeyReused` are declared in `lib/errors.tsp`, beside the library's other error replies, instead of `lib/headers.tsp`. Their names, namespace and emitted OpenAPI are unchanged.

## 0.9.0

### Minor Changes

- [#89](https://github.com/softistx/nxgt-http/pull/89) [`4eeeaa6`](https://github.com/softistx/nxgt-http/commit/4eeeaa6094aa618f18a18f42f5725c7fa68a716a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A `tsp init` template: `npx --package=@typespec/compiler tsp init https://unpkg.com/@nxgt/typespec/templates/scaffolding.json` starts a project with `@service` and `@operationIds`, a `Users` interface (a paged, sorted list, get, create, update and delete, with their error aliases), the linter's recommended rules in `tspconfig.yaml`, OpenAPI 3.1 written to `openapi/openapi.yaml`, and an `openapi-codegen.config.ts` for `nxgt-openapi generate`.

## 0.8.0

### Minor Changes

- [#87](https://github.com/softistx/nxgt-http/pull/87) [`04d6b6f`](https://github.com/softistx/nxgt-http/commit/04d6b6facfe480087e877be933870fb6e534cd5b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A linter, with the ruleset `@nxgt/typespec/recommended` a spec extends in its `tspconfig.yaml` (`linter: extends: ["@nxgt/typespec/recommended"]`). Its rules are warnings, each one a spec can disable: `list-returns-page` (a `list`, `search` or `query` returns `Page<Item>` or `CursorPage<Item>`, not an array), `service-operation-ids` (a `@service` namespace has `@operationIds`), and `error-body-shape` (an error reply's body is the nxgt envelope, `status`, `message` and `timestamp`). Nothing runs unless the spec extends the set.

## 0.7.0

### Minor Changes

- [#85](https://github.com/softistx/nxgt-http/pull/85) [`6569379`](https://github.com/softistx/nxgt-http/commit/656937915b489dd85513f1bf56ffad05f2227b0d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Error aliases by verb, so an operation declares its usual errors in one name: `ListErrors` (`BadRequest`), `GetErrors` (`NotFound`), `CreateErrors` (`BadRequest | Conflict`), `UpdateErrors` (`BadRequest | NotFound | Conflict`), `DeleteErrors` (`NotFound`), and `AuthErrors` (`Unauthorized | Forbidden`). `get(@path id: uuid): User | GetErrors` emits what `User | NotFound` did.

## 0.6.1

### Patch Changes

- [#83](https://github.com/softistx/nxgt-http/pull/83) [`75a4f29`](https://github.com/softistx/nxgt-http/commit/75a4f29a48884d1313085eed12cef53a846c54aa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists the verb methods and the `query` verb under Shipped, in 0.6.0.

## 0.6.0

### Minor Changes

- [#81](https://github.com/softistx/nxgt-http/pull/81) [`cb08def`](https://github.com/softistx/nxgt-http/commit/cb08def02952691206f52cbe0babd7b906de5c91) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@operationIds` warns, with `verb-method-mismatch`, when an operation named after one of the library's verbs is sent with a method that verb does not name: `list`, `read`, `find`, `count` and `get` with `GET` or `HEAD`; `search` and `query` with `GET` or `POST`; `create` and `createMany` with `POST`; `update` and `updateMany` with `PUT` or `PATCH`; `patch` with `PATCH`; `replace` and `upsert` with `PUT`; `delete` with `DELETE`, and `deleteMany` with `DELETE` or `POST`. A `By…` name takes its verb's methods. `#suppress "@nxgt/typespec/verb-method-mismatch"` silences one operation.
  
  `query` is a new plural verb: `query` in `Users` is `queryUsers`. An operation already named `query`, or `queryBy…` (`queryByTeam` → `queryUserByTeam`), in a marked interface gets a new id; give it an `@operationId` to keep the old one.

## 0.5.1

### Patch Changes

- [#79](https://github.com/softistx/nxgt-http/pull/79) [`929e181`](https://github.com/softistx/nxgt-http/commit/929e181589a10c019771b60b538cbbf0b284dd29) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists verbs in operation ids under Shipped, in 0.5.0.

## 0.5.0

### Minor Changes

- [#77](https://github.com/softistx/nxgt-http/pull/77) [`7b308eb`](https://github.com/softistx/nxgt-http/commit/7b308eb1bbb64cbfa50362e316197fabfcb80691) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@operationIds` completes a known verb with the interface's resource: in `interface Users`, `list` is `listUsers`, `create` is `createUser`, and `findById` is `findUserById`. The plural verbs are `list`, `read`, `find`, `search`, `count`, `createMany`, `updateMany` and `deleteMany`. The singular verbs are `get`, `create`, `update`, `patch`, `replace`, `upsert` and `delete`. Any verb followed by `By…` takes the singular before `By`, or the plural after a `*Many` verb: `deleteManyByTeam` is `deleteManyUsersByTeam`.
  
  The resource's plural is the interface's name, and its singular comes from a short English rule (`Categories` → `Category`, `People` → `Person`). `@operationIds(#{ singular: "Member" })` names an interface's own resource, never one extending it, and `#{ verbs: #{ archive: "singular" } }` adds verbs, on an interface or a namespace. Any other name, and any operation outside an interface, keeps its id as written.
  
  An operation of a marked interface named exactly a verb (`list`, `create`), or a verb followed by `By…` (`findById` → `findUserById`), gets a new id: give it an `@operationId` to keep the old one. An interface declaring both `list` and `listUsers` now names two operations `listUsers`, which is an error.

## 0.4.1

### Patch Changes

- [#75](https://github.com/softistx/nxgt-http/pull/75) [`a04c9bc`](https://github.com/softistx/nxgt-http/commit/a04c9bc55deb5b56c64480634cc87f8405a4f4b0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists operation ids as written and the removal of `Resource` under Shipped, in 0.4.0.

## 0.4.0

### Minor Changes

- [#73](https://github.com/softistx/nxgt-http/pull/73) [`cd64ea2`](https://github.com/softistx/nxgt-http/commit/cd64ea229decc3596986e7a756dd063a4aff0cba) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@operationIds` now names each operation exactly as written: `@get findPostComments()` is `findPostComments`, where it used to be `<operation><Interface>`. It goes on an interface, or on a namespace to cover every operation in it, however deep; an operation's own `@operationId` still wins. Rename the operations of a marked interface to the ids the client should have, such as `list` to `listPosts`. Ids must be unique per service, not per program: two `@service` namespaces may each have a `health`. An operation template's instances are never named, only the operations declared from them.
  
  The `Resource` template is removed: write a resource's operations by hand, each with its own name. `SortParameters` stays, for the sort of a list.

## 0.3.0

### Minor Changes

- [#71](https://github.com/softistx/nxgt-http/pull/71) [`70ee218`](https://github.com/softistx/nxgt-http/commit/70ee21898b1cae9ecdcd9026183304a113207b13) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Name `Resource`'s item operations after the item: `readPost`, `createPost`, `updatePost` and `deletePost`, with `list` still named after the interface, `listPosts`. The item's name is its `@friendlyName`, if it has one. An item without a name of its own, anonymous or a template instance such as `Draft<Author>`, and an operation the extending interface declares again, keep the interface's name: `readDrafts`. This renames the generated client's methods and their types' prefix, from `readPosts` to `readPost`. Two resources of one item now share those ids, which is a `duplicate-operation-id` error: give the second its own `@operationId`s.

## 0.2.0

### Minor Changes

- [#69](https://github.com/softistx/nxgt-http/pull/69) [`2b4f64d`](https://github.com/softistx/nxgt-http/commit/2b4f64d2e0fefa7409f453ce8b34c7fecbd58a78) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Check that each status has one reply. `@typespec/openapi3` merges two replies of one status without a warning: a reply without a body beside one with a body, such as `AuthenticationRequired` beside `Unauthorized`, is lost, and is now an error, `duplicate-status-reply`. Two replies with a body of one status code, such as `Conflict` beside `IdempotencyInProgress`, are merged under the first one's description, and now warned of, `merged-status-reply`. Plain body unions, bodies of different content types and `@error` models without a `@statusCode` still pass.

## 0.1.0

### Minor Changes

- [#64](https://github.com/softistx/nxgt-http/pull/64) [`dfa2929`](https://github.com/softistx/nxgt-http/commit/dfa29290f1712a59965998a51935519772b01957) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add authentication, as `@nxgt/janus` serves it: `JanusAuth` for `@useAuth`, which accepts `Authorization: Bearer` (`BearerAuth`), the `X-Session-Token` header (`SessionTokenAuth`) or the `janus-session` cookie (`SessionCookieAuth`), and the janus guards' replies without a body, `AuthenticationRequired` (401), `AccessDenied` (403) and `ErrorWithoutBody<Status>`.

- [#61](https://github.com/softistx/nxgt-http/pull/61) [`4e0da5b`](https://github.com/softistx/nxgt-http/commit/4e0da5b913faccf8ed81d0c4eb7a51975afb1c59) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@nxgt/typespec`, nxgt's HTTP conventions as a TypeSpec library, starting with the error replies: `ErrorBody<Status>`, the envelope `@nxgt/openapi-hono` sends (`status`, an i18n-key `message`, `timestamp`), and the responses `BadRequest` (with the validators' `issues`, optional), `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `UnprocessableEntity`, `TooManyRequests`, `InternalServerError` and `ErrorResponse<Status>`.

- [#66](https://github.com/softistx/nxgt-http/pull/66) [`2fa0f9f`](https://github.com/softistx/nxgt-http/commit/2fa0f9f63db7d60c4085120f52242207def84a79) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the headers of an idempotent write and of a rate limit: `IdempotencyKeyHeader` (`Idempotency-Key`, 1 to 255 characters, checked), `IdempotentReplayedHeader`, `RateLimitHeaders` (`RateLimit-Limit`, `-Remaining`, `-Reset`), `RetryAfterHeader`, and the replies `IdempotencyInProgress` (409) and `IdempotencyKeyReused` (422). `TooManyRequests` now carries the `RateLimit-*` headers and `Retry-After`.

- [#62](https://github.com/softistx/nxgt-http/pull/62) [`08946dd`](https://github.com/softistx/nxgt-http/commit/08946dde9f8460a7c18be988cc37ec3e208c14aa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@operationIds`: on an interface, it names each operation `<operation><Interface>` (`listPosts` instead of `Posts_list`), unless the operation has its own `@operationId`, and refuses two operations named alike with `duplicate-operation-id`. `@typespec/openapi` becomes a peer dependency.

- [#63](https://github.com/softistx/nxgt-http/pull/63) [`2d501ff`](https://github.com/softistx/nxgt-http/commit/2d501ffa502eef4adcb4df8597b78ff91742335e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add pagination, as `@nxgt/drizzle` and `@nxgt/mongo` page: `PageParameters` (the query `page`, 1-based, and `pageSize`, both at least 1, defaulting to 1 and 20) and `Page<Item>` (`{ items, total, page, pageSize, pageCount }`, the schema `<Item>Page`) for an offset page; `CursorPageParameters` (`after`, and `limit` defaulting to 20) and `CursorPage<Item>` (`{ items, nextCursor: string | null }`, the schema `<Item>CursorPage`) for a cursor page.

- [#67](https://github.com/softistx/nxgt-http/pull/67) [`099b2ae`](https://github.com/softistx/nxgt-http/commit/099b2ae21c47bbf1b985d6090e9b9bf11a0dd171) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `Resource<Item, Filters = {}, SortField = "id", Id = uuid>`, an interface template with the five operations of a resource (`list`, paged by offset with the spec's typed filters and a sort; `read`; `create`; `update`, a merge patch; `delete`), named by `@operationIds`, and `SortParameters<Field>`: the query `orderBy`, one of the fields named, and `direction`, `asc` or `desc`, as `@nxgt/drizzle` sorts.

- [#65](https://github.com/softistx/nxgt-http/pull/65) [`07f14bf`](https://github.com/softistx/nxgt-http/commit/07f14bfebee64e69193d0353755278b213c6b2d2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the scalars `uuid` (the schema `Uuid`, `format: uuid`) and `email` (the schema `Email`, `format: email`), and the columns `@nxgt/drizzle` stamps a row with, as models to spread: `Timestamps` (`createdAt`, `updatedAt`), `SoftDelete` (`deletedAt`), `Versioned` (`version`, sent back in an update) and `Actors<Id = uuid>` (`createdBy`, `updatedBy`, `deletedBy`), read-only except `version`.

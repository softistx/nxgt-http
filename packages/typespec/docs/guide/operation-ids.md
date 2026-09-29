# Operation ids

An OpenAPI operation id is what `@nxgt/openapi-codegen` names everything
after: the client's method, the `operations` entry, and the prefix of the
operation's types (`ListPostsQuery`, `zGetPostParam`).

## What TypeSpec does alone

Without an `@operationId`, `@typespec/openapi3` names an operation after its
interface and its method, joined by `_`:

```tsp
@route("/posts")
interface Posts {
  @get list(@query status?: PostStatus): Post[]; // Posts_list
  @post create(@body post: Create<Post>): Post;  // Posts_create
}
```

The client then calls `Posts_list`, and its types are `PostsListQuery`.
Writing an `@operationId` on each operation fixes that, one line per
operation.

## `@operationIds`

Put it on the interface, once:

```tsp
import "@typespec/http";
import "@typespec/openapi";
import "@nxgt/typespec";

using Http;
using OpenAPI;
using Nxgt;

namespace Blog;

@route("/posts")
@operationIds
interface Posts {
  @get list(@query status?: PostStatus): Post[];                  // listPosts
  @get @operationId("getPost") read(@path postId: string): Post | NotFound; // getPost
  @post create(@body post: Create<Post>): Post | BadRequest;      // createPosts
  @patch update(@path postId: string, @body post: MergePatchUpdate<Post>): Post | NotFound; // updatePosts
  @delete delete(@path postId: string): NoContentResponse | NotFound; // deletePosts
}
```

- Each operation is named `<operation><Interface>`: the method's name, then
  the interface's, as written.
- An operation with its own `@operationId` keeps it, whether it is written
  before or after `@operationIds`. `import "@typespec/openapi"` and
  `using OpenAPI` are only needed for that `@operationId`.
- An interface that `extends` a marked one is marked too, and names the
  operations it inherits after itself: `interface Drafts extends Posts {}`
  gives `listDrafts`. An inherited `@operationId` is copied as is, though,
  so `Drafts` would name its `read` `getPost` too: see below.

The generated `operations` then has one entry per id:

```ts
import { operations } from './generated/operations';

Object.keys(operations);
// ['listPosts', 'createPosts', 'getPost', 'updatePosts', 'deletePosts']
```

## On a template

On an interface template, `@operationIds` names the operations of each
interface that extends an instance, after that interface:

```tsp
@operationIds
interface Resource<Item> {
  @get list(): Item[];
}

@route("/pets")
interface Pets extends Resource<Pet> {}     // listPets

@route("/orders")
interface Orders extends Resource<Order> {} // listOrders
```

The library's own `Resource` goes one step further: `list` is named after
the interface, and `read`, `create`, `update` and `delete` after the item,
`readPet` ([Resources](resources.md)).

## Two operations named alike

An id must be unique, and four cases break that:

- the namespace is not part of the id, so `Store.Pets` and `Shelter.Pets`
  would both name their `list` `listPets`;
- an `@operationId` is copied by `extends`, so `Drafts extends Posts` would
  have a second `getPost`;
- an `@operationId` written on another operation, in any interface, takes
  the id `@operationIds` gives;
- an operation declared in the service namespace is named after itself, so
  `op listPets()` takes the id of `Pets.list`.

`@operationIds` refuses each with `duplicate-operation-id`, where
`@typespec/openapi3` would emit both without a word. Give one of them its own
`@operationId`; an inherited operation takes one by being declared again in
the interface that extends ([troubleshooting](../troubleshooting.md)).

## Without the library

The emitter's own option, `operation-id-strategy`, only chooses between
`parent-container` (`Posts_list`, the default), `fqn` (with the namespace)
and `explicit-only`. None of them gives `listPosts`.

`@operationIds` only names the operations of the interfaces it marks: the
strategy still names every other one. The check for two operations named
alike reads their ids as the default strategy gives them.

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
  @get list(): Post[];         // Posts_list
  @post create(@body post: Create<Post>): Post; // Posts_create
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
- An interface that `extends` another names the operations it inherits
  after itself: `@operationIds interface Drafts extends Posts {}` gives
  `listDrafts`. An inherited `@operationId` is copied as is, though, so
  `Drafts` would name its `read` `getPost` too: see below.

The generated `operations` then has one entry per id:

```ts
import { operations } from './generated/operations';

Object.keys(operations);
// ['listPosts', 'getPost', 'createPosts', 'updatePosts', 'deletePosts']
```

## Two operations named alike

An id must be unique, and two cases break that:

- the namespace is not part of the id, so `Store.Pets` and `Shelter.Pets`
  would both name their `list` `listPets`;
- an `@operationId` is copied by `extends`, so `Drafts extends Posts` would
  have a second `getPost`.

`@operationIds` refuses both with `duplicate-operation-id`, where
`@typespec/openapi3` would emit them without a word. Give one of them its own
`@operationId` ([troubleshooting](../troubleshooting.md)).

## Without the library

The emitter's own option, `operation-id-strategy`, only chooses between
`parent-container` (`Posts_list`, the default), `fqn` (with the namespace)
and `explicit-only`. None of them gives `listPosts`.

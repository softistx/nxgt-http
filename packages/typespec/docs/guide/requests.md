# Request bodies

`CreateRequest<T>`, `UpdateRequest<T>` and `PatchRequest<T>` are TypeSpec's own
`Create`, `Update` and `MergePatchUpdate` with a name template, so the body of
each write is a component with a name you can read: `CreatePostRequest`.

## Why names

TypeSpec's templates name what they emit from the model: `Create<Post>` is
the component `CreatePost` and `MergePatchUpdate<Post>` is
`PostMergePatchUpdate`. Two conventions in one spec, and a type in the
generated client that reads unlike the rest. The aliases give each body the
name `<Verb><Model>Request`, and `@nxgt/openapi-codegen` generates the types
and the Zod schemas under it.

## The smallest example

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

model Post {
  @visibility(Lifecycle.Read) id: uuid;
  @minLength(1) title: string;
  body: string;
  tags?: string[];
  ...Timestamps;
  ...Versioned;
}

@route("/posts")
interface Posts {
  @post createPost(@body post: CreateRequest<Post>): {
    @statusCode _: 201;
    @body post: Post;
  } | BadRequest;

  @put updatePost(@path postId: uuid, @body post: UpdateRequest<Post>):
    Post | BadRequest | NotFound | Conflict;

  @patch patchPost(@path postId: uuid, @body post: PatchRequest<Post>):
    Post | BadRequest | NotFound | Conflict;
}
```

| Alias | Is | Component | Content type | Properties |
| --- | --- | --- | --- | --- |
| `CreateRequest<T>` | `Create<T, "Create{name}Request">` | `CreatePostRequest` | `application/json` | those visible on create, as `T` declares them |
| `UpdateRequest<T>` | `Update<T, "Update{name}Request">` | `UpdatePostRequest` | `application/json` | those visible on update, as `T` declares them |
| `PatchRequest<T>` | `MergePatchUpdate<T, "Patch{name}Request">` | `PatchPostRequest` | `application/merge-patch+json` | those visible on update, all optional |

```ts
import type {
	CreatePostRequest,
	PatchPostRequest,
	UpdatePostRequest,
} from './generated/types';
```

```tsp
alias CreateRequest<T extends Reflection.Model> = Create<T, "Create{name}Request">;
alias UpdateRequest<T extends Reflection.Model> = Update<T, "Update{name}Request">;
alias PatchRequest<T extends Reflection.Model> = MergePatchUpdate<T, "Patch{name}Request">;
```

Read-only properties (`id`, `Timestamps`, `Actors`) are in none of the three.
`version` from `Versioned` is read and update, so it is in
`UpdatePostRequest` and `PatchPostRequest`, and not in `CreatePostRequest`.

## `PUT` replaces, `PATCH` merges

`UpdateRequest<Post>` is the whole resource: each property is as optional as
`Post` declares it, so `title` is required and `tags?` is not. Send it with
`@put`.

`PatchRequest<Post>` is a JSON Merge Patch: every property is optional, and a
nullable one is sent as `null` to clear it. The body's content type is
`application/merge-patch+json`, where the others are `application/json`.

```yaml
# openapi.yaml (excerpt)
PUT:
  requestBody:
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/UpdatePostRequest'
PATCH:
  requestBody:
    content:
      application/merge-patch+json:
        schema:
          $ref: '#/components/schemas/PatchPostRequest'
```

A client sending a patch sets the header `Content-Type:
application/merge-patch+json`. The component `UpdatePostRequest` requires
`title`; `PatchPostRequest` requires nothing.

## Nested models

A nested model the template filters is named by the same template; one it
leaves whole keeps its name.

```tsp
model Address {
  @visibility(Lifecycle.Read) id: uuid;
  street: string;
}

model Author {
  @visibility(Lifecycle.Read) id: uuid;
  name: string;
  address: Address;
}

@post createAuthor(@body author: CreateRequest<Author>): Author;
// CreateAuthorRequest.address is CreateAddressRequest, without `id`
```

A model with no property the filter changes, such as a `Tag` with only
`name`, is referenced under its own name, `Tag`.

## Your own name template

The aliases fix the convention. Another one is the same template, inline, and
`Create<T>` and `MergePatchUpdate<T>` stay usable:

```tsp
@post createPost(@body post: Create<Post, "New{name}">): Post;   // NewPost
@patch patchPost(@path postId: uuid, @body post: MergePatchUpdate<Post, "{name}Changes">): Post;
```

`{name}` is the model's name. Without a template, TypeSpec names the
components `CreatePost` and `PostMergePatchUpdate`.

## Next

The columns a request leaves out are on [Scalars and columns](columns.md); the
errors a write answers on [Error replies](errors.md).

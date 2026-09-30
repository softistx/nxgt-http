# Operation ids

`@operationIds` makes each operation's OpenAPI id its name, exactly as
written, so the generated client's methods are the names in your spec.

An operation id is what `@nxgt/openapi-codegen` names everything after: the
client's method, the `operations` entry, and the prefix of the operation's
types (`ListPostsQuery`, `zGetPostParam`).

## On the service namespace

Mark the namespace once, and every operation in it is named as written:

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Blog" })
@operationIds
namespace Blog;

model Post {
  @visibility(Lifecycle.Read) id: uuid;
  title: string;
}

model Comment {
  @visibility(Lifecycle.Read) id: uuid;
  body: string;
}

@route("/posts")
interface Posts {
  @get listPosts(...PageParameters): Page<Post>;                       // listPosts
  @get getPost(@path postId: uuid): Post | NotFound;                   // getPost
  @delete deletePost(@path postId: uuid): NoContentResponse | NotFound; // deletePost
}

@route("/posts/{postId}/comments")
interface Comments {
  @get findPostComments(@path postId: uuid, ...CursorPageParameters): CursorPage<Comment>; // findPostComments
}
```

Alone, `@typespec/openapi3` would write `Posts_listPosts` and
`Comments_findPostComments`. The generated `operations` has one entry per
id:

```ts
import { operations } from './generated/operations';

Object.keys(operations);
// ['listPosts', 'getPost', 'deletePost', 'findPostComments']
```

Name each operation as the client should call it: `listPosts`, not `list`.
An operation named `list` gets the id `list`, and a second `list` in another
interface is an error ([below](#two-operations-named-alike)).

## Where it goes

```tsp
extern dec operationIds(target: Interface | Namespace);
```

| Marked | Named as written |
| --- | --- |
| a namespace | every operation in it, however deep: in its interfaces, in the namespaces it contains, and declared in it with `op` |
| an interface | its operations, and those of each interface that `extends` it |
| neither | nothing: the emitter's `operation-id-strategy` names the operation |

On one interface, the others keep the emitter's names:

```tsp
@service
namespace Blog;

@route("/posts")
@operationIds
interface Posts {
  @get listPosts(): Post[]; // listPosts
}

@route("/drafts")
interface Drafts {
  @get listDrafts(): Post[]; // Drafts_listDrafts
}
```

A namespace beside the marked one is not marked: `@operationIds` on `Blog`
does not reach a `namespace Legacy` declared next to it.

## An operation's own `@operationId`

An operation with its own `@operationId` keeps it, whether it is written
before or after `@operationIds`:

```tsp
import "@typespec/openapi";

using OpenAPI;

@route("/posts")
interface Posts {
  @get @operationId("fetchPost") getPost(@path postId: uuid): Post | NotFound; // fetchPost
}
```

`import "@typespec/openapi"` and `using OpenAPI` are only needed for
`@operationId` ([troubleshooting](../troubleshooting.md#unknown-decorator-operationid)).

## On a template

An interface template is never emitted, only the interfaces that extend one
of its instances. When the template is marked, or the interface that extends
it is in a marked namespace, those are named as written:

```tsp
@operationIds
interface Listable<Item> {
  @get listAll(): Item[];
}

@route("/pets")
interface Pets extends Listable<Pet> {} // listAll
```

A second interface extending `Listable` would name its operation `listAll`
too, which is an error: see below.

An operation template is never emitted either, only the operations declared
from it. In a marked namespace, each is named as written:

```tsp
op Read<Item>(): Item;

@route("/pets/first") @get op readFirstPet is Read<Pet>; // readFirstPet
@route("/toys/first") @get op readFirstToy is Read<Toy>; // readFirstToy
```

## Two operations named alike

An id must be unique in its service's document. Two `@service` namespaces
are two documents, and may each have a `health`. `@operationIds` refuses two
operations of one id, one of them named by it, with `duplicate-operation-id`,
where `@typespec/openapi3` would emit both without a word:

```text
error @nxgt/typespec/duplicate-operation-id: Two operations are named listPets: an OpenAPI operation id must be unique.
```

It happens when:

- one name is in two interfaces: neither the namespace nor the interface is
  part of the id, so `Store.Pets` and `Shelter.Pets` both give `listPets`;
- an interface `extends` another: it copies its operations and their
  names, so `Drafts extends Posts` gives a second `getPost`, and two
  interfaces extending one template share every operation;
- an `@operationId` written on another operation is a name
  `@operationIds` gives;
- an unmarked operation declared in the service namespace, which the
  emitter names after itself, has a marked operation's name: `op listPets()`
  beside `Pets.listPets`.

Declare distinct operations rather than extending:

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

Or keep `extends`, and declare each copied operation again with its own
`@operationId`:

```tsp
@route("/drafts")
interface Drafts extends Posts {
  @get @operationId("getDraft") getPost(@path postId: uuid): Post | NotFound;
}
```

More in [troubleshooting](../troubleshooting.md#two-operations-are-named-listpets-an-openapi-operation-id-must-be-unique).

## Without the library

The emitter's own option, `operation-id-strategy`, only chooses between
`parent-container` (`Posts_listPosts`, the default), `fqn` (with the
namespace) and `explicit-only`. None of them gives `listPosts`.

The operations `@operationIds` does not name keep that strategy. They are
checked against the ones it names by the id the default strategy gives
them.

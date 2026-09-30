# Operation ids

`@operationIds` gives each operation the OpenAPI id the generated client
should call it by: a known verb in an interface takes the interface's
resource, `list` in `Posts` is `listPosts`, and any other name is the id
exactly as written.

An operation id is what `@nxgt/openapi-codegen` names everything after: the
client's method, the `operations` entry, and the prefix of the operation's
types (`ListPostsQuery`, `zGetPostParam`).

## On the service namespace

Mark the namespace once, and every operation in it is named:

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
  @get list(...PageParameters): Page<Post>;                                       // listPosts
  @get @route("/{postId}") get(@path postId: uuid): Post | NotFound;              // getPost
  @get @route("/by-slug/{slug}") findBySlug(@path slug: string): Post | NotFound; // findPostBySlug
  @delete @route("/{postId}") delete(@path postId: uuid): NoContentResponse | NotFound; // deletePost
}

@route("/posts/{postId}/comments")
interface Comments {
  @get findPostComments(@path postId: uuid, ...CursorPageParameters): CursorPage<Comment>; // findPostComments
}
```

Alone, `@typespec/openapi3` would write `Posts_list` and
`Comments_findPostComments`. The generated `operations` has one entry per
id:

```ts
import { operations } from './generated/operations';

Object.keys(operations);
// ['listPosts', 'getPost', 'findPostBySlug', 'deletePost', 'findPostComments']
```

## Verbs

In an interface, an operation named exactly one of these verbs is completed
with the interface's resource:

| Verb | Takes | In `Users` | In `Categories` |
| --- | --- | --- | --- |
| `list` | the plural | `listUsers` | `listCategories` |
| `read` | the plural | `readUsers` | `readCategories` |
| `find` | the plural | `findUsers` | `findCategories` |
| `search` | the plural | `searchUsers` | `searchCategories` |
| `count` | the plural | `countUsers` | `countCategories` |
| `createMany` | the plural | `createManyUsers` | `createManyCategories` |
| `updateMany` | the plural | `updateManyUsers` | `updateManyCategories` |
| `deleteMany` | the plural | `deleteManyUsers` | `deleteManyCategories` |
| `get` | the singular | `getUser` | `getCategory` |
| `create` | the singular | `createUser` | `createCategory` |
| `update` | the singular | `updateUser` | `updateCategory` |
| `patch` | the singular | `patchUser` | `patchCategory` |
| `replace` | the singular | `replaceUser` | `replaceCategory` |
| `upsert` | the singular | `upsertUser` | `upsertCategory` |
| `delete` | the singular | `deleteUser` | `deleteCategory` |

A verb followed by `By` and a capital letter takes the singular before
`By`, whichever form the verb takes alone, except a `*Many` verb, which
takes the plural:

```tsp
@route("/users")
interface Users {
  @get @route("/{id}") findById(@path id: uuid): User | NotFound;                    // findUserById
  @get @route("/by-email/{email}") getByEmail(@path email: email): User | NotFound;  // getUserByEmail
  @delete @route("/by-team/{teamId}") deleteManyByTeam(@path teamId: uuid): void;    // deleteManyUsersByTeam
}
```

Any other name is the id as written: `findActiveUsers` is
`findActiveUsers`, and so is `listUsers`. The verb must be the whole name,
or the whole part before `By`: `listAll` and `listing` are not verbs.

Outside an interface, the id is always the name as written, even a verb:

```tsp
@route("/health") @get op list(): void; // list
```

## The resource

The plural is the interface's name. The singular comes from a short English
rule on its last word, so `BlogPosts` is `BlogPost`:

| Interface | Singular |
| --- | --- |
| `Users`, `BlogPosts`, `APIKeys` | `User`, `BlogPost`, `APIKey` |
| `Categories` | `Category` |
| `Addresses`, `Boxes`, `Matches`, `Branches`, `Wishes` | `Address`, `Box`, `Match`, `Branch`, `Wish` |
| `Statuses`, `Buses` | `Status`, `Bus` |
| `Houses`, `Caches`, `Pies` | `House`, `Cache`, `Pie` |
| `People`, `Children`, `Movies` | `Person`, `Child`, `Movie` |
| `Series`, `Status`, `Access`, `Staff` | unchanged |

The rule is short, not a dictionary: a name it does not know stays as it
is, so `create` in `Staff` is `createStaff`. Name the resource yourself:

```tsp
@route("/staff")
@operationIds(#{ singular: "Member" })
interface Staff {
  @get list(): Member[];  // listStaff
  @post create(): Member; // createMember
}
```

## Options

```tsp
model OperationIdsOptions {
  singular?: string;
  plural?: string;
  verbs?: Record<"singular" | "plural">;
}

extern dec operationIds(
  target: Interface | Namespace,
  options?: valueof OperationIdsOptions
);
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `singular` | `string` | the plural, by the English rule | the resource's singular; on an interface only |
| `plural` | `string` | the interface's name | the resource's plural, and the source of the singular when `singular` is not given; on an interface only |
| `verbs` | `Record<"singular" \| "plural">` | the verbs above | more verbs, or a verb that takes the other form; on a namespace or an interface |

`plural` alone renames both, the singular following by the rule:

```tsp
@route("/team")
@operationIds(#{ plural: "People" })
interface Team {
  @get list(): Person[];  // listPeople
  @post create(): Person; // createPerson
}
```

`verbs` adds a verb, or changes the form one takes:

```tsp
@service
@operationIds(#{ verbs: #{ archive: "singular", export: "plural" } })
namespace Shop;

@route("/users")
interface Users {
  @post @route("/{id}/archive") archive(@path id: uuid): void; // archiveUser
  @get @route("/export") export(): User[];                     // exportUsers
}
```

On a namespace, `verbs` reaches every interface in it, however deep. On an
interface, its `verbs` override the namespace's, verb by verb:

```tsp
@route("/staff")
@operationIds(#{ singular: "Member", verbs: #{ export: "singular" } })
interface Staff {
  @get export(): Member; // exportMember, where the namespace alone gives exportStaff
}
```

`singular` and `plural` on a namespace are an error: a namespace holds many
interfaces, and has no resource of its own
([troubleshooting](../troubleshooting.md#singular-and-plural-name-an-interfaces-resource-a-namespace-has-none)).

```text
error @nxgt/typespec/resource-name-on-namespace: `singular` and `plural` name an interface's resource: a namespace has none. Put them on the interface.
```

## Precedence

For each operation `@operationIds` names, the first that applies gives the
id:

1. its own `@operationId`, written before or after `@operationIds`;
2. outside an interface: its name, as written;
3. a verb, or a verb followed by `By…`: the verb with the interface's
   resource;
4. its name, as written.

The verbs are the library's, overridden by each marked namespace's around
the interface from the outermost in, then by the interfaces it extends,
then by its own. The resource is the interface's own `singular` and
`plural`, else its name and that name's singular: an interface never takes
the names of one it extends, or two extending it would collide.

## Where it goes

| Marked | Named |
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
  @get list(): Post[]; // listPosts
}

@route("/drafts")
interface Drafts {
  @get list(): Post[]; // Drafts_list
}
```

A namespace beside the marked one is not marked: `@operationIds` on `Blog`
does not reach a `namespace Legacy` declared next to it.

## An operation's own `@operationId`

An operation with its own `@operationId` keeps it, verb or not:

```tsp
import "@typespec/openapi";

using OpenAPI;

@route("/posts")
interface Posts {
  @get @route("/{postId}") @operationId("fetchPost") get(@path postId: uuid): Post | NotFound; // fetchPost
}
```

`import "@typespec/openapi"` and `using OpenAPI` are only needed for
`@operationId` ([troubleshooting](../troubleshooting.md#unknown-decorator-operationid)).

### Upgrading from 0.4

Before 0.5.0, every name was the id as written. An operation of a marked
interface named exactly a verb, such as `list` or `create`, now gets a new
id, and the generated client's method changes with it. Give it an
`@operationId` to keep the old one:

```tsp
@route("/users")
interface Users {
  @get @operationId("list") list(): User[]; // list, as before
}
```

A name that already carried its resource, `listUsers`, is unchanged.

## On a template

An interface template is never emitted, only the interfaces that extend one
of its instances. When the template is marked, or the interface that extends
it is in a marked namespace, those are named, and a verb takes the resource
of the interface that extends it:

```tsp
interface Listable<Item> {
  @get list(): Item[];
}

@route("/pets")
interface Pets extends Listable<Pet> {} // listPets

@route("/toys")
interface Toys extends Listable<Toy> {} // listToys
```

A name that is not a verb, `listAll`, would be `listAll` in both, which is
an error: see below. So is a `singular` or `plural` on the template, or on
any interface others extend: the interfaces extending it share it, and
`create` in each is `createMember`.

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

- a verb and the id it gives are both in one interface: `list` and
  `listUsers` in `Users` are both `listUsers`;
- one name is in two interfaces of one name, or a name that is not a verb in
  two interfaces: neither the namespace nor the interface is part of it, so
  `Store.Pets` and `Shelter.Pets` both give `listPets`, whether they declare
  `list` or `listPets`;
- an interface `extends` another and copies a name that is not a verb:
  `Drafts extends Posts` gives a second `getPost`, where `get` would give
  `getDraft`;
- interfaces extend one that has a `singular` or a `plural`, and so share
  its resource;
- an `@operationId` written on another operation is an id `@operationIds`
  gives;
- an unmarked operation declared in the service namespace, which the
  emitter names after itself, has a marked operation's id: `op listPets()`
  beside a marked `Pets.list`.

Name the operations with verbs, and each interface extending them gets its
own ids:

```tsp
@route("/posts")
interface Posts {
  @get @route("/{postId}") get(@path postId: uuid): Post | NotFound; // getPost
}

@route("/drafts")
interface Drafts extends Posts {} // getDraft
```

Or keep the names, and declare each copied operation again with its own
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

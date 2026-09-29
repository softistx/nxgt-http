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
@patch update(@path postId: string, @body post: MergePatchUpdate<Post>): Post | BadRequest;
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
`ValidationIssue`, `ValidationTarget`, `Uuid`, `Email`, or the page of one
of its models,
such as `PostPage` beside `Page<Post>`, or `CommentCursorPage` beside
`CursorPage<Comment>`.

```text
error @typespec/openapi/duplicate-type-name: Duplicate type name: 'NotFoundBody'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.
```

**Why:** the library names its schemas with `@friendlyName`, without a
namespace, so they share the spec's schema names.

**Fix:** reuse the library's model, or rename yours:

```tsp
@get read(@path postId: string): Post | NotFound;
```

## `Two operations are named listPets: an OpenAPI operation id must be unique`

**When:** an operation of an `@operationIds` interface has the id of another
operation:

- two interfaces of one name, in two namespaces, share an operation name:
  `Store.Pets` and `Shelter.Pets` both give `listPets`;
- an interface `extends` another, whose operation has an `@operationId`:
  `extends` copies it as is;
- an `@operationId` written elsewhere takes the id `@operationIds` gives;
- an operation declared in the service namespace is named after itself:
  `op listPets()` takes the id of `Pets.list`.

```text
error @nxgt/typespec/duplicate-operation-id: Two operations are named listPets: an OpenAPI operation id must be unique.
```

**Why:** `@operationIds` names each operation `<operation><Interface>`, without
the namespace. `@typespec/openapi3` would emit both ids without a word, and
the generator would then refuse the spec.

**Fix:** give one of them its own `@operationId`. An inherited operation takes
one by being declared again in the interface that extends:

```tsp
import "@typespec/openapi";

using OpenAPI;

@route("/drafts")
interface Drafts extends Posts {
  @get @operationId("getDraft") read(@path postId: string): Post | NotFound;
}
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

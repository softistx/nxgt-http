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

**Fix:** install it next to the spec's project, as a devDependency:

```sh
bun add -d @nxgt/typespec @typespec/compiler @typespec/http @typespec/openapi3 @nxgt/openapi-codegen
```

## `Duplicate type name: 'NotFoundBody'`

**When:** `tsp compile` runs on a spec that declares its own model named like
one of the library's: `BadRequestBody` … `InternalServerErrorBody`,
`ValidationIssue` or `ValidationTarget`.

```text
error @typespec/openapi/duplicate-type-name: Duplicate type name: 'NotFoundBody'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.
```

**Why:** the library names its schemas with `@friendlyName`, without a
namespace, so they share the spec's schema names.

**Fix:** reuse the library's model, or rename yours:

```tsp
@get read(@path postId: string): Post | NotFound;
```

## `Two operations of @operationIds interfaces are named listPets`

**When:** two operations of `@operationIds` interfaces end up with one id:
two interfaces of one name in two namespaces share an operation name, or an
interface `extends` another whose operation has an `@operationId`, which is
copied as is.

```text
error @nxgt/typespec/duplicate-operation-id: Two operations of @operationIds interfaces are named listPets. Give one of them its own @operationId.
```

**Why:** `@operationIds` names each operation `<operation><Interface>`, without
the namespace, and an OpenAPI operation id must be unique. `@typespec/openapi3`
would emit both without a word.

**Fix:** give one of them its own id:

```tsp
namespace Shelter {
  @route("/shelter/pets")
  @operationIds
  interface Pets {
    @get @operationId("listShelterPets") list(): Pet[];
  }
}
```

## `unsupported_version` from the generator

**When:** you generate from what `tsp compile` emitted.

**Why:** `@typespec/openapi3` emits OpenAPI 3.0 by default.

**Fix:** in `tspconfig.yaml`, set `openapi-versions: ['3.1.0']` or
`['3.2.0']` under the `@typespec/openapi3` options.

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
@put update(@path id: string, @body article: Article): Article | BadRequest;
```

## `Couldn't resolve import "@nxgt/typespec"`

**When:** `tsp compile` runs on a spec that imports the library.

**Why:** the library is not installed where the spec is, or the project has
no `package.json` to resolve it from.

**Fix:** install it next to the spec's project, as a devDependency:

```sh
bun add -d @nxgt/typespec @typespec/compiler @typespec/http @typespec/openapi3
```

## `unsupported_version` from the generator

**When:** you generate from what `tsp compile` emitted.

**Why:** `@typespec/openapi3` emits OpenAPI 3.0 by default.

**Fix:** in `tspconfig.yaml`, set `openapi-versions: ['3.1.0']` or
`['3.2.0']` under the `@typespec/openapi3` options.

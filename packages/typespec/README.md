# @nxgt/typespec

nxgt's HTTP conventions as a [TypeSpec](https://typespec.io) library, so an
API spec states them in one word instead of rewriting them. Compile the spec to
OpenAPI 3.1 or 3.2 with `@typespec/openapi3`, then generate the code with
[`@nxgt/openapi-codegen`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/README.md).
Each shape here is the one the `@nxgt/*` packages actually send on the wire.

## Install

```sh
bun add -d @nxgt/typespec @typespec/compiler @typespec/http @typespec/openapi3
```

`@typespec/compiler` and `@typespec/http` 1.16 or later are peer dependencies.
Emit OpenAPI 3.1 or 3.2 in `tspconfig.yaml`: `@typespec/openapi3` emits 3.0
by default, and the generator refuses it. Every convention here is compiled
to both in CI, and generates the same code from either.

```yaml
# api/tspconfig.yaml
emit:
  - '@typespec/openapi3'
options:
  '@typespec/openapi3':
    openapi-versions: ['3.1.0']
    emitter-output-dir: '{project-root}/../openapi'
    output-file: openapi.yaml
```

## Usage

### Error replies

Import the library and name the errors an operation can answer:

```tsp
// api/main.tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Articles" })
namespace Articles;

model Article {
  id: string;
  title: string;
}

@route("/articles/{id}")
interface Items {
  @get read(@path id: string): Article | NotFound | Unauthorized;
  @put update(@path id: string, @body article: Article):
    | Article
    | BadRequest
    | Conflict
    | ErrorResponse<503>;
}
```

```sh
bunx --no-install tsp compile api && bunx nxgt-openapi generate -i openapi/openapi.yaml -o src/generated
```

Every error body is what `@nxgt/openapi-hono` sends, `message` being an i18n
key, not a sentence:

```ts
// src/generated/types.ts (excerpt)
export interface NotFoundBody {
	status: 404;
	message: string;
	timestamp: string;
}
```

| Response | Status | Body |
| --- | --- | --- |
| `BadRequest` | 400 | `BadRequestBody`: the envelope, and `issues` when the validators refused the request |
| `Unauthorized` | 401 | `UnauthorizedBody` |
| `Forbidden` | 403 | `ForbiddenBody` |
| `NotFound` | 404 | `NotFoundBody` |
| `Conflict` | 409 | `ConflictBody` |
| `UnprocessableEntity` | 422 | `UnprocessableEntityBody` |
| `TooManyRequests` | 429 | `TooManyRequestsBody` |
| `InternalServerError` | 500 | `InternalServerErrorBody` |
| `ErrorResponse<Status>` | any | `ErrorBody<Status>` |

The generator also declares the validators' own 400, `ValidationErrorBody`,
on every operation that takes a parameter or a body. With `BadRequest`, a
400 reply is typed `BadRequestBody | ValidationErrorBody`.

## API

### Models

| Model | What it is |
| --- | --- |
| `ErrorBody<Status>` | `{ status: Status, message: string, timestamp: utcDateTime }` |
| `BadRequestBody` | `ErrorBody<400>` and `issues?: ValidationIssue[]` |
| `UnauthorizedBody` … `InternalServerErrorBody` | `ErrorBody<401>` … `ErrorBody<500>`, one per response above |
| `ValidationIssue` | `{ target: ValidationTarget, path: (string \| integer)[], code: string, message: string }` |
| `ValidationTarget` | `"param" \| "query" \| "header" \| "json" \| "form" \| "body" \| "response"` |

### Responses

`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`,
`UnprocessableEntity`, `TooManyRequests`, `InternalServerError`, each an
`@error` model with its `@statusCode` and body, and
`ErrorResponse<Status>` for any other status.

## Traps

- **Do not declare a schema named `ValidationErrorBody`.** The generator
  declares it itself, and two schemas of that name fail with
  `name_collision`. `BadRequestBody` carries the `issues` instead.
- **`ErrorResponse<503>`'s body is emitted inline**, and generated as
  `<Operation>503Response`. For a named schema, name the body and the
  response:

  ```tsp
  model ServiceUnavailableBody is ErrorBody<503>;

  @error
  model ServiceUnavailable {
    @statusCode _: 503;
    @body body: ServiceUnavailableBody;
  }
  ```
- **OpenAPI 3.1 or 3.2, not 3.0.** Set `openapi-versions: ['3.1.0']` or
  `['3.2.0']`. With both, the emitter writes `3.1.0/openapi.yaml` and
  `3.2.0/openapi.yaml`, each in its own folder.

## Documentation

- [Error replies](docs/guide/errors.md): the envelope, each response, and
  what the generator makes of them;
- [troubleshooting](docs/troubleshooting.md);
- [the roadmap](docs/roadmap.md): pagination, auth, scalars, headers and
  resource templates, still to come.

## License

MIT

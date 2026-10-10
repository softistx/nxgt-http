# The emitter

`@nxgt/typespec` is a TypeSpec emitter as well as a library: it compiles a
spec to OpenAPI with `@typespec/openapi3`, and writes each `@queryMethod` as a
real `QUERY` when the document is OpenAPI 3.2.

## The smallest setup

Install the optional peer the emitter runs, then emit with this package in
place of `@typespec/openapi3`:

```sh
bun add -d @nxgt/typespec @typespec/openapi3
```

```yaml
# api/tspconfig.yaml
emit:
  - '@nxgt/typespec'
options:
  '@nxgt/typespec':
    openapi-versions: ['3.2.0']
    emitter-output-dir: '{project-root}/../openapi'
    output-file: openapi.yaml
```

```tsp
// api/main.tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Library" })
@operationIds
namespace Library;

model BookCriteria {
  titles: string[];
}

@route("/books")
interface Books {
  @post @queryMethod @route("/search")
  search(@body criteria: BookCriteria): string[]; // searchBooks
}
```

`tsp compile api` writes `openapi.yaml`. The `tsp init` template already emits
with this emitter, with OpenAPI 3.1 by default and no `@queryMethod`; using
one requires `openapi-versions: ["3.2.0"]`
([Getting started](getting-started.md)).

## Why an emitter

`@typespec/http` 1.17 declares no `QUERY`, so a spec writes a `@post` and
`@queryMethod` marks it. `@typespec/openapi3` can only emit a `post`. The
emitter finishes the job the mark started: in OpenAPI 3.2, which has a
`query` operation, the document says `query`.

## What it does

It runs `@typespec/openapi3` with the options it was given, the same ones
under the same names (`openapi-versions`, `emitter-output-dir`,
`output-file`, `file-type`…), and writes the same files. Then, in each
OpenAPI 3.2 document, each marked `post` becomes a
`query` operation, in place in its path item and without `x-nxgt-method`:

```yaml
# openapi.yaml
/books/search:
  query:
    operationId: searchBooks
```

| Case | Result |
| --- | --- |
| a marked `@post`, `openapi-versions: ['3.2.0']` | a `query` operation |
| a marked `@post`, any version below 3.2 in `openapi-versions`, or none (the default, 3.0.0) | the error `query-method-needs-openapi-3.2` on each marked operation; nothing is emitted |
| a marked `@post`, `@typespec/openapi3` in `emit` | the error `query-method-needs-nxgt-emitter` |
| no marked operation | byte-identical to `@typespec/openapi3`'s, in any version |

Both errors, with their fix, are in [troubleshooting](../troubleshooting.md).
A path item that already has a `query` is left alone. The emitter adds no
option of its own.

Its options are checked with `@typespec/openapi3`'s schema, so a typo is
`invalid-schema`, as under `@typespec/openapi3`. `tsp compile --dry-run`
works, `new-line: crlf` is kept, and the document's format (YAML or JSON) is
read from its text, not from the file name.

**The default output folder changes with the emitter.** With
`emitter-output-dir` unset, the files go to `tsp-output/@nxgt/typespec`,
where `@typespec/openapi3` wrote `tsp-output/@typespec/openapi3`. Set
`emitter-output-dir` (the template does) to keep a path.

`@typespec/openapi3` is loaded only when emitting, so a spec that only
imports the library, `tsp compile --no-emit`, does not need it installed.

## What follows downstream

| Step | What it does with the `query` operation |
| --- | --- |
| `@nxgt/openapi-codegen` | generates `method: 'query'` in the `operations` table |
| `@nxgt/openapi-hono` | serves it with `.query(path, handler)` |
| `@nxgt/httpyz` client | sends `QUERY`; its `cache()` and retries treat it like a `GET`, keyed by its body |

A hand-written OpenAPI document may still carry a `post` with
`x-nxgt-method: query`, which the generator marks `queryMethod: true`; a
TypeSpec spec no longer emits one.

The handler of the 3.2 case, wired as the fixture's spec does:

```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';

const app = new Hono();
createRoutes(app, { validateResponses: true }).query('/books/search', (c) =>
	c.json(
		{
			items: [],
			total: c.req.valid('json').titles.length,
			page: 1,
			pageSize: 20,
			pageCount: 0,
		},
		200,
	),
);

const reply = await app.request('/books/search', {
	method: 'QUERY',
	body: JSON.stringify({ titles: ['Dune', 'Emma'] }),
	headers: { 'content-type': 'application/json' },
});
```

## A QUERY on the wire

A real `QUERY` is not a `POST`, so the path from the browser to the handler
has to accept the method:

- **The server's HTTP stack.** Recent Node and Bun accept `QUERY`, and Hono
  routes it. Check the runtime and any framework or adapter between the
  socket and Hono.
- **Proxies, gateways and CDNs.** Some refuse a method they do not know, or
  do not cache it. If one in front of the service does, take off
  `@queryMethod` and use a `@post`, which goes through everything.
- **CORS.** `QUERY` is not a CORS-safelisted method, so a browser always sends
  a preflight, and the server must list `QUERY` in `Access-Control-Allow-Methods`.

## Without the emitter

The library, its decorators and the linter do not depend on the emitter, but
a spec that uses `@queryMethod` must emit with it: `@typespec/openapi3` alone
reports `query-method-needs-nxgt-emitter`. More on the decorator, its checks
and its errors, in [Operation ids](operation-ids.md#a-query-in-openapi-32).

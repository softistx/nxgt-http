# @alya/openapi

The OpenAPI 3.1 document of an [`@alya/server`](https://www.npmjs.com/package/@alya/server)
app, made from the schemas its routes already declare. Nothing is written
twice: the document cannot drift from the code.

```sh
bun add @alya/openapi
```

## Serving it

```ts
import { alya } from '@alya/server';
import { docs } from '@alya/openapi';

const app = alya().get(...).post(...);
app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));
// GET /openapi.json, and an API reference page at GET /docs
```

`path` and `ui` move them; `ui: false` serves the document alone.

## Writing it

```ts
import { openapi } from '@alya/openapi';

await Bun.write('openapi.json', JSON.stringify(openapi(app, { info }), null, 2));
```

## How a route is documented

- the path as OpenAPI writes it: `/users/:id` is `/users/{id}`, a `*` is `{path}`
- `params`, `query` and `headers` as parameters, required as their schemas say
- `body` as a JSON request body, what its schema **accepts**
- each `response` as what its schema **gives back**, as it goes over the wire:
  a Zod `Date` is a `date-time` string
- the 400 of a route that validates its request, and the 500 of every route
- `detail`: `summary`, `description`, `tags`, `operationId`, `deprecated`. An
  operation id is otherwise made from the method and path: `getUsersById`

Schemas convert through [Standard JSON Schema](https://standardschema.dev),
which Zod 4.2 and later carry. For a vendor that does not, pass `convert`.

## API

| export | |
| --- | --- |
| `openapi(app, options)` | the document. `info`, `servers`, `convert`, `exclude` |
| `docs(app, options)` | a plugin serving it, and a reference page. `path`, `ui` too |
| `toJsonSchema(schema, side, convert?)` | one schema as JSON Schema 2020-12 |
| `openApiPath(path)`, `operationId(method, path)` | the naming the document uses |

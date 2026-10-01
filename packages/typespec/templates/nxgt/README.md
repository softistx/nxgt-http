# {{name}}

The API is written in TypeSpec, in `main.tsp`, with the
[`@nxgt/typespec`](https://www.npmjs.com/package/@nxgt/typespec) conventions.

Compile it to `openapi/openapi.yaml`, then generate the types, validators
and routes into `src/generated`:

```sh
npx tsp compile .
npx nxgt-openapi generate
```

Chain both in `package.json`, so the code never lags the spec:

```json
{
  "scripts": {
    "api": "tsp compile . && nxgt-openapi generate",
    "api:check": "tsp compile . && nxgt-openapi generate --check"
  }
}
```

`tspconfig.yaml` turns on the linter's recommended rules, which warn of a
list without a page, a service without `@operationIds`, and an error reply
without the envelope.

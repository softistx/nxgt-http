---
'@nxgt/openapi-httpyz': minor
'@nxgt/datasource-rest': major
---

- **`@nxgt/openapi-httpyz`**:
  - **Breaking:** a bound client checks and decodes by default, as a plain call of the core client checks a declared reply. `validate` defaults to `true`, so the request is checked before it is sent and the reply before it is returned. `decode` defaults to `true`, so each reply is returned as its schema outputs it: with `dates: 'date'`, a date-time is a `Date`.
    - To keep the old behavior, pass `{ validate: false, decode: false }`.
    - Error replies are checked too. A 400 declared with a schema that does not describe what the server sends, such as `@nxgt/openapi-hono`'s validation body, now throws a `ValidationError` instead of returning the 400.
    - A client whose types are given now writes `false` as its third type argument to not decode: `createOpenApiClient<ClientOperations, OperationsByRoute, false>`, with `decode: false`.
  - A client has only the methods its spec has an operation for, at runtime as in its types: no `api.trace` without a TRACE operation.
  - A path with no operation for its method rejects with a `ClientError`, `GET /x: the spec has no operation at it`, instead of a plain `Error`.
- **`@nxgt/datasource-rest`**:
  - **Breaking:** a datasource validates and decodes by default, as its client now does. `decode: false` and `validate: false` turn that off, and `RESTDataSource<Ops, Routes, false>` types a datasource that does not decode.
  - **Breaking:** a `validate` check that fails puts its issues in the new `DataSourceError.issues`. `data` is always the reply's body. A refused reply also carries its `status`.
  - `RESTDataSource.for(operations)` is a datasource class bound to the generated table, with its types taken from it, so there is no `ClientOperations` to import:
    ```ts
    class Bookmarks extends RESTDataSource.for(operations) {}
    new Bookmarks({ baseUrl, token });
    ```
    `RESTDataSource.for(operations, { decode: false })` does not decode. The new `BoundDataSource` type is what it returns.
  - `this.get()`, `this.post()` and the rest exist only for the spec's methods, set on each instance. A subclass's own method of the same name still wins.

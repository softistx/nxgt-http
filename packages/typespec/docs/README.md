# @nxgt/typespec documentation

The [package README](../README.md) is the short version.

| Page | Read it when |
| --- | --- |
| [Getting started](guide/getting-started.md) | starting a new API project from the `tsp init` template, up to a Hono route |
| [Error replies](guide/errors.md) | declaring what an operation answers when it fails |
| [Pagination](guide/pagination.md) | listing a collection a page at a time |
| [Authentication](guide/auth.md) | protecting an operation with a `@nxgt/janus` session |
| [Scalars](guide/scalars.md) | typing a latitude, a currency, an IP address or a port, and knowing what each pattern leaves out |
| [Scalars and columns](guide/columns.md) | typing ids and addresses, and the columns a row carries |
| [Headers](guide/headers.md) | making a write idempotent, or declaring a rate limit |
| [Sorting](guide/sorting.md) | letting a client filter and sort a list |
| [Operation ids](guide/operation-ids.md) | naming each operation, and so the generated client's method: `list` in `Users` as `listUsers`, any other name as written |
| [Linter](guide/linter.md) | checking a spec against these conventions in `tsp compile`, or turning one rule off |
| [Troubleshooting](troubleshooting.md) | the compiler or the generator refused the spec |
| [Roadmap](roadmap.md) | wondering what is coming |

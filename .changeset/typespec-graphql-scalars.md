---
'@nxgt/typespec': minor
---

The scalars of `@nxgt/graphql-scalars`, under the same names: each one emits an OpenAPI component named as in GraphQL, a `format`, a pattern or bounds approximating the rule, and `x-nxgt-scalar`. See the scalars guide.

Breaking: `uuid` emits the component `UUID`, not `Uuid`, and refuses a UUID of no known version (write `guid` for the shape only). `email` is now an alias of `emailAddress` and emits `EmailAddress`, not `Email`.

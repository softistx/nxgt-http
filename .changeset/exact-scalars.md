---
'@nxgt/openapi-codegen': minor
---

A new `scalars` option, `'pattern' | 'exact'` (default `'pattern'`, as before). With `scalars: 'exact'`, a string scalar of `@nxgt/typespec` (a schema with `x-nxgt-scalar`) is validated by its own schema from `@nxgt/zod`, such as `ibanSchema`, imported by name, instead of `z.string().regex(...)`; a `minLength` or `maxLength` the spec adds is kept, as `.check(z.maxLength(n))`. `@nxgt/zod` `^0.1.3` is an optional peer, needed only by the generated code. The codecs (`DateTime`, `Timestamp`, `BigInt`, `Long`) and the numeric scalars keep their pattern or bounds. A new `unknown_scalar` warning reports an `x-nxgt-scalar` that `@nxgt/typespec` does not declare.

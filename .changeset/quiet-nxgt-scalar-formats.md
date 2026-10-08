---
'@nxgt/openapi-codegen': minor
---

A string schema with `x-nxgt-scalar`, one of `@nxgt/typespec`'s scalars, is now generated as `z.string().regex(pattern)`: its `pattern` is the rule, and a Zod format validator would second-guess it (`z.url()` trims its input, `z.email()` refuses a punycode top-level label). Its `format` (`iban`, `country-code`, `email`, `uri`, `byte`…) is no longer read, so it no longer warns `unknown_format`. `date-time` is the exception: the `dates: 'date'` option decodes through it. The pattern is validated as before.

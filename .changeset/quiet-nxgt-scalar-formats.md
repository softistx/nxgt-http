---
'@nxgt/openapi-codegen': patch
---

A string schema with `x-nxgt-scalar`, one of `@nxgt/typespec`'s scalars, no longer warns `unknown_format` for its format (`iban`, `country-code`…): its `pattern` carries the rule, and is validated as before.

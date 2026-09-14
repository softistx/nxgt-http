# Diagnostics

Every problem has a stable `code`. Match on the code, never on the wording.

Errors stop the run. The stages run in order (options, loading the files,
[`lint`](options.md#lint) when asked for, schemas and operations, names),
and the first stage with errors reports all
of them together in one `CodegenError`, along with its warnings. Warnings
from a successful run come back in `warnings`, and the files are still
written.

```
error paths/pets.yaml#/get/responses/200/$ref: … [pointer_not_found]
└──┬┘ └──────┬──────┘└──────────┬─────────┘      └───────┬───────┘
severity   file       JSON pointer in that file         code
```

`formatDiagnostic(d, baseDir)` prints one this way, with the path relative
to `baseDir`; the command line passes the current directory.

## Reading the spec

| Code | Severity | Meaning | Fix |
| --- | --- | --- | --- |
| `file_not_found` | error | a `$ref`'d file, or the root document, does not exist | fix the path: it is relative to the file that holds the `$ref` |
| `parse_error` | error | not valid YAML or JSON | fix the syntax |
| `invalid_root` | error | the file is not an object at the top | a spec file is a map, never a list or a scalar |
| `invalid_ref` | error | a `$ref` that cannot be read: not a string, a bad pointer, an `#anchor` | write `file#/json/pointer` |
| `remote_ref` | error | a `$ref` with a URI scheme: `https://`, `urn:`… | vendor the file, or install it as a package and refer to it by relative path |
| `pointer_not_found` | error | the file exists, the pointer inside it does not | check the pointer |
| `ref_cycle` | error | `$ref`s that only point at each other | point one of them at a real schema; a schema that contains a reference to itself is fine |
| `missing_version` | error | no `openapi` field at the root | is `input` the root document? |
| `unsupported_version` | error | Swagger 2.0 or OpenAPI 3.0 | convert to 3.1 or 3.2 |

## Schemas

| Code | Severity | Meaning | Fix |
| --- | --- | --- | --- |
| `invalid_schema` | error | not a valid schema: an unknown `type`, a bad `pattern`, a 3.0 boolean `exclusiveMinimum`, an `x-enum-varnames` that is not one distinct identifier per value | fix the schema |
| `unsupported_keyword` | error | a keyword with no faithful translation (`not`, `if`, tuples…) | rewrite it; see [Refused](schema-mapping.md#refused) |
| `legacy_nullable` | warning, or error with `legacyNullable: 'error'` | 3.0's `nullable: true` | write `type: [T, 'null']` |
| `unknown_format` | warning | a `format` Zod has no validator for, on a string or a number | none needed: it is checked as a plain string, or a plain number |
| `not_enforced` | warning | a keyword the validator does not check: `uniqueItems`, `minProperties`, an `additionalProperties: false` that an `allOf` loosens or that sits on an `allOf` member, an `unevaluatedProperties: false` over a `$ref` that accepts unknown keys, a `required` name no `properties` declares, `minItems` and the like on a schema with no `type`…; with `hono`, a status Hono has no type for, whose replies are typed with any status | enforce it in code if it matters; for `allOf`, set `unknownKeys: 'strict'` or make every member strict, so unknown keys are refused (keys another member declares are still accepted) |
| `discriminator_fallback` | warning | a discriminator some variant cannot answer | give every variant the property, required, as a distinct constant |
| `name_collision` | error | two schemas, or a schema and an operation's parameters or form, would generate the same name; a schema named `Operations`, `OperationsByRoute`, `PathsByMethod`, `OperationsByTag` or `PathsByTag`; with `hono`, one named `Replies`, `HonoSpec` or `Hono`; with `dates: 'date'`, one named `Wire` | rename one with [`names`](options.md#names) |
| `invalid_option` | error | an option with a value it cannot take | fix the option |
| `invalid_config` | error | `nxgt-openapi` found no config file, cannot import it, or it exports no config with an `input`; a config holds an option the generator does not know; two configs write to the same directory, through a symlink included | see [the command line](cli.md#config-file) |

## Operations

| Code | Severity | Meaning | Fix |
| --- | --- | --- | --- |
| `invalid_operation` | error | a path, operation, parameter, body or response that is not shaped as OpenAPI says | fix it |
| `invalid_operation` | warning | a path parameter without `required: true` | add it: path parameters are always required |
| `unsupported_operation` | error | `query` in a 3.1 document, or `additionalOperations` | upgrade to 3.2, or use a standard method |
| `unsupported_parameter` | error | a parameter a URL or header cannot carry as declared | see [Parameters](schema-mapping.md#parameters) |
| `path_parameter_mismatch` | error | `{name}` in the path and the `in: path` parameters disagree | declare every template variable, and only those |
| `missing_operation_id` | warning | no `operationId`, so one was derived | add an `operationId`: the derived one changes if the path does |
| `duplicate_operation_id` | error | two operations share an `operationId` | make it unique |
| `ignored` | warning | present but not generated: `default` and `4XX` responses, callbacks, webhooks | nothing, unless you relied on it |

## Linting

With [`lint`](options.md#lint), each problem Redocly reports becomes a
diagnostic. Its message ends with the Redocly rule, and it points at a line
rather than a pointer:

```
error paths/pets.yaml:7:5: Operation object should contain `summary` field. (operation-summary) [lint_error]
```

| Code | Severity | Meaning | Fix |
| --- | --- | --- | --- |
| `lint_error` | error | a rule set to `error` fails | fix the spec, or lower the rule in `redocly.yaml` |
| `lint_warning` | warning | a rule set to `warn` fails | the same, when it matters |

`lint` without `@redocly/openapi-core` installed, with a Redocly config
that cannot be loaded, or with a custom `fs`, is an `invalid_option`.

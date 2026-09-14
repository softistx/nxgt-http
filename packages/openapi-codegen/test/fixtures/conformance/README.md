# Conformance fixtures

Real, public OpenAPI documents, vendored unchanged, so the generator is held
to specs it did not shape. `src/conformance.spec.ts` generates each one,
checks that it raises only the warnings its document calls for, and runs
every example the document gives through the generated validator. `tsc`
then checks the code and its agreement file.

| Fixture | OpenAPI | Source | Licence |
| --- | --- | --- | --- |
| `redocly-museum` | 3.1.0 | [Redocly/museum-openapi-example](https://github.com/Redocly/museum-openapi-example) `openapi.yaml` at `2770b2b` | MIT, © 2023 Redocly Inc.; see its `LICENSE` |
| `oai-tictactoe` | 3.1.0 | [OAI/learn.openapis.org](https://github.com/OAI/learn.openapis.org) `examples/v3.1/tictactoe.yaml` at `4375654` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © the OpenAPI Initiative |
| `oai-webhook` | 3.1.0 | the same, `examples/v3.1/webhook-example.yaml` | CC BY 4.0, © the OpenAPI Initiative |
| `oai-query-3.2` | 3.2.0 | the same, `examples/v3.2/3.2-query-example.yaml` | CC BY 4.0, © the OpenAPI Initiative |
| `oai-tags-3.2` | 3.2.0 | the same, `examples/v3.2/3.2-tags-example.yaml` | CC BY 4.0, © the OpenAPI Initiative |

No file was changed. Each `openapi.yaml` is the upstream file, renamed.

## Considered and left out

- **Train Travel API** ([bump-sh-examples/train-travel-api](https://github.com/bump-sh-examples/train-travel-api)),
  OpenAPI 3.1. It is licensed CC BY-NC-SA 4.0, which does not fit this
  repository. It is also what showed that `unevaluatedProperties: false`
  over a `oneOf` needed support. The same shape is now `Payment` in the
  kitchen-sink fixture.

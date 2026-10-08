// The GraphQL scalars TypeSpec already spells: the `builtin` of each value
// entry of test/scalars/value.ts, written as the entry names it.
import "@typespec/http";

using Http;

@service(#{ title: "Value scalars" })
namespace ValueScalars;

model Values {
  json: unknown;
  jsonObject: Record<unknown>;
}

@route("/values") @post op postValueScalars(@body body: Values): void;

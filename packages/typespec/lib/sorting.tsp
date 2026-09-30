import "@typespec/http";

using Http;

namespace Nxgt;

/**
 * The sort of a list, as `@nxgt/drizzle` takes it: one field, and a
 * direction. `Field` is the union of the fields a client may sort by.
 * Spread it into an operation's parameters.
 */
model SortParameters<Field extends string> {
  /** The field to sort by. */
  @query
  orderBy?: Field;

  /** `asc` or `desc`. */
  @query
  direction?: "asc" | "desc" = "asc";
}

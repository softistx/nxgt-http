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

/**
 * The five operations of a resource, at `/<route>` and `/<route>/{id}`:
 * `list` pages by offset, with the `Filters` the spec writes and a sort by
 * `SortField`; `read`, `create`, `update` (a merge patch) and `delete`.
 * Extend it with `@route`; `@operationIds` names the operations after the
 * interface that extends it: `listPosts`, `readPosts`…
 *
 * @template Item The resource's model.
 * @template Filters A model of `@query` properties, spread into `list`.
 * @template SortField The fields `list` may sort by; `"id"` by default.
 * @template Id The type of `{id}`; `uuid` by default.
 */
@operationIds
interface Resource<
  Item extends {},
  Filters extends {} = {},
  SortField extends string = "id",
  Id = uuid
> {
  /** One page of the resources, filtered and sorted. */
  @get
  list(...Filters, ...PageParameters, ...SortParameters<SortField>): Page<Item>;

  /** One resource. */
  @get
  read(@path id: Id): Item | NotFound;

  /** Creates a resource. */
  @post
  create(@body item: Create<Item>): {
    @statusCode _: 201;
    @body item: Item;
  } | BadRequest | Conflict;

  /** Updates a resource with a merge patch. */
  @patch
  update(@path id: Id, @body item: MergePatchUpdate<Item>): Item | BadRequest | NotFound | Conflict;

  /** Deletes a resource. */
  @delete
  delete(@path id: Id): NoContentResponse | NotFound;
}

import "@typespec/http";

using Http;

namespace Nxgt;

/**
 * The query of an offset page, as `@nxgt/drizzle` and `@nxgt/mongo` read it.
 * Spread it into an operation's parameters.
 */
model PageParameters {
  /** 1-based. */
  @query
  @minValue(1)
  page?: integer = 1;

  /** How many items a page holds. A server lowers one above its maximum to it. */
  @query
  @minValue(1)
  pageSize?: integer = 20;
}

/** One page of an offset pagination. */
@friendlyName("{name}Page", Item)
model Page<Item> {
  items: Item[];

  /** Every item that matches, across all pages. */
  total: integer;

  /** 1-based. */
  page: integer;

  pageSize: integer;

  /** `ceil(total / pageSize)`: 0 when nothing matches. */
  pageCount: integer;
}

/**
 * The query of a cursor page, as `@nxgt/drizzle` and `@nxgt/mongo` read it.
 * Spread it into an operation's parameters.
 */
model CursorPageParameters {
  /** The previous page's `nextCursor`; absent for the first page. */
  @query
  after?: string;

  /** How many items a page holds. A server lowers one above its maximum to it. */
  @query
  @minValue(1)
  limit?: integer = 20;
}

/** One page of a cursor pagination, which gives no total. */
@friendlyName("{name}CursorPage", Item)
model CursorPage<Item> {
  items: Item[];

  /** Pass it as `after` for the next page; `null` on the last one. */
  nextCursor: string | null;
}

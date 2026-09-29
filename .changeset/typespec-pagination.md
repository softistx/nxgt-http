---
'@nxgt/typespec': minor
---

Add pagination, as `@nxgt/drizzle` and `@nxgt/mongo` page: `PageParameters` (the query `page`, 1-based, and `pageSize`, both at least 1, defaulting to 1 and 20) and `Page<Item>` (`{ items, total, page, pageSize, pageCount }`, the schema `<Item>Page`) for an offset page; `CursorPageParameters` (`after`, and `limit` defaulting to 20) and `CursorPage<Item>` (`{ items, nextCursor: string | null }`, the schema `<Item>CursorPage`) for a cursor page.

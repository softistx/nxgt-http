namespace Nxgt;

/**
 * `createdAt` and `updatedAt`, as `@nxgt/drizzle`'s `timestamps()` columns
 * hold them. Set by the server: read-only. Spread it into a model.
 */
model Timestamps {
  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;

  @visibility(Lifecycle.Read)
  updatedAt: utcDateTime;
}

/**
 * `deletedAt`, as `@nxgt/drizzle`'s `softDelete()` column holds it: `null`
 * until the row is deleted. Set by the server: read-only.
 */
model SoftDelete {
  @visibility(Lifecycle.Read)
  deletedAt: utcDateTime | null;
}

/**
 * `version`, as `@nxgt/drizzle`'s `version()` column holds it: the optimistic
 * lock. Read with the row, and sent back in an update, which the server
 * refuses with a 409 once the row has moved on.
 */
model Versioned {
  @visibility(Lifecycle.Read, Lifecycle.Update)
  @minValue(0)
  version: integer;
}

/**
 * `createdBy`, `updatedBy` and `deletedBy`, as `@nxgt/drizzle`'s `actors()`
 * columns hold them: the id of who wrote the row, `null` when nobody is
 * known. Set by the server: read-only. `Id` is `uuid` by default; `string`
 * or `integer` for `actors('text')` or `actors('integer')`.
 */
model Actors<Id = uuid> {
  @visibility(Lifecycle.Read)
  createdBy: Id | null;

  @visibility(Lifecycle.Read)
  updatedBy: Id | null;

  @visibility(Lifecycle.Read)
  deletedBy: Id | null;
}

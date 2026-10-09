import "@typespec/openapi";

using TypeSpec.Reflection;

namespace Nxgt;

/**
 * Marks a `POST` as a `QUERY`: a safe request, which changes nothing on the
 * server, with its criteria in the body. It is sent as a `POST`, which every
 * server, proxy and `fetch` accepts, and the OpenAPI document says what it is
 * with `x-nxgt-method: query`: `@nxgt/openapi-codegen` reads it. Once
 * `@typespec/http` declares `QUERY`, this is the decorator that changes, not
 * the spec. Only on a `POST`: anything else is the error
 * `query-method-not-post`. `@operationIds` checks its verb as a `QUERY`'s:
 * `search` and `query` take one.
 *
 * @example
 * ```typespec
 * @route("/users")
 * interface Users {
 *   @post @queryMethod @route("/search")
 *   search(@body criteria: UserCriteria): User[];   // searchUsers
 * }
 * ```
 */
extern dec queryMethod(target: Operation);

import "@typespec/openapi";

using TypeSpec.Reflection;

namespace Nxgt;

/**
 * The id of each operation is its name, as written: `findPostComments` is
 * `findPostComments`, where `@typespec/openapi3` would write
 * `Posts_findPostComments`. On an interface, its operations; on a namespace,
 * every operation in it, however deep. An operation with its own
 * `@operationId` keeps it. An id another operation of the same service has is an
 * error, `duplicate-operation-id`.
 *
 * @example
 * ```typespec
 * @service
 * @operationIds
 * namespace Blog;
 *
 * @route("/posts")
 * interface Posts {
 *   @get listPosts(): Post[];
 * }
 * ```
 */
extern dec operationIds(target: Interface | Namespace);

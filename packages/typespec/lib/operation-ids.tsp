import "@typespec/openapi";

using TypeSpec.Reflection;

namespace Nxgt;

/**
 * `@operationIds`' options.
 */
model OperationIdsOptions {
  /** The resource's singular, on an interface: `Person` in `People`. By default, the interface's name in the singular. */
  singular?: string;

  /** The resource's plural, on an interface. By default, the interface's name. */
  plural?: string;

  /** More verbs, each taking the resource's singular or its plural: `#{ archive: "singular" }`. */
  verbs?: Record<"singular" | "plural">;
}

/**
 * The id of each operation is its name, as written: `findPostComments` is
 * `findPostComments`, where `@typespec/openapi3` would write
 * `Posts_findPostComments`. In an interface, a known verb takes the
 * interface's resource: `list` in `Users` is `listUsers`, `create` is
 * `createUser`, `findById` is `findUserById`. The resource is the
 * interface's name, and its singular by a short English rule; `singular`
 * and `plural` name it. `verbs` adds verbs. On an interface, its operations;
 * on a namespace, every operation in it, however deep. An operation with its
 * own `@operationId` keeps it. An id another operation of the same service
 * has is an error, `duplicate-operation-id`.
 *
 * @example
 * ```typespec
 * @service
 * @operationIds
 * namespace Blog;
 *
 * @route("/posts")
 * interface Posts {
 *   @get list(): Post[];                    // listPosts
 *   @get findById(@path id: uuid): Post;    // findPostById
 *   @get findPostComments(): Comment[];     // findPostComments
 * }
 * ```
 */
extern dec operationIds(
  target: Interface | Namespace,
  options?: valueof OperationIdsOptions
);

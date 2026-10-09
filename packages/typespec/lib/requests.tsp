import "@typespec/http";

using Http;

namespace Nxgt;

/**
 * The body of a create: the properties of `T` visible on create, named
 * `Create<T>Request` (`CreatePostRequest`). A nested model filtered the same
 * way is named alike (`CreateAddressRequest`); one left whole keeps its name.
 */
alias CreateRequest<T extends Reflection.Model> = Create<
  T,
  "Create{name}Request"
>;

/**
 * The body of a full update, as a `PUT` replaces the resource: the properties
 * of `T` visible on update, each as optional as `T` declares it, named
 * `Update<T>Request` (`UpdatePostRequest`).
 */
alias UpdateRequest<T extends Reflection.Model> = Update<
  T,
  "Update{name}Request"
>;

/**
 * The body of a partial update, as a JSON Merge Patch
 * (`application/merge-patch+json`): the properties of `T` visible on update,
 * all optional, a nullable one sent as `null` to clear it, named
 * `Patch<T>Request` (`PatchPostRequest`).
 */
alias PatchRequest<T extends Reflection.Model> = MergePatchUpdate<
  T,
  "Patch{name}Request"
>;

// The API's spec. `tsp compile .` writes openapi/openapi.yaml, and
// `nxgt-openapi generate` the types, validators and routes from it.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

/** The {{name}} API. */
@service(#{ title: "{{name}}" })
@operationIds
namespace Api;

/** Someone who uses the API. */
model User {
  @visibility(Lifecycle.Read)
  id: uuid;

  @minLength(1)
  @maxLength(80)
  name: string;

  email: email;

  ...Timestamps;
}

/** What the user list filters on. */
model UserFilters {
  /** Users of this name. */
  @query
  name?: string;
}

// Verbs @operationIds completes: list is listUsers, get is getUser.
@route("/users")
@tag("Users")
interface Users {
  /** One page of the users, filtered and sorted. */
  @get
  list(
    ...UserFilters,
    ...PageParameters,
    ...SortParameters<"name" | "createdAt">,
  ): Page<User> | ListErrors;

  /** One user. */
  @get
  get(@path id: uuid): User | GetErrors;

  /** Creates a user. */
  @post
  create(@body user: CreateRequest<User>): {
    @statusCode _: 201;
    @body user: User;
  } | CreateErrors;

  /** Updates a user with a merge patch. */
  @patch
  update(
    @path id: uuid,
    @body user: PatchRequest<User>,
  ): User | UpdateErrors;

  /** Deletes a user. */
  @delete
  delete(@path id: uuid): NoContentResponse | DeleteErrors;
}

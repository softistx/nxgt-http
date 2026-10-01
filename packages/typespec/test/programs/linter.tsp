// The recommended rules: a list that returns an array, an error reply
// without the nxgt envelope, and a service without @operationIds. Pages,
// the library's errors, a reply without a body and a marked service pass.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds
namespace Shop {
  model User {
    id: uuid;
  }

  model Oops {
    @statusCode _: 418;
    @body body: { reason: string };
  }

  @route("/users")
  interface Users {
    @get list(...PageParameters): Page<User> | BadRequest;
    @get @route("/all") listAll(): User[];
    @get @route("/search") searchUsers(...CursorPageParameters): CursorPage<User>;
    @get @route("/lists") listing(): User[];
    @get @route("/{id}") get(@path id: uuid): User | NotFound | AuthenticationRequired;
    @post create(@body user: User): User | Oops;
  }
}

@service
namespace Legacy {
  @route("/health") @get op health(): void;
}

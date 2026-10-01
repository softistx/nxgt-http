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

  model TeapotBody extends ErrorBody<418> {
    reason: string;
  }

  @error
  model Teapot {
    @statusCode _: 418;
    @body body: TeapotBody;
  }

  @error
  model Failure {
    @minValue(500) @maxValue(599) @statusCode code: int32;
    @body body: { reason: string };
  }

  @error
  model Anything {
    reason: string;
  }

  op listTemplate<Item>(): Item[];

  interface Listable<Item> {
    @get list(): Item[];
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
    @get @route("/list_all") list_all(): User[];
    @get @route("/teapot") brew(): User | Teapot;
    @get @route("/fail") fail(): User | Failure;
    @get @route("/any") any(): User | Anything;
  }

  @route("/listed") @get op listPets is listTemplate<User>;
}

@operationIds
namespace Admin {
  @service
  namespace Billing {
    @route("/invoices") @get op listInvoices(...PageParameters): Page<string>;
  }
}

@service
namespace Legacy {
  @route("/health") @get op health(): void;
}

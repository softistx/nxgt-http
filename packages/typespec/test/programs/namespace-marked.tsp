// @operationIds on the service namespace: every operation in it, however
// deep, is named as written; an interface extending a template instance too.
// An operation's own @operationId wins. A namespace beside it is not marked.
import "@typespec/http";
import "@typespec/openapi";
import "@nxgt/typespec";

using Http;
using OpenAPI;
using Nxgt;

@service
@operationIds
namespace Shop {
  model Toy {
    name: string;
  }

  @route("/health")
  @get
  op health(): void;

  @route("/pets")
  interface Pets {
    @get findPetToys(): Toy[];
    @get @route("/{name}") @operationId("fetchPet") readPet(@path name: string): Toy;
  }

  namespace Admin {
    @route("/admin/orders")
    interface Orders {
      @get listOrders(): string[];
    }
  }

  interface Listable<Item> {
    @get listAll(): Item[];
  }

  @route("/toys")
  interface Toys extends Listable<Toy> {}
}

namespace Elsewhere {
  interface Legacy {
    @get all(): string[];
  }
}

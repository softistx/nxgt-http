// @operationIds on the service namespace: every operation in it, however
// deep, is named as written; an interface extending a template instance, and
// an operation declared from an operation template, too, never the template's
// instances. An operation's own @operationId wins. A namespace beside it is
// not marked, and another service may reuse a name. A marked namespace
// outside every service is in no document: its names never collide.
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

  model Pet {
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

  op Read<T>(): T;

  @route("/toys/first")
  @get
  op readFirstToy is Read<Toy>;

  @route("/pets/first")
  @get
  op readFirstPet is Read<Pet>;
}

@service
@operationIds
namespace Backoffice {
  @route("/backoffice/health")
  @get
  op health(): void;
}

namespace Elsewhere {
  interface Legacy {
    @get all(): string[];
  }
}

@operationIds
namespace Scratch {
  @route("/scratch/one")
  @get
  op health(): void;
}

@operationIds
namespace Draft {
  @route("/draft/one")
  @get
  op health(): void;
}

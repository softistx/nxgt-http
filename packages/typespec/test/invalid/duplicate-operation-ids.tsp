// Two interfaces named Pets, in two namespaces: @operationIds would name both
// operations listPets.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

namespace Store {
  @route("/store/pets")
  @operationIds
  interface Pets {
    @get list(): string[];
  }
}

namespace Shelter {
  @route("/shelter/pets")
  @operationIds
  interface Pets {
    @get list(): string[];
  }
}

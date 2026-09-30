// One name in two interfaces, in two namespaces: the namespace is not part
// of the id, so both would be listPets.
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
    @get listPets(): string[];
  }
}

namespace Shelter {
  @route("/shelter/pets")
  @operationIds
  interface Pets {
    @get listPets(): string[];
  }
}

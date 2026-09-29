// No @operationIds: importing the library leaves every id to the emitter and
// its operation-id-strategy.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

namespace Admin {
  @route("/admin/pets")
  interface Pets {
    @get list(): string[] | NotFound;
  }
}

@route("/all")
@get
op all(): string[];

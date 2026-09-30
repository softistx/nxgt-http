// Legacy is not marked, but its @operationId takes the id @operationIds gives
// Pets.listPets.
import "@typespec/http";
import "@typespec/openapi";
import "@nxgt/typespec";

using Http;
using OpenAPI;
using Nxgt;

@service
namespace Shop;

@route("/legacy/pets")
interface Legacy {
  @get @operationId("listPets") all(): string[];
}

@route("/pets")
@operationIds
interface Pets {
  @get listPets(): string[];
}

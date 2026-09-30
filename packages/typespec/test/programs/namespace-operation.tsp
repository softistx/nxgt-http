// An unmarked operation in the service namespace is named after itself by the
// emitter, listPets: the id @operationIds gives Pets.listPets.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

@route("/all-pets")
@get
op listPets(): string[];

@route("/pets")
@operationIds
interface Pets {
  @get listPets(): string[];
}

// An operation outside an interface is named after itself, listPets: the id
// @operationIds gives Pets.list.
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
  @get list(): string[];
}

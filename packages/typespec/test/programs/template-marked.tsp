// @operationIds on an interface template: each interface extending an
// instance names the operations as written; the instances themselves never.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

model Pet {
  name: string;
}

@operationIds
interface Listable<Item> {
  @get listAll(): Item[];
}

@route("/pets")
interface Pets extends Listable<Pet> {}

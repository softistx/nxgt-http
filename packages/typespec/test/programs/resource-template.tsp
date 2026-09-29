// @operationIds on a template: each interface extending an instance names its
// operations after itself, listPets and listOrders.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

model Pet { name: string; }
model Order { total: integer; }

@operationIds
interface Resource<Item> {
  @get list(): Item[];
}

@route("/pets")
interface Pets extends Resource<Pet> {}

@route("/orders")
interface Orders extends Resource<Order> {}

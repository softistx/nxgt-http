// Actors<integer>, for a table whose actors are actors('integer').
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

model Order {
  total: integer;
  ...Actors<integer>;
}

@route("/orders")
@get
op listOrders(): Order[];

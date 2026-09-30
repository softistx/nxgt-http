// `singular` names an interface's resource: a namespace has none.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds(#{ singular: "User" })
namespace Shop;

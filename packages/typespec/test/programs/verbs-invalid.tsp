// A verb takes "singular" or "plural", nothing else.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds(#{ verbs: #{ archive: "bogus" } })
namespace Shop;

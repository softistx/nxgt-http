// Resource with Id = integer, for a table whose id is id('identity'), and an
// item named by its @friendlyName.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

@friendlyName("Label")
model Tag {
  @visibility(Lifecycle.Read)
  id: integer;

  name: string;
}

@route("/tags")
interface Tags extends Resource<Tag, Id = integer> {}

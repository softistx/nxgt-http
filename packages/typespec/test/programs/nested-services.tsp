// A service nested in another is in the outer service's document too: one
// name in both is a duplicate.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds
namespace Outer {
  @route("/health")
  @get
  op health(): void;

  @service
  namespace Inner {
    @route("/inner/health")
    @get
    op health(): void;
  }
}

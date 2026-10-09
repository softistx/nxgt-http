// A POST marked @queryMethod is a QUERY: x-nxgt-method on the operation, and
// its verb checked as a QUERY's, which search and query take and the others
// do not. Marked on anything but a POST, it is an error. The mark follows an
// operation into an interface that extends its own, a template's instance,
// and an `op is`.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds
namespace Shop {
  @route("/users")
  interface Users {
    @post @queryMethod @route("/search") search(@body names: string[]): string[];
    @post @queryMethod @route("/query") query(@body names: string[]): string[];
    @post @queryMethod @route("/find") findById(@body id: string): string;
    @post @queryMethod create(@body name: string): string;
    @get @queryMethod list(): string[];
  }

  @post @queryMethod @route("/lookup") op lookUp(@body id: string): string;
  @route("/lookup-again") op lookUpAgain is lookUp;

  interface Searchable {
    @post @queryMethod @route("/search") search(@body names: string[]): string[];
  }

  @route("/teams")
  interface Teams extends Searchable {}

  interface Catalog<T> {
    @post @queryMethod @route("/search") search(@body names: T[]): T[];
  }

  @route("/books")
  interface Books extends Catalog<string> {}
}

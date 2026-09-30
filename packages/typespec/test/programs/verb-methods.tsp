// Each verb sent with a method it names passes; a verb sent with another is
// warned of. A verb `verbs` adds, a name that is not a verb, and an
// operation outside an interface are not checked. `#suppress` silences one.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds(#{ verbs: #{ archive: "singular" } })
namespace Shop {
  @route("/users")
  interface Users {
    @get list(): string[];
    @head @route("/count") count(): void;
    @post @route("/search") search(@body criteria: string): string[];
    @get @route("/query") query(): string[];
    @post create(@body name: string): string;
    @patch @route("/{id}") update(@path id: string): string;
    @post @route("/{id}/archive") archive(@path id: string): void;
    @delete @route("/many") deleteMany(): void;
    @post @route("/remove") deleteManyByIds(@body ids: string[]): void;
    @post @route("/find") findById(@body id: string): string;
    @post @route("/{id}/replace") replace(@path id: string): string;
    @put @route("/{id}") patch(@path id: string): string;
    @post @route("/active") listActive(): string[];
    #suppress "@nxgt/typespec/verb-method-mismatch" "a legacy route"
    @post @route("/legacy") get(): string;
  }

  @route("/health")
  @post
  op list(): void;
}

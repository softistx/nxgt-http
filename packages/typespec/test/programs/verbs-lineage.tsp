// Verbs through a template and nested namespaces: the verbs are inherited,
// inner over outer; `singular` names only its own interface. A generated id
// beside the same name written is a duplicate.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds(#{ verbs: #{ archive: "plural" } })
namespace Shop {
  model Pet {
    name: string;
  }

  @operationIds(#{ singular: "Thing", verbs: #{ archive: "singular" } })
  interface Crud<Item> {
    @post archive(@body item: Item): void;
    @get findById(@path id: string): Item;
  }

  @route("/pets")
  interface Pets extends Crud<Pet> {}

  @route("/staff")
  interface Staff {
    @post archive(): void;
  }

  @operationIds(#{ verbs: #{ archive: "singular" } })
  namespace Inner {
    @route("/users")
    interface Users {
      @post archive(): void;
      @get list(): string[];
      @get @route("/all") listUsers(): string[];
    }
  }
}

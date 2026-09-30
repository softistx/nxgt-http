// The verbs @operationIds completes with an interface's resource: its name,
// and its singular by the English rule or `singular`. A namespace's verbs
// reach every interface in it; an interface's own override them. Outside an
// interface, and for any other name, the id is the name as written.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds(#{ verbs: #{ archive: "singular", export: "plural" } })
namespace Shop {
  @route("/users")
  interface Users {
    @get list(): string[];
    @get @route("/read") read(): string[];
    @get @route("/find") find(): string[];
    @get @route("/search") search(): string[];
    @get @route("/count") count(): int32;
    @post @route("/many") createMany(): void;
    @patch @route("/many") updateMany(): void;
    @delete @route("/many") deleteMany(): void;
    @get @route("/{id}") get(@path id: string): string;
    @post create(): string;
    @put @route("/{id}") update(@path id: string): string;
    @patch @route("/{id}") patch(@path id: string): string;
    @put @route("/{id}/replace") replace(@path id: string): string;
    @put @route("/upsert") upsert(): string;
    @delete @route("/{id}") delete(@path id: string): void;
    @get @route("/by-id/{id}") findById(@path id: string): string;
    @get @route("/by-email/{email}") getByEmail(@path email: string): string;
    @post @route("/{id}/archive") archive(@path id: string): void;
    @get @route("/export") export(): string[];
    @get @route("/active") findActiveUsers(): string[];
  }

  @route("/categories")
  interface Categories {
    @post create(): string;
  }

  @route("/addresses")
  interface Addresses {
    @post create(): string;
  }

  @route("/statuses")
  interface Statuses {
    @post create(): string;
  }

  @route("/people")
  interface People {
    @post create(): string;
  }

  @route("/staff")
  @operationIds(#{ singular: "Member", verbs: #{ export: "singular" } })
  interface Staff {
    @post create(): string;
    @get export(): string;
  }

  @route("/health")
  @get
  op list(): void;
}

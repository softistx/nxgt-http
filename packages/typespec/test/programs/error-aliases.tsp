// Each verb's error alias, used in an operation's return type.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

model User {
  id: uuid;
}

@route("/users")
interface Users {
  @get list(...PageParameters): Page<User> | ListErrors;
  @get get(@path id: uuid): User | GetErrors;
  @post create(@body user: User): User | CreateErrors;
  @patch update(@path id: uuid, @body user: User): User | UpdateErrors;
  @delete delete(@path id: uuid): NoContentResponse | DeleteErrors;
  @get @route("/me") me(): User | AuthErrors;
}

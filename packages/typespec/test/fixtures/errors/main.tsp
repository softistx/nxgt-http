import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Errors" })
namespace ErrorsFixture;

model Article {
  id: string;
  title: string;
}

@route("/articles/{id}")
interface Articles {
  @get read(@path id: string): Article | NotFound | Unauthorized | Forbidden;
  @put update(@path id: string, @body article: Article): Article | BadRequest | Conflict | UnprocessableEntity | TooManyRequests | InternalServerError | ErrorResponse<503>;
}

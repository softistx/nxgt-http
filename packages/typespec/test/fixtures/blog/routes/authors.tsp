import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/authors")
@tag("Authors")
interface Authors {
  @get list(): Author[] | Unauthorized;
  @get read(@path @format("uuid") authorId: string): Author | NotFound;
  @post create(@body author: Create<Author>): {
    @statusCode _: 201;
    @body author: Author;
  } | BadRequest | Conflict;
}

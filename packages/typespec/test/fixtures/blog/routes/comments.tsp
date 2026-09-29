import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

/** Comments live under their post. */
@route("/posts/{postId}/comments")
@tag("Comments")
@operationIds
interface Comments {
  @get list(@path @format("uuid") postId: string): Comment[] | NotFound;
  @post create(
    @path @format("uuid") postId: string,
    @body comment: Create<Comment>,
  ): {
    @statusCode _: 201;
    @body comment: Comment;
  } | BadRequest | NotFound | TooManyRequests;
  @delete delete(
    @path @format("uuid") postId: string,
    @path @format("uuid") commentId: string,
  ): NoContentResponse | NotFound | Forbidden;
}

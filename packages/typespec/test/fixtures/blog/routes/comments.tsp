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
  @get list(
    @path postId: uuid,
    ...CursorPageParameters,
  ): CursorPage<Comment> | BadRequest | NotFound;
  @post create(
    @path postId: uuid,
    @body comment: Create<Comment>,
  ): {
    @statusCode _: 201;
    @body comment: Comment;
  } | BadRequest | NotFound | TooManyRequests;
  // permission() answers each refusal without a body.
  @useAuth(JanusAuth)
  @delete delete(
    @path postId: uuid,
    @path commentId: uuid,
  ): NoContentResponse | AuthenticationRequired | AccessDenied | ErrorWithoutBody<404>;
}

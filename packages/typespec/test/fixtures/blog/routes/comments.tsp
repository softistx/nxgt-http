import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

/** Comments live under their post. */
@route("/posts/{postId}/comments")
@tag("Comments")
interface Comments {
  @get findPostComments(
    @path postId: uuid,
    ...CursorPageParameters,
  ): CursorPage<Comment> | BadRequest | NotFound;
  @post createPostComment(
    @path postId: uuid,
    @body comment: Create<Comment>,
  ): {
    @statusCode _: 201;
    @body comment: Comment;
  } | BadRequest | NotFound | TooManyRequests;
  // permission() answers each refusal without a body.
  @useAuth(JanusAuth)
  @delete deletePostComment(
    @path postId: uuid,
    @path commentId: uuid,
  ): NoContentResponse | AuthenticationRequired | AccessDenied | ErrorWithoutBody<404>;
}

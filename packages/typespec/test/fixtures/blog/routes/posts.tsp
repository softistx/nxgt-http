import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts")
@tag("Posts")
interface Posts {
  @get listPosts(
    @query status?: PostStatus,
    @query authorId?: uuid,
    ...PageParameters,
  ): Page<Post>;
  @get getPost(@path postId: uuid): Post | NotFound;
  // session({ required: true }) refuses a missing session; the handler, a user
  // who may not write, with the envelope.
  @useAuth(JanusAuth)
  @post createPost(...IdempotencyKeyHeader, @body post: CreateRequest<Post>): {
    @statusCode _: 201;
    ...IdempotentReplayedHeader;
    ...RateLimitHeaders;
    @body post: Post;
  } | BadRequest | AuthenticationRequired | Forbidden | IdempotencyInProgress | IdempotencyKeyReused | TooManyRequests;
  @put updatePost(
    @path postId: uuid,
    @body post: UpdateRequest<Post>,
  ): Post | BadRequest | NotFound | Conflict;
  @patch patchPost(
    @path postId: uuid,
    @body post: PatchRequest<Post>,
  ): Post | BadRequest | NotFound | Conflict;
  @delete deletePost(@path postId: uuid): NoContentResponse | NotFound | Forbidden;
}

import "@typespec/http";
import "@nxgt/typespec";
import "@typespec/openapi";

using Http;
using Nxgt;
using OpenAPI;

namespace Blog;

@route("/posts")
@tag("Posts")
@operationIds
interface Posts {
  @get list(
    @query status?: PostStatus,
    @query authorId?: uuid,
    ...PageParameters,
  ): Page<Post>;
  @get @operationId("getPost") read(@path postId: uuid): Post | NotFound;
  // session({ required: true }) refuses a missing session; the handler, a user
  // who may not write, with the envelope.
  @useAuth(JanusAuth)
  @post create(...IdempotencyKeyHeader, @body post: Create<Post>): {
    @statusCode _: 201;
    ...IdempotentReplayedHeader;
    ...RateLimitHeaders;
    @body post: Post;
  } | BadRequest | AuthenticationRequired | Forbidden | IdempotencyInProgress | IdempotencyKeyReused | TooManyRequests;
  @patch update(
    @path postId: uuid,
    @body post: MergePatchUpdate<Post>,
  ): Post | BadRequest | NotFound | Conflict;
  @delete delete(@path postId: uuid): NoContentResponse | NotFound | Forbidden;
}

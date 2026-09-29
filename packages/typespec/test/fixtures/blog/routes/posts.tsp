import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts")
@tag("Posts")
interface Posts {
  @get list(@query status?: PostStatus, @query authorId?: string): Post[];
  @get read(@path @format("uuid") postId: string): Post | NotFound;
  @post create(@body post: Create<Post>): {
    @statusCode _: 201;
    @body post: Post;
  } | BadRequest | Unauthorized | Forbidden;
  @patch update(
    @path @format("uuid") postId: string,
    @body post: MergePatchUpdate<Post>,
  ): Post | BadRequest | NotFound | Conflict;
  @delete delete(@path @format("uuid") postId: string): NoContentResponse | NotFound | Forbidden;
}

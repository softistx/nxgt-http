// Drafts extends Posts, whose read has its own @operationId: extends copies
// it, and both would be getPost.
import "@typespec/http";
import "@typespec/openapi";
import "@nxgt/typespec";

using Http;
using OpenAPI;
using Nxgt;

@service
namespace Blog;

@route("/posts")
@operationIds
interface Posts {
  @get @operationId("getPost") read(@path postId: string): string;
}

@route("/drafts")
@operationIds
interface Drafts extends Posts {}

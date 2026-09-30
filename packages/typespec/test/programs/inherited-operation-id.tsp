// Drafts extends Posts: extends copies each operation, and its name, so both
// would be readPost.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
@operationIds
namespace Blog;

@route("/posts")
interface Posts {
  @get readPost(@path postId: string): string;
}

@route("/drafts")
interface Drafts extends Posts {}

// A blog API split across files, as a spec grows: one file per resource's
// models, one per resource's routes, and this file, which only assembles them.
import "@typespec/http";
import "./models/author.tsp";
import "./models/post.tsp";
import "./models/comment.tsp";
import "./routes/authors.tsp";
import "./routes/posts.tsp";
import "./routes/comments.tsp";

using Http;

@service(#{ title: "Blog" })
@server("https://api.example.com", "Production")
namespace Blog;

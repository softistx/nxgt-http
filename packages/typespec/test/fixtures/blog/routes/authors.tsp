import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

/** What the author list filters on. */
model AuthorFilters {
  /** Authors of this name. */
  @query
  name?: string;
}

@route("/authors")
@tag("Authors")
interface Authors
  extends Resource<Author, AuthorFilters, SortField = "name" | "createdAt"> {}

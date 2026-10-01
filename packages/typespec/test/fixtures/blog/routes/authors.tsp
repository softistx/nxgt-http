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

// Verbs @operationIds completes: list is listAuthors, get is getAuthor.
@route("/authors")
@tag("Authors")
interface Authors {
  /** One page of the authors, filtered and sorted. */
  @get
  list(
    ...AuthorFilters,
    ...PageParameters,
    ...SortParameters<"name" | "createdAt">,
  ): Page<Author>;

  /** One author. */
  @get
  get(@path id: uuid): Author | GetErrors;

  /** Creates an author. */
  @post
  create(@body author: Create<Author>): {
    @statusCode _: 201;
    @body author: Author;
  } | CreateErrors;

  /** Updates an author with a merge patch. */
  @patch
  update(
    @path id: uuid,
    @body author: MergePatchUpdate<Author>,
  ): Author | UpdateErrors;

  /** Deletes an author. */
  @delete
  delete(@path id: uuid): NoContentResponse | DeleteErrors;
}

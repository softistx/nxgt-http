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
interface Authors {
  /** One page of the authors, filtered and sorted. */
  @get
  listAuthors(
    ...AuthorFilters,
    ...PageParameters,
    ...SortParameters<"name" | "createdAt">,
  ): Page<Author>;

  /** One author. */
  @get
  getAuthor(@path id: uuid): Author | NotFound;

  /** Creates an author. */
  @post
  createAuthor(@body author: Create<Author>): {
    @statusCode _: 201;
    @body author: Author;
  } | BadRequest | Conflict;

  /** Updates an author with a merge patch. */
  @patch
  updateAuthor(
    @path id: uuid,
    @body author: MergePatchUpdate<Author>,
  ): Author | BadRequest | NotFound | Conflict;

  /** Deletes an author. */
  @delete
  deleteAuthor(@path id: uuid): NoContentResponse | NotFound;
}

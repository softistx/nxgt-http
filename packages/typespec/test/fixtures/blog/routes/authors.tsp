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

/** What an author search looks for. */
model AuthorCriteria {
  /** Authors with one of these names. */
  names: string[];
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

  /**
   * The authors matching criteria too long for a query string: a QUERY, sent
   * as a POST.
   */
  @post
  @queryMethod
  @route("/search")
  search(@body criteria: AuthorCriteria): Page<Author> | BadRequest;

  /** One author. */
  @get
  get(@path id: uuid): Author | GetErrors;

  /** Creates an author. */
  @post
  create(@body author: CreateRequest<Author>): {
    @statusCode _: 201;
    @body author: Author;
  } | CreateErrors;

  /** Replaces an author: the whole body, as a `PUT` sends it. */
  @put
  update(
    @path id: uuid,
    @body author: UpdateRequest<Author>,
  ): Author | UpdateErrors;

  /** Updates some of an author's properties, with a merge patch. */
  @patch
  patch(
    @path id: uuid,
    @body author: PatchRequest<Author>,
  ): Author | UpdateErrors;

  /** Deletes an author. */
  @delete
  delete(@path id: uuid): NoContentResponse | DeleteErrors;
}

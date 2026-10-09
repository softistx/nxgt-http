// A search too long for a query string, marked @queryMethod and emitted by
// the emitter @nxgt/typespec: a real QUERY in OpenAPI 3.2, a POST marked
// x-nxgt-method: query in 3.1, which has no QUERY.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Library" })
@operationIds
namespace Library;

model Book {
  @visibility(Lifecycle.Read) id: uuid;
  title: string;
}

/** What a book search looks for. */
model BookCriteria {
  /** Books with one of these titles. */
  titles: string[];
}

@route("/books")
interface Books {
  /** The books matching criteria too long for a query string. */
  @post
  @queryMethod
  @route("/search")
  search(@body criteria: BookCriteria): Page<Book> | BadRequest;

  /** Creates a book: a POST, unmarked, in both versions. */
  @post
  create(@body book: CreateRequest<Book>): {
    @statusCode _: 201;
    @body book: Book;
  } | BadRequest;
}

// Two resources of one item: `Resource` names read, create, update and
// delete after the item, so both interfaces would have `readAuthor`.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Blog;

model Author {
  @visibility(Lifecycle.Read)
  id: uuid;

  name: string;
}

@route("/authors")
interface Authors extends Resource<Author> {}

@route("/archived-authors")
interface ArchivedAuthors extends Resource<Author> {}

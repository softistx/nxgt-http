// How `Resource` names its item operations: after the item, but after the
// interface where an operation is declared again, and where the item has no
// name of its own.
import "@typespec/http";
import "@typespec/openapi";
import "@nxgt/typespec";

using Http;
using OpenAPI;
using Nxgt;

@service
namespace Blog;

model Author {
  @visibility(Lifecycle.Read)
  id: uuid;

  name: string;
}

model Draft<T> {
  @visibility(Lifecycle.Read)
  id: uuid;

  item: T;
}

// Declared again: `read` after the interface, `update` after its own id.
@route("/authors")
interface Authors extends Resource<Author> {
  @get read(@path id: uuid): Author | NotFound;

  @patch
  @operationId("renameAuthor")
  update(@path id: uuid, @body item: MergePatchUpdate<Author>): Author | NotFound;
}

// An instance: after the interface, not `Draft`.
@route("/drafts")
interface Drafts extends Resource<Draft<Author>> {}

// Anonymous: after the interface, not a bare `read`.
@route("/notes")
interface Notes extends Resource<{
  @visibility(Lifecycle.Read) id: uuid;
  text: string;
}> {}

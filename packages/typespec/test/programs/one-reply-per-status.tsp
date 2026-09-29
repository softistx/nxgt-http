// Replies of one status the emitter would merge: a reply without a body
// beside one with a body, refused, and two bodies, warned. Beside them, what
// it keeps: plain bodies, bodies of two content types, a 204 beside a 200,
// two bodyless replies, and bodies under `*`. A service nested in another is
// checked once.
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service
namespace Shop;

model Pet {
  name: string;
}

model Toy {
  label: string;
}

model PetText {
  @header contentType: "text/plain";
  @body body: string;
}

@route("/pets")
interface Pets {
  // Refused: the guard's 401 and the envelope's.
  @get list(): Pet[] | AuthenticationRequired | Unauthorized;

  // Warned: two bodies of one content type, under the first's description.
  @post create(@body pet: Pet): Pet | IdempotencyInProgress | Conflict;

  // Kept: two plain bodies, one reply whose body is either.
  @get @route("/{name}") read(@path name: string): Pet | Toy | NotFound;

  // Kept: one reply, negotiated between JSON and text.
  @get @route("/{name}/text") text(@path name: string): Pet | PetText;

  // Kept: a 204 beside a 200.
  @put @route("/{name}") replace(@path name: string, @body pet: Pet): Pet | NoContentResponse;

  // Kept: two 204s, nothing to lose.
  @delete @route("/{name}") remove(@path name: string): void | NoContentResponse;

  // Kept: two errors under `*`, one description either way.
  @get @route("/{name}/toys") toys(@path name: string): Toy[] | ShelterError | StoreError;
}

@error
model ShelterError {
  shelter: string;
}

@error
model StoreError {
  store: string;
}

// Refused on each interface extending it, never on the template.
interface Guarded<Item> {
  @get read(@path id: string): Item | AuthenticationRequired | Unauthorized;
}

@route("/toys")
interface Toys extends Guarded<Toy> {}

model ClientError {
  @statusCode @minValue(400) @maxValue(499) _: int32;
}

@service
namespace Back {
  // Refused, once: a range and no body, beside a range with one.
  @route("/stock")
  @get
  op stock(): string[] | ClientError | {
    @statusCode @minValue(400) @maxValue(499) _: int32;
    @body body: string;
  };
}

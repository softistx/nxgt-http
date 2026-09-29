// Two replies of one status, which the emitter would merge, beside the
// unions it keeps: plain bodies, and bodies of two content types.
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

  // Refused: two envelopes of one content type.
  @post create(@body pet: Pet): Pet | IdempotencyInProgress | Conflict;

  // Kept: two plain bodies, one reply whose body is either.
  @get @route("/{name}") read(@path name: string): Pet | Toy | NotFound;

  // Kept: one reply, negotiated between JSON and text.
  @get @route("/{name}/text") text(@path name: string): Pet | PetText;
}

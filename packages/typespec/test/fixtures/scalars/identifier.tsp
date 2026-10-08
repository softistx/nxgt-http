import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model IdentifierScalars {
  guid: guid;
  uuid: uuid;
  uuidV4: uuidV4;
  uuidV7: uuidV7;
}

@route("/identifier") @post op identifier(@body body: IdentifierScalars): IdentifierScalars;

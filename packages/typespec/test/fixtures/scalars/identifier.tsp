import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model IdentifierScalars {
  cuid2: cuid2;
  guid: guid;
  isbn: isbn;
  ksuid: ksuid;
  nanoId: nanoId;
  objectId: objectId;
  semVer: semVer;
  ulid: ulid;
  uuid: uuid;
  uuidV4: uuidV4;
  uuidV7: uuidV7;
  xid: xid;
}

@route("/identifier") @post op identifier(@body body: IdentifierScalars): IdentifierScalars;

import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model StringScalars {
  emoji: emoji;
  nonEmptyString: nonEmptyString;
}

@route("/string") @post op string(@body body: StringScalars): StringScalars;

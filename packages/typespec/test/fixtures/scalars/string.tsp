import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model StringScalars {

}

@route("/string") @post op string(@body body: StringScalars): StringScalars;

import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model NumberScalars {

}

@route("/number") @post op number(@body body: NumberScalars): NumberScalars;

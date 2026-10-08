import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model ColorScalars {

}

@route("/color") @post op color(@body body: ColorScalars): ColorScalars;

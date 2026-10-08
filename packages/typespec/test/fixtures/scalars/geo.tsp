import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model GeoScalars {

}

@route("/geo") @post op geo(@body body: GeoScalars): GeoScalars;

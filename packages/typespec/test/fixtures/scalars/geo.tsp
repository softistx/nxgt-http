import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model GeoScalars {
  latitude: latitude;
  longitude: longitude;
}

@route("/geo") @post op geo(@body body: GeoScalars): GeoScalars;

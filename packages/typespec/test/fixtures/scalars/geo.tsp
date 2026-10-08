import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model GeoScalars {
  latitude: latitude;
  longitude: longitude;
}

@route("/geo") @post op postGeoScalars(@body body: GeoScalars): GeoScalars;

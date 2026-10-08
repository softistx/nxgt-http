import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model NetworkScalars {
  emailAddress: emailAddress;
}

@route("/network") @post op network(@body body: NetworkScalars): NetworkScalars;

import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model NetworkScalars {
  cidrV4: cidrV4;
  cidrV6: cidrV6;
  emailAddress: emailAddress;
  hostname: hostname;
  httpUrl: httpUrl;
  ip: ip;
  ipV4: ipV4;
  ipV6: ipV6;
  mac: mac;
  phoneNumber: phoneNumber;
}

@route("/network") @post op postNetworkScalars(@body body: NetworkScalars): NetworkScalars;

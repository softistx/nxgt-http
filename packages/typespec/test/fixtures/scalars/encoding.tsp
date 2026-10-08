import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model EncodingScalars {
  base64: base64;
  base64Url: base64Url;
  hexadecimal: hexadecimal;
  jwt: jwt;
  sha256: sha256;
  sha512: sha512;
}

@route("/encoding") @post op postEncodingScalars(@body body: EncodingScalars): EncodingScalars;

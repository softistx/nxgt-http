import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model ColorScalars {
  hexColorCode: hexColorCode;
  hsl: hsl;
  hsla: hsla;
  rgb: rgb;
  rgba: rgba;
}

@route("/color") @post op color(@body body: ColorScalars): ColorScalars;

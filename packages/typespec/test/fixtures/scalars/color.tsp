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

@route("/color") @post op postColorScalars(@body body: ColorScalars): ColorScalars;

import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model NumberScalars {
  bigInt: bigInt;
  long: long;
  negativeFloat: negativeFloat;
  negativeInt: negativeInt;
  nonNegativeFloat: nonNegativeFloat;
  nonNegativeInt: nonNegativeInt;
  nonPositiveFloat: nonPositiveFloat;
  nonPositiveInt: nonPositiveInt;
  port: port;
  positiveFloat: positiveFloat;
  positiveInt: positiveInt;
  safeInt: safeInt;
}

@route("/number") @post op number(@body body: NumberScalars): NumberScalars;

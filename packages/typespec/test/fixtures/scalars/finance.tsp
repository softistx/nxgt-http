import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model FinanceScalars {
  currency: currency;
  iban: iban;
}

@route("/finance") @post op postFinanceScalars(@body body: FinanceScalars): FinanceScalars;

import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model LocaleScalars {
  countryCode: countryCode;
<<<<<<< HEAD
  locale: Nxgt.locale;
=======
  locale: locale;
>>>>>>> feat/typespec-scalars-c
}

@route("/locale") @post op postLocaleScalars(@body body: LocaleScalars): LocaleScalars;

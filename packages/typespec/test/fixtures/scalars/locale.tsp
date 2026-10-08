import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model LocaleScalars {
  countryCode: countryCode;
  locale: locale;
}

@route("/locale") @post op postLocaleScalars(@body body: LocaleScalars): LocaleScalars;

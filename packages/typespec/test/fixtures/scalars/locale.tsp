import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model LocaleScalars {
  countryCode: countryCode;
  locale: Nxgt.locale;
}

@route("/locale") @post op locale(@body body: LocaleScalars): LocaleScalars;

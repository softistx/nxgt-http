import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model LocaleScalars {

}

@route("/locale") @post op locale(@body body: LocaleScalars): LocaleScalars;

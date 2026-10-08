import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model DateTimeScalars {

}

@route("/date-time") @post op dateTime(@body body: DateTimeScalars): DateTimeScalars;

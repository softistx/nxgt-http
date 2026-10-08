import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model ValueScalars {

}

@route("/value") @post op value(@body body: ValueScalars): ValueScalars;

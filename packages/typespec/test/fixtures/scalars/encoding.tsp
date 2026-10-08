import "@typespec/http";

using Http;
using Nxgt;

namespace ScalarsFixture;

model EncodingScalars {

}

@route("/encoding") @post op encoding(@body body: EncodingScalars): EncodingScalars;

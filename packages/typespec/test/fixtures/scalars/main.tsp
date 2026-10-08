// One model per category holding every scalar of lib/scalars/, each property
// named after its scalar, echoed by POST /<category>: src/scalars.spec.ts
// sends the registry's samples through the code generated from it.
import "@typespec/http";
import "@nxgt/typespec";
import "./color.tsp";
import "./date-time.tsp";
import "./encoding.tsp";
import "./finance.tsp";
import "./geo.tsp";
import "./identifier.tsp";
import "./locale.tsp";
import "./network.tsp";
import "./number.tsp";
import "./string.tsp";

using Http;

@service(#{ title: "Scalars" })
namespace ScalarsFixture;

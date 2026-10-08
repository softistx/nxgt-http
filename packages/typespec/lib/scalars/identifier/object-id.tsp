import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A MongoDB ObjectId as text: 24 hexadecimal digits, in any case, kept as sent.
 *
 * Specified by https://www.mongodb.com/docs/manual/reference/method/ObjectId/.
 */
@friendlyName("ObjectID")
@format("object-id")
@pattern("^[0-9a-fA-F]{24}$")
@extension("x-nxgt-scalar", "ObjectID")
scalar objectId extends string;

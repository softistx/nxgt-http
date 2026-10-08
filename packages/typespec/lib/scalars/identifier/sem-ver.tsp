import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A Semantic Versioning 2.0.0 version, as semver.org's own regular expression
 * reads it: `1.2.3`, `1.0.0-rc.1+build.5`. No `v` prefix.
 *
 * Specified by https://semver.org/spec/v2.0.0.html.
 */
@friendlyName("SemVer")
@format("sem-ver")
@pattern("^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$")
@extension("x-nxgt-scalar", "SemVer")
scalar semVer extends string;

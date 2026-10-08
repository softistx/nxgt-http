import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A date and a time on the wall clock, with no offset, not even `Z`: `2024-03-10T10:15:30`.
 * The seconds are optional. An impossible day is refused.
 */
@friendlyName("LocalDateTime")
@format("local-date-time")
@pattern("^(?:\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|02-(?:0[1-9]|1\\d|2[0-8]))|(?:\\d\\d(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)T(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?$")
@extension("x-nxgt-scalar", "LocalDateTime")
scalar localDateTime extends string;

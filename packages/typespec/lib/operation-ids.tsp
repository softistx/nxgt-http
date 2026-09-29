import "@typespec/openapi";

using TypeSpec.Reflection;

namespace Nxgt;

/**
 * Names each operation of the interface after its method and the interface,
 * `<operation><Interface>`: `list` in `interface Pets` becomes `listPets`. An
 * operation with its own `@operationId` keeps it.
 *
 * @example
 * ```typespec
 * @operationIds
 * interface Pets {
 *   @get list(): Pet[];
 * }
 * ```
 */
extern dec operationIds(target: Interface);

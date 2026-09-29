import "@typespec/openapi";

using TypeSpec.Reflection;

namespace Nxgt;

/**
 * Names each operation of the interface after its method and the interface,
 * `<operation><Interface>`: `list` in `interface Pets` becomes `listPets`. An
 * operation with its own `@operationId` keeps it. An interface extending a
 * marked one, or an instance of a marked template, is named after itself. An
 * id another operation has is an error, `duplicate-operation-id`.
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

namespace Private {
  /**
   * Names the operation after `item`, `<operation><Item>`, where
   * `@operationIds` names it. `Resource`'s alone: not public.
   */
  extern dec itemOperation(target: Operation, item: Model);
}

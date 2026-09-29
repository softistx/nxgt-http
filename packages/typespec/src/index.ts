/**
 * The JavaScript side of the `@nxgt/typespec` library: the TypeSpec compiler
 * loads it beside `lib/main.tsp`. The conventions themselves are in `lib/`.
 */
import { createTypeSpecLibrary } from '@typespec/compiler';

export const $lib = createTypeSpecLibrary({
	name: '@nxgt/typespec',
	diagnostics: {},
});

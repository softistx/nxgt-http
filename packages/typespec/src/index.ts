/**
 * The JavaScript side of the `@nxgt/typespec` library, which `lib/main.tsp`
 * imports from `dist/`: its name and diagnostics, and the decorators a
 * template cannot express. The conventions themselves are in `lib/`.
 */
import { createTypeSpecLibrary } from '@typespec/compiler';

export const $lib = createTypeSpecLibrary({
	name: '@nxgt/typespec',
	diagnostics: {},
});

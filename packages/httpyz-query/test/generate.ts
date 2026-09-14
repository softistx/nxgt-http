/**
 * Writes the fixture's generated code under `test/generated/`, which git
 * ignores, for the specs of `./openapi`. The `test` and `typecheck` scripts
 * run this first.
 */
import { fileURLToPath } from 'node:url';
import { generate } from '@nxgt/openapi-codegen';

const cwd = fileURLToPath(new URL('./', import.meta.url));
await generate(
	{ input: 'fixtures/openapi.yaml', output: 'generated' },
	{ cwd },
);
// The same spec with `dates: 'date'`, for a client that decodes its replies.
await generate(
	{ input: 'fixtures/openapi.yaml', output: 'generated/dates', dates: 'date' },
	{ cwd },
);

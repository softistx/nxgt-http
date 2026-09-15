/**
 * Writes the fixture's generated code under `test/generated/`, which git
 * ignores. The Nuxt app in `test/app` serves it with openapi-hono and calls
 * it with `useApi()`. The `test` and `typecheck` scripts run this first.
 */
import { fileURLToPath } from 'node:url';
import { generate } from '@nxgt/openapi-codegen';

const cwd = fileURLToPath(new URL('./', import.meta.url));
await generate(
	{ input: 'fixtures/openapi.yaml', output: 'generated', hono: true },
	{ cwd },
);

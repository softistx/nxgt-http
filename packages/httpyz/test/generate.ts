/**
 * Writes the fixture's generated code under `test/generated/`, which git
 * ignores. The specs serve it with Hono and call it with the client, so both
 * ends read the same spec. The `test` and `typecheck` scripts run this first.
 */
import { fileURLToPath } from 'node:url';
import { generate } from '@nxgt/openapi-codegen';

const cwd = fileURLToPath(new URL('./', import.meta.url));
await generate(
	{ input: 'fixtures/openapi.yaml', output: 'generated', hono: true },
	{ cwd },
);

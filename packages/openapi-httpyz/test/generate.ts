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
// The same spec with `dates: 'date'`, for a client that decodes its replies.
await generate(
	{ input: 'fixtures/openapi.yaml', output: 'generated/dates', dates: 'date' },
	{ cwd },
);
// The codegen's `readOnly` / `writeOnly` fixture, which only the default
// options give views to: bodies leave out `readOnly`, replies `writeOnly`.
await generate(
	{
		input: '../../openapi-codegen/test/fixtures/read-only/openapi.yaml',
		output: 'generated/read-only',
		hono: true,
	},
	{ cwd },
);

/**
 * Real, public specs, vendored under `test/fixtures/conformance/` (sources
 * and licences in its README). Each must generate with only the warnings its
 * document calls for, and every example it gives for a JSON body or reply
 * must pass the validator generated for it. `tsc` checks the code itself.
 */
import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { CONFORMANCE } from '../test/generate';
import type { DiagnosticCode } from './errors';
import { generateFiles } from './generate';
import { HTTP_METHODS } from './ir/types';

type Name = (typeof CONFORMANCE)[number];

/** The warnings each document calls for, and why. */
const WARNINGS: Record<Name, DiagnosticCode[]> = {
	// Webhooks are not generated.
	'redocly-museum': ['ignored'],
	// Callbacks and webhooks are not generated.
	'oai-tictactoe': ['ignored'],
	'oai-webhook': ['ignored'],
	'oai-query-3.2': [],
	// Its operations have no operationId.
	'oai-tags-3.2': ['missing_operation_id'],
};

const fixture = (name: string) =>
	fileURLToPath(
		new URL(
			`../test/fixtures/conformance/${name}/openapi.yaml`,
			import.meta.url,
		),
	);

type Json = { [key: string]: unknown };
const isObject = (value: unknown): value is Json =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** `value`, or what its local `$ref` points at. */
function deref(doc: Json, value: unknown): unknown {
	if (!isObject(value) || typeof value.$ref !== 'string') return value;
	const found = value.$ref
		.replace(/^#\//, '')
		.split('/')
		.map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
		.reduce<unknown>((at, key) => (isObject(at) ? at[key] : undefined), doc);
	return deref(doc, found);
}

/** Every `example`, and every `examples.*.value`, of a media type object. */
function examplesOf(doc: Json, media: unknown): [string, unknown][] {
	if (!isObject(media)) return [];
	const found: [string, unknown][] = [];
	if ('example' in media) found.push(['example', media.example]);
	if (isObject(media.examples)) {
		for (const [key, example] of Object.entries(media.examples)) {
			const resolved = deref(doc, example);
			if (isObject(resolved) && 'value' in resolved) {
				found.push([key, resolved.value]);
			}
		}
	}
	return found;
}

interface Media {
	kind: string;
	schema?: z.ZodType;
}
interface Spec {
	method: string;
	path: string;
	body?: { content: { [mediaType: string]: Media } };
	responses: { [status: number]: { [mediaType: string]: Media } };
}

/** `[where, validator, example]` for every JSON example of the document. */
async function examples(name: Name) {
	const doc = Bun.YAML.parse(await Bun.file(fixture(name)).text()) as Json;
	const { operations } = (await import(
		`../test/generated/conformance/${name}/operations.ts`
	)) as { operations: { [id: string]: Spec } };
	const byRoute = new Map(
		Object.values(operations).map((op) => [`${op.method} ${op.path}`, op]),
	);
	const checks: [string, z.ZodType, unknown][] = [];
	for (const [path, item] of Object.entries((doc.paths ?? {}) as Json)) {
		if (!isObject(item)) continue;
		for (const method of HTTP_METHODS) {
			const operation = item[method];
			const spec = byRoute.get(`${method} ${path}`);
			if (!isObject(operation) || !spec) continue;
			const body = deref(doc, operation.requestBody);
			const content =
				isObject(body) && isObject(body.content) ? body.content : {};
			for (const [type, media] of Object.entries(content)) {
				const validator = spec.body?.content[type];
				if (validator?.kind !== 'json' || !validator.schema) continue;
				for (const [key, example] of examplesOf(doc, media)) {
					checks.push([
						`${method} ${path} body ${key}`,
						validator.schema,
						example,
					]);
				}
			}
			const responses = isObject(operation.responses)
				? operation.responses
				: {};
			for (const [status, response] of Object.entries(responses)) {
				const reply = deref(doc, response);
				if (!isObject(reply) || !isObject(reply.content)) continue;
				for (const [type, media] of Object.entries(reply.content)) {
					const validator = spec.responses[Number(status)]?.[type];
					if (validator?.kind !== 'json' || !validator.schema) continue;
					for (const [key, example] of examplesOf(doc, media)) {
						checks.push([
							`${method} ${path} ${status} ${key}`,
							validator.schema,
							example,
						]);
					}
				}
			}
		}
	}
	return checks;
}

describe('conformance', () => {
	for (const name of CONFORMANCE) {
		it(`generates ${name}, with only the warnings it calls for`, async () => {
			const { files, warnings } = await generateFiles({
				input: fixture(name),
				output: '/unused',
				hono: true,
			});
			expect(files).toHaveLength(5);
			expect([...new Set(warnings.map((w) => w.code))].sort()).toEqual(
				WARNINGS[name],
			);
		});

		it(`accepts every JSON example of ${name}`, async () => {
			const failures = (await examples(name)).flatMap(
				([where, validator, example]) => {
					const result = validator.safeParse(example);
					return result.success
						? []
						: [
								`${where}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
							];
				},
			);
			expect(failures).toEqual([]);
		});
	}
});

/**
 * A request checked before it is sent, by the validators the server runs, on
 * what `@nxgt/openapi-codegen/hono` will read from it: each parameter as the
 * text it travels as, the JSON as it parses, a form as its fields. What the
 * server would refuse is refused here with the same issues, and nothing is
 * sent.
 */
import type { ValidationIssue } from '../errors/errors';
import { absent, fields, text } from '../request/encode';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import type { Input } from './to-request';
import type { RuntimeMedia, RuntimeOperation } from './types';

export async function checkRequest(
	operation: RuntimeOperation,
	input: Input | undefined,
): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];
	const run = async (
		target: ValidationIssue['target'],
		schema: StandardSchemaV1 | undefined,
		value: unknown,
	): Promise<void> => {
		if (!schema) return;
		const result = await check(schema, value, target);
		if (!result.ok) issues.push(...result.issues);
	};
	const { param, query, header } = readParameters(operation, input);
	// In the server's order, so the issues come out in the same one.
	await run('param', operation.param, param);
	await run('query', operation.query, query);
	await run('header', operation.header, header);
	const content = Object.values(operation.body?.content ?? {});
	const schemaOf = (kind: RuntimeMedia['kind']) =>
		content.find((media) => media.kind === kind)?.schema;
	if (input?.json !== undefined) {
		const sent = JSON.stringify(input.json);
		await run(
			'json',
			schemaOf('json'),
			sent === undefined ? undefined : JSON.parse(sent),
		);
	} else if (input?.form !== undefined) {
		await run('form', schemaOf('form'), formFields(input.form));
	} else if (input?.text !== undefined) {
		await run('body', schemaOf('text'), input.text);
	}
	return issues;
}

/** The parameters as the engine reads them: strings, a list as every value. */
function readParameters(
	operation: RuntimeOperation,
	input: Input | undefined,
): Record<'param' | 'query' | 'header', Record<string, unknown>> {
	const read = { param: {}, query: {}, header: {} } as Record<
		'param' | 'query' | 'header',
		Record<string, unknown>
	>;
	for (const parameter of operation.parameters) {
		const { name, list } = parameter;
		if (parameter.in === 'path') {
			const value = input?.param?.[name];
			if (!absent(value)) read.param[name] = text(value);
			continue;
		}
		const value =
			parameter.in === 'query'
				? input?.query?.[name]
				: input?.header?.[name.toLowerCase()];
		if (absent(value)) continue;
		const values = Array.isArray(value) ? value.map(text) : [text(value)];
		if (parameter.in === 'header') {
			// Headers trims what it holds.
			const sent = values.join(',').trim();
			read.header[name.toLowerCase()] = list
				? sent.split(',').map((item) => item.trim())
				: sent;
		} else if (list) {
			read.query[name] = parameter.explode
				? values
				: values.join(',').split(',');
		} else read.query[name] = values.join(',');
	}
	return read;
}

/**
 * A form as Hono's `parseBody({ all: true })` reads it: a field sent once is
 * its value, one sent again or named `x[]` a list, and a `Blob` a `File`.
 */
function formFields(
	form: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const read: Record<string, unknown> = {};
	for (const [name, value] of fields(form)) {
		const item =
			value instanceof Blob && !(value instanceof File)
				? new File([value], 'blob', { type: value.type })
				: value;
		const held = read[name];
		read[name] =
			held === undefined
				? name.endsWith('[]')
					? [item]
					: item
				: Array.isArray(held)
					? [...held, item]
					: [held, item];
	}
	return read;
}

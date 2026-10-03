/** The request side of an `alxia.ts` route: its parameters and its body, read as alxia hands them over. */
import type {
	OperationIR,
	ParamIR,
	ParamLocation,
	SchemaNode,
} from '../../ir/types';
import { paramKey } from '../context';
import { formObject, fromString, valueSchema } from '../operations';
import { propertyKey } from '../printer';
import { expr, withDefault } from '../zod';
import { type Issue, note, type Printing, preferred, scope } from './printing';

/**
 * Whether a parameter's validator takes the string alxia hands it: alxia
 * types the path's parameters as strings, and refuses a schema that takes
 * less. A number or a boolean is read out of text; an enum of strings takes
 * only its values, so it is piped from a string.
 */
function takesString(printing: Printing, node: SchemaNode): boolean {
	const resolved = printing.ctx.resolve(node);
	switch (resolved.kind) {
		case 'string':
		case 'number':
		case 'boolean':
			return true;
		case 'literal':
			return resolved.values.every((value) => typeof value !== 'string');
		case 'union':
			return resolved.variants.every((variant) =>
				takesString(printing, variant),
			);
		default:
			return false;
	}
}

/** One location's parameters, read as alxia hands them over. */
export function paramsObject(
	printing: Printing,
	params: readonly ParamIR[],
	location: ParamLocation,
): string {
	const { ctx } = printing;
	const indent = '\t\t';
	const inner = `${indent}\t`;
	const entries = params.map((param) => {
		const schema = valueSchema(param);
		let value = fromString(
			ctx,
			schema,
			printing.helpers,
			scope(printing, inner),
		);
		if (ctx.resolve(param.schema).kind === 'array') {
			if (location === 'header') {
				printing.locals.add('headerList');
				value = `z.preprocess(headerList, ${value})`;
			} else if (location === 'query') {
				if (param.explode) printing.helpers.add('repeated');
				else printing.locals.add('commas');
				value = `z.preprocess(${param.explode ? 'repeated' : 'commas'}, ${value})`;
			}
		}
		if (location === 'path' && !takesString(printing, schema)) {
			value = `z.string().pipe(${value})`;
		}
		const fallback = param.schema.default;
		if (!param.required) {
			value +=
				fallback === undefined
					? '.optional()'
					: withDefault(ctx, param.schema, fallback.value);
		}
		return `${inner}${propertyKey(paramKey(param))}: ${note(printing, value)},`;
	});
	return note(printing, `z.object({\n${entries.join('\n')}\n${indent}})`);
}

/** The body's schema, read as alxia reads a body: JSON, a form, or text. */
export function bodySchema(
	printing: Printing,
	operation: OperationIR,
	issues: Issue[],
): { text: string; skip?: undefined } | { skip: string } {
	const { ctx } = printing;
	const body = operation.body;
	if (!body) return { skip: 'It has no body' };
	const readable = body.content.filter(
		(m) => m.kind === 'json' || m.kind === 'form' || m.kind === 'text',
	);
	const media = preferred(readable);
	if (!media) {
		const types = body.content.map((m) => m.mediaType).join(', ');
		return {
			skip: `Its body is ${types}, which alxia hands over as bytes, unvalidated: binary bodies and streams are not declared yet`,
		};
	}
	if (body.content.length > 1) {
		const others = body.content
			.filter((m) => m !== media)
			.map((m) => m.mediaType);
		issues.push({
			message: `alxia validates a body with one schema, so it is declared as ${media.mediaType}: a body sent as ${others.join(', ')} is checked against that schema too`,
			at: operation.location,
		});
	}
	const form = ctx.formOf(operation);
	let text: string;
	if (form && form.media === media) {
		text = formObject(
			ctx,
			form.object,
			printing.helpers,
			(indent) => scope(printing, indent),
			'\t\t',
		);
	} else if (media.schema) {
		text = expr(ctx, media.schema, scope(printing, '\t\t'));
		if (media.kind === 'form') {
			issues.push({
				message: `its ${media.mediaType} body is not a flat object, so its fields are not read from text: a number or a boolean sent in the form is refused`,
				at: operation.location,
			});
		}
	} else {
		text = media.kind === 'text' ? 'z.string()' : 'z.unknown()';
	}
	if (!body.required) text += '.optional()';
	return { text: note(printing, text) };
}

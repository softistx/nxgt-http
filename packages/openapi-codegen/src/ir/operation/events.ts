import { child, type Location } from '../../loader/location';
import { isObject } from '../../util';
import { pascalCase } from '../naming';
import type { EventIR, SchemaNode } from '../types';
import { isJsonText } from './media';
import type { OperationState } from './state';

type EventState = Pick<OperationState, 'diagnostics' | 'resolver' | 'schemas'>;

/**
 * The events of an `itemSchema`: an object, or a `oneOf` or `anyOf` of
 * them, each naming its event with a constant `event` and describing its
 * `data`: JSON under `contentMediaType: application/json` and
 * `contentSchema`, text otherwise. An event without `event` is a
 * `message`, as `EventSource` names it.
 */
export function events(
	state: EventState,
	raw: unknown,
	at: Location,
	stem: string,
): EventIR[] | undefined {
	if (raw === undefined) return undefined;
	const found: EventIR[] = [];
	visitEvent(state, found, raw, at, stem);
	return found.length === 0 ? undefined : found;
}

/** Adds to `found` the event `value` declares, or each variant's of a union. */
function visitEvent(
	state: EventState,
	found: EventIR[],
	value: unknown,
	site: Location,
	stem: string,
): void {
	const { value: schema, location } = state.resolver.deref(value, site);
	if (!isObject(schema)) return;
	const union = ['oneOf', 'anyOf'].find((key) => Array.isArray(schema[key]));
	if (union !== undefined) {
		(schema[union] as unknown[]).forEach((variant, index) => {
			visitEvent(state, found, variant, child(location, union, index), stem);
		});
		return;
	}
	const properties = isObject(schema['properties']) ? schema['properties'] : {};
	const propertiesAt = child(location, 'properties');
	const name = eventName(
		state,
		properties['event'],
		child(propertiesAt, 'event'),
	);
	if (name === undefined) {
		state.diagnostics.warning(
			'not_enforced',
			'an event without a constant `event` is not declared: a client passes it to `onUnknownEvent`',
			location,
		);
		return;
	}
	if (found.some((event) => event.name === name)) {
		state.diagnostics.warning(
			'ignored',
			`the event \`${name}\` is declared twice: the first one is kept`,
			location,
		);
		return;
	}
	const data = eventData(
		state,
		properties['data'],
		child(propertiesAt, 'data'),
		`${stem}${pascalCase(name)}Data`,
	);
	found.push({ name, ...(data && { data }) });
}

/** An event's name: its `event`'s `const`, or its only `enum` value; `message` without one. */
function eventName(
	state: Pick<OperationState, 'resolver'>,
	raw: unknown,
	at: Location,
): string | undefined {
	if (raw === undefined) return 'message';
	const { value } = state.resolver.deref(raw, at);
	if (!isObject(value)) return undefined;
	if (typeof value['const'] === 'string') return value['const'];
	if (
		Array.isArray(value['enum']) &&
		value['enum'].length === 1 &&
		typeof value['enum'][0] === 'string'
	) {
		return value['enum'][0];
	}
	return undefined;
}

/** An event's data as JSON, or `undefined` when it is text. */
function eventData(
	state: Pick<OperationState, 'resolver' | 'schemas'>,
	raw: unknown,
	at: Location,
	name: string,
): SchemaNode | undefined {
	if (raw === undefined) return undefined;
	const data = state.resolver.deref(raw, at);
	if (!isObject(data.value) || !isJsonText(data.value['contentMediaType'])) {
		return undefined;
	}
	return state.schemas.inline(
		data.value['contentSchema'],
		child(data.location, 'contentSchema'),
		name,
	);
}

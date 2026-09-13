import { basename, extname } from 'node:path';
import type { Location } from '../loader/location';
import { parsePointer } from '../loader/pointer';

/** `employee-status` → `EmployeeStatus`, `createEmployee` → `CreateEmployee`. */
export function pascalCase(input: string): string {
	const name = input
		.split(/[^A-Za-z\d]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join('');
	if (name === '') return 'Schema';
	return /^\d/.test(name) ? `_${name}` : name;
}

/** What a node is called where it lives: its key, or its file's basename. */
export function nameFromLocation(at: Location): string {
	const last = parsePointer(at.pointer)?.at(-1);
	return last ?? basename(at.file, extname(at.file));
}

/** A name for a shared response or body, suffixed unless it already says so. */
export function sharedName(at: Location, suffix: string): string {
	const base = pascalCase(nameFromLocation(at));
	return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

/** `put` + `/employees/{id}` → `putEmployeesById`, for an operation with no id. */
export function operationIdFor(method: string, path: string): string {
	const parts = path
		.split('/')
		.filter(Boolean)
		.map((segment) => {
			const param = /^\{(.+)\}$/.exec(segment)?.[1];
			return param === undefined
				? pascalCase(segment)
				: `By${pascalCase(param)}`;
		});
	return method + parts.join('');
}

export const toHonoPath = (path: string): string =>
	path.replace(/\{([^}]+)\}/g, ':$1');

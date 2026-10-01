/**
 * The path matching `app.fetch` does. `app.listen` hands the same paths to
 * `Bun.serve`'s own router instead, and comes back here only for what it
 * leaves unmatched.
 */

export interface CompiledPath {
	readonly path: string;
	/** The path with every parameter name erased: two paths with one shape collide. */
	readonly shape: string;
	readonly names: readonly string[];
	readonly pattern: RegExp | undefined;
}

export function compilePath(path: string): CompiledPath {
	if (!path.startsWith('/')) {
		throw new TypeError(`The route path "${path}" must start with "/"`);
	}
	const names: string[] = [];
	const segments = path.split('/').slice(1);
	let source = '';
	let shape = '';
	segments.forEach((segment, index) => {
		if (segment === '*') {
			if (index !== segments.length - 1) {
				throw new TypeError(`"${path}": "*" may only end a path`);
			}
			names.push('*');
			source += '(?:/(.*))?';
			shape += '/*';
		} else if (segment.startsWith(':')) {
			const name = segment.slice(1);
			if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
				throw new TypeError(`"${path}": ":${name}" is not a parameter name`);
			}
			if (names.includes(name)) {
				throw new TypeError(`"${path}" declares ":${name}" twice`);
			}
			names.push(name);
			source += '/([^/]+)';
			shape += '/:';
		} else {
			source += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
			shape += `/${segment}`;
		}
	});
	return {
		path,
		shape,
		names,
		pattern: names.length === 0 ? undefined : new RegExp(`^${source}/?$`),
	};
}

/** The parameters `pathname` gives `compiled`, or `undefined` if it does not match it. */
export function matchPath(
	compiled: CompiledPath,
	pathname: string,
): Record<string, string> | undefined {
	if (compiled.pattern === undefined) {
		return pathname === compiled.path ||
			(pathname.length > 1 && pathname === `${compiled.path}/`)
			? {}
			: undefined;
	}
	const match = compiled.pattern.exec(pathname);
	if (match === null) return undefined;
	const params: Record<string, string> = {};
	for (let index = 0; index < compiled.names.length; index++) {
		const raw = match[index + 1] ?? '';
		let value: string;
		try {
			value = decodeURIComponent(raw);
		} catch {
			value = raw;
		}
		params[compiled.names[index] as string] = value;
	}
	return params;
}

export class Router<Value> {
	readonly #paths = new Map<
		string,
		{ compiled: CompiledPath; methods: Map<string, Value> }
	>();
	readonly #shapes = new Map<string, string>();

	add(method: string, path: string, value: Value): void {
		const compiled = compilePath(path);
		const existing = this.#shapes.get(compiled.shape);
		if (existing !== undefined && existing !== path) {
			throw new TypeError(
				`"${path}" has the shape of "${existing}" with other parameter names. ` +
					'Use the same names: the two would match the same requests.',
			);
		}
		this.#shapes.set(compiled.shape, path);
		let entry = this.#paths.get(path);
		if (entry === undefined) {
			entry = { compiled, methods: new Map() };
			this.#paths.set(path, entry);
		}
		if (entry.methods.has(method)) {
			throw new TypeError(`${method} ${path} is declared twice`);
		}
		entry.methods.set(method, value);
	}

	/** The paths declared, each with its methods. */
	paths(): IterableIterator<[string, ReadonlyMap<string, Value>]> {
		const entries = this.#paths.entries();
		return (function* () {
			for (const [path, entry] of entries) yield [path, entry.methods];
		})();
	}

	/** The methods declared at `path`, exactly as it was declared. */
	methodsAt(path: string): ReadonlyMap<string, Value> | undefined {
		return this.#paths.get(path)?.methods;
	}

	paramsAt(path: string, pathname: string): Record<string, string> {
		const entry = this.#paths.get(path);
		return (entry && matchPath(entry.compiled, pathname)) ?? {};
	}

	/**
	 * The route `pathname` reaches by `method`; the methods it allows when it
	 * reaches a path by another; nothing when it reaches none. A static path
	 * wins over one with parameters, then the order of declaration decides.
	 */
	match(
		method: string,
		pathname: string,
	):
		| { readonly value: Value; readonly params: Record<string, string> }
		| { readonly allowed: readonly string[] }
		| undefined {
		let allowed: string[] | undefined;
		const consider = (entry: {
			compiled: CompiledPath;
			methods: Map<string, Value>;
		}) => {
			const params = matchPath(entry.compiled, pathname);
			if (params === undefined) return undefined;
			const value = entry.methods.get(method);
			if (value !== undefined) return { value, params };
			allowed ??= [...entry.methods.keys()];
			return undefined;
		};
		const exact = this.#paths.get(pathname);
		if (exact !== undefined && exact.compiled.pattern === undefined) {
			const hit = consider(exact);
			if (hit) return hit;
		}
		for (const entry of this.#paths.values()) {
			if (entry === exact && entry.compiled.pattern === undefined) continue;
			const hit = consider(entry);
			if (hit) return hit;
		}
		return allowed === undefined ? undefined : { allowed };
	}
}

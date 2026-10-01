/**
 * The parameters a path declares: `:name` segments, and `*`, a trailing
 * wildcard, read as the parameter `*`.
 *
 * ```ts
 * type P = PathParams<'/users/:id/files/*'>; // { id: string; '*': string }
 * ```
 */
export type PathParamName<Path extends string> =
	| NamedParams<Path>
	| WildcardParam<Path>;

type NamedParams<Path extends string> = Path extends `${string}:${infer Rest}`
	? Rest extends `${infer Name}/${infer Tail}`
		? Name | NamedParams<Tail>
		: Rest
	: never;

type WildcardParam<Path extends string> = Path extends `${string}*`
	? '*'
	: never;

export type PathParams<Path extends string> = {
	readonly [Name in PathParamName<Path>]: string;
};

/** A path a route may be declared at: absolute. */
export type RoutePath = `/${string}`;

/** `prefix` then `path`, without a doubled or trailing slash. */
export type JoinPath<
	Prefix extends string,
	Path extends string,
> = Prefix extends '' ? Path : Path extends '/' ? Prefix : `${Prefix}${Path}`;

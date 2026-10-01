/**
 * `response` with its headers edited. A response's headers may be
 * immutable — one from `fetch`, a `Response.redirect` — and then the
 * response is copied, its body untouched.
 */
export function withHeaders(
	response: Response,
	edit: (headers: Headers) => void,
): Response {
	try {
		edit(response.headers);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		edit(copy.headers);
		return copy;
	}
}

/** Adds `value` to the `Vary` header, once. */
export function vary(headers: Headers, value: string): void {
	const current = headers.get('vary');
	if (current === null) {
		headers.set('vary', value);
		return;
	}
	const names = current.split(',').map((name) => name.trim().toLowerCase());
	if (!names.includes('*') && !names.includes(value.toLowerCase())) {
		headers.set('vary', `${current}, ${value}`);
	}
}

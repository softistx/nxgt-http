/**
 * `createHttpClient`: calls over the standard `fetch`, each typed by its path
 * and by the replies it declares, through `retry`, `auth` and middleware.
 *
 * The parts of a call each live in their own module and take the client's
 * state explicitly: `build`, `dispatch`, `request`, `send`, `streams`, and
 * `surface`, the object an app calls.
 */
import { createState } from './state';
import { surface } from './surface';
import type { HttpClient, HttpClientOptions } from './types';

export { METHODS } from './surface';

/**
 * ```ts
 * const http = createHttpClient({ baseUrl: 'https://api.example.com', retry: 2 });
 * const reply = await http.get('/employees/{id}', {
 * 	param: { id },
 * 	responses: { 200: Employee, 404: Problem },
 * });
 * if (reply.status === 200) reply.data.name;
 * ```
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
	return surface(
		createState(options),
		() => undefined,
		() => [],
	);
}

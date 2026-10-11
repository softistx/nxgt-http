---
'@nxgt/httpyz': minor
---

Export `createSseParser`, with the types `SseParser` and `ServerEvent`, and an `end()` on the parser, from `@nxgt/httpyz/integration`: the parser `events()` reads a stream with, so an app can read the events of a stream the server answered with an error status. `events()` is unchanged: it still throws `UndeclaredStatusError` with the body unread, and the error's `response` is that body to read. `push` returns only the events a blank line ended, and `end()` finishes a body the server has closed: it reads an unterminated last line and dispatches the pending event, and returns nothing after a complete one. Feed the text to both, as graphql-yoga's `404` for an unknown persisted query carries a `next` event:

```ts
import { UndeclaredStatusError } from '@nxgt/httpyz';
import { createSseParser } from '@nxgt/httpyz/integration';

try {
  for await (const event of http.events('/graphql', { body })) {
    // ...
  }
} catch (error) {
  if (!(error instanceof UndeclaredStatusError)) throw error;
  const parser = createSseParser();
  const text = await error.response.text();
  const [first] = [...parser.push(text), ...parser.end()];
  if (first) console.log(error.status, JSON.parse(first.data));
}
```

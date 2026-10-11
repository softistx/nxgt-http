---
'@nxgt/httpyz': minor
---

Export `createSseParser`, with the types `SseParser` and `ServerEvent`, from `@nxgt/httpyz/integration`: the parser `events()` reads a stream with, so an app can read the events of a stream the server answered with an error status. `events()` is unchanged: it still throws `UndeclaredStatusError` with the body unread, and the error's `response` is that body to read. Feed its text to the parser, as graphql-yoga's `404` for an unknown persisted query carries a `next` event:

```ts
import { UndeclaredStatusError } from '@nxgt/httpyz';
import { createSseParser } from '@nxgt/httpyz/integration';

try {
  for await (const event of http.events('/graphql', { body })) {
    // ...
  }
} catch (error) {
  if (!(error instanceof UndeclaredStatusError)) throw error;
  const [first] = createSseParser().push(await error.response.text());
  if (first) console.log(error.status, JSON.parse(first.data));
}
```

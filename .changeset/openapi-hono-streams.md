---
'@nxgt/openapi-hono': minor
'@nxgt/openapi-codegen': minor
---

Stream a reply an item at a time from a handler, with `streamEvents()` and `streamLines()`.

With the `hono` option, `hono.ts` now exports `streamEvents(c, operationId, write)` for each operation that replies with server-sent events, and `streamLines(c, operationId, write)` for each operation that replies with JSON Lines. Both are typed by the spec's `itemSchema`:

```ts
routes.get('/feed', (c) =>
	streamEvents(c, 'watchFeed', async (stream) => {
		await stream.write({ event: 'update', id: '7', data: item });
	}),
);
```

- An event's data is sent as JSON when the spec declares it JSON, and as text otherwise.
- JSON lines are sent as the media type the spec declares, with a record separator for `application/json-seq`.
- With `validateResponses`, each item is checked before it is sent. A failing item is never sent: it goes to `onValidationError` for its side effects, and the stream ends.
- The writer's `aborted` and `onAbort()` tell when the client went away.

`@nxgt/openapi-hono` still imports `hono` for types only.

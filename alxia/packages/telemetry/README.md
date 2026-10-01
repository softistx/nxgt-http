# @alxia/telemetry

Traces and logs for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry): no
OpenTelemetry SDK, no dependency. One server span per request, around
everything the request runs, named for its route — and every log written
inside it carrying its trace id.

```sh
bun add @alxia/telemetry @nxgt/telemetry
```

`@nxgt/telemetry` is a peer: the app's own copy, shared with its loggers.

## Usage

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { createLogger } from '@nxgt/telemetry';
import { otlpExporter } from '@nxgt/telemetry-otlp';

const tracing = telemetry({
	service: 'checkout',
	version: '1.4.0',
	exporters: [otlpExporter({ endpoint: 'http://localhost:4318' })],
	traced: (ctx) => ctx.url.pathname !== '/health',
});

const log = createLogger('Orders');

const app = alxia()
	.use(tracing)
	.get('/orders/:id', ({ params, span, reply }) => {
		span?.attribute('order.id', params.id);
		log.info('order read');                 // carries this request's traceId
		return reply(200, ...);
	})
	.onStop(() => tracing.telemetry.close()); // awaited, or the last batch is lost
```

## The span

- It is opened by an `around` hook: it holds the hooks, the handler,
  everything they await and the `onResponse` hooks.
- An inbound `traceparent` continues its trace, as a child of the caller's
  span. An unusable one starts a fresh trace: the header came from a
  stranger.
- It starts as `GET /orders/o-1` and is renamed `GET /orders/:id` once
  routing has matched, with `http.route`: one dashboard row per route, not
  per order. A request no route matched keeps its path.
- A route's error is its exception. Only a 5xx makes the span an error: a
  401 a guard answered is the server working.
- `traceResponse: true` says the `traceparent` back on the response.

## What it records

| attribute | |
| --- | --- |
| `http.request.method`, `url.path`, `url.scheme` | the request |
| `server.address`, `server.port`, `client.address` | where it was addressed, and from |
| `http.route` | the route, once matched |
| `http.response.status_code` | the status |

They are `@nxgt/telemetry-hono`'s names: a span from either reads the same
in a dashboard.

## Options

The usual `@nxgt/telemetry` options and a `service`, or an existing
telemetry as `instance` — adopted, never closed. And:

| option | default | |
| --- | --- | --- |
| `traced` | every request | `(ctx) => boolean`: a health check |
| `spanName` | `"<METHOD> <path>"` | the name before routing |
| `traceResponse` | `false` | says `traceparent` back |

A hook that throws costs its answer, never the request.

## API

| export | |
| --- | --- |
| `telemetry(options)` | the plugin, with the telemetry it writes to as `.telemetry`; routes after it read `span` and `telemetry` |
| `HTTP_ROUTE`, `HTTP_STATUS`, … | the attribute names |

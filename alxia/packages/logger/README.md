# @alxia/logger

Request logging for [alxia](https://www.npmjs.com/package/@alxia/core), with
no dependency: a request id, one structured entry per request,
`Server-Timing`, and a log bound to the request.

```sh
bun add @alxia/logger
```

## Usage

```ts
import { logger } from '@alxia/logger';

const app = alxia()
	.use(logger())
	.get('/orders/:id', ({ log, requestId, reply }) => {
		log.info('order read', { id: requestId });
		return reply(200, ...);
	});
```

Every request gets an id — the incoming `X-Request-Id` when it is one, or a
new UUID — sent back on its response. Once answered, one entry:

```json
{"time":"…","level":"info","requestId":"…","message":"GET /orders/7 200","method":"GET","path":"/orders/7","status":200,"duration":1.42,"ip":"127.0.0.1"}
```

A 4xx is a `warn`, a 5xx an `error`. The routes after the plugin read
`requestId`, and `log`, whose entries carry it.

## Options

| option | default | |
| --- | --- | --- |
| `write` | a JSON line on stdout | `(entry) => void`: pino, a file, a service |
| `header` | `'x-request-id'` | where the id is read and sent |
| `generateId` | `crypto.randomUUID` | |
| `trustIncomingId` | `true` | keep an incoming id |
| `serverTiming` | `true` | `Server-Timing: total;dur=…` |
| `skip` | none | `(request, url) => boolean`: a health check |

## API

| export | |
| --- | --- |
| `logger(options?)` | the plugin: an app that derives `requestId` and `log` |
| `LogEntry`, `RequestLog`, `LoggerOptions` | its types |

# @alxia/cors

CORS for [alxia](https://www.npmjs.com/package/@alxia/core), with no
dependency: a preflight is answered before routing, and every response to an
allowed origin carries the headers a browser needs.

```sh
bun add @alxia/cors
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';

const app = alxia()
	.use(cors({ origin: ['https://app.example.com', /\.example\.com$/], credentials: true }))
	.get(...);
```

With no options every origin is allowed, with `*`. With `credentials`, the
request's origin is echoed back instead, since `*` cannot carry them, and
`Vary: Origin` is set. A refused origin gets no CORS header: the browser
blocks the call.

## Options

| option | default | |
| --- | --- | --- |
| `origin` | `true` | `true`, a string, a `RegExp`, a list of either, or `(origin) => boolean` |
| `methods` | all but `CONNECT` and `TRACE` | what a preflight allows |
| `allowedHeaders` | those the browser asks for | what a preflight allows |
| `exposedHeaders` | none | what a script may read |
| `credentials` | `false` | cookies and `Authorization` cross-origin |
| `maxAge` | none | seconds a preflight's answer is kept |
| `privateNetwork` | `false` | answers Private Network Access preflights |

## API

| export | |
| --- | --- |
| `cors(options?)` | the plugin |
| `CorsOptions`, `CorsOrigin` | its options |

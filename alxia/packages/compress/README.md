# @alxia/compress

Response compression for [alxia](https://www.npmjs.com/package/@alxia/core):
zstd, Brotli, gzip and deflate, negotiated from `Accept-Encoding` and
streamed with Bun's and Node's own codecs. No dependency.

```sh
bun add @alxia/compress
```

## Usage

```ts
import { compress } from '@alxia/compress';

app.use(compress());
app.use(compress({ encodings: ['br', 'gzip'], threshold: 2048 }));
```

Compressed: text, JSON, JavaScript, XML and SVG of at least `threshold`
bytes (1 KiB). Never: an event stream (it would wait for a block to fill),
a `HEAD`, a 204, 206 or 304, a response already encoded, or one marked
`Cache-Control: no-transform`. `Vary: Accept-Encoding` is set, and a strong
ETag becomes weak.

## Options

| option | default | |
| --- | --- | --- |
| `encodings` | `['zstd', 'br', 'gzip', 'deflate']` | offered, in the server's order of preference |
| `threshold` | `1024` | bytes under which a body is sent as it is |
| `compressible` | text, JSON, JS, XML, SVG | `(contentType) => boolean` |

## API

| export | |
| --- | --- |
| `compress(options?)` | the plugin |
| `negotiate(accept, offered)` | the encoding an `Accept-Encoding` gets |
| `CompressOptions`, `Encoding` | its types |

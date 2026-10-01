# @alxia/static

Static files for [alxia](https://www.npmjs.com/package/@alxia/core), served
by `Bun.file`: ETags, `Last-Modified`, 304s, cache headers, directory
indexes and a single-page-app fallback. Safe from path traversal. No
dependency.

```sh
bun add @alxia/static
```

## Usage

```ts
import { serveStatic } from '@alxia/static';

app.use(serveStatic({ root: './public', prefix: '/assets', maxAge: 31536000, immutable: true }));

// a single-page app: every unknown path serves index.html
app.use(serveStatic({ root: './dist', fallback: 'index.html' }));
```

The plugin is a `GET` route at `<prefix>/*` — `HEAD` comes with it — so it
is typed, and documented, like any other. A path that leaves `root`, a
dotfile, or a missing file is a 404 `{ error: 'not_found' }`.

## Options

| option | default | |
| --- | --- | --- |
| `root` | required | the directory served |
| `prefix` | the app's root | the path served under |
| `index` | `'index.html'` | the file a directory serves, or `false` |
| `fallback` | none | served, with a 200, for a path that matches no file |
| `maxAge` | `0` | `Cache-Control: max-age`, in seconds |
| `immutable` | `false` | for files whose name carries their hash |
| `dotfiles` | `false` | whether `.env` and the like are served |
| `headers` | none | added to every file |

## API

| export | |
| --- | --- |
| `serveStatic(options)` | the plugin |
| `StaticOptions`, `FileNotFoundBody` | its types |

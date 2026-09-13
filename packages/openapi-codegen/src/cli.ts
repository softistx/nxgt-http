#!/usr/bin/env bun
/**
 * The `nxgt-openapi` bin: the process edges only. The command is `run`, in
 * `./cli/run`. Bun, because the loader parses YAML with `Bun.YAML`.
 */
import { run } from './cli/run';

// `../package.json` from src/cli.ts and from dist/cli.js alike.
const manifest: { version: string } = await Bun.file(
	new URL('../package.json', import.meta.url),
).json();

process.exit(await run(process.argv.slice(2), { version: manifest.version }));

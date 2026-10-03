import { describe, expect, test } from 'bun:test';
import { packageOf, undeclaredImports } from './imports';

describe('packageOf', () => {
	test('reads a scoped name and a plain one, without the subpath', () => {
		expect(packageOf('@nxgt/httpyz/integration')).toBe('@nxgt/httpyz');
		expect(packageOf('@nxgt/typespec')).toBe('@nxgt/typespec');
		expect(packageOf('lodash/fp')).toBe('lodash');
	});
});

describe('undeclaredImports', () => {
	const msw = { name: '@nxgt/openapi-msw' };

	test('refuses a sibling the manifest lists only as a devDependency', () => {
		const manifest = {
			...msw,
			devDependencies: { '@nxgt/openapi-codegen': 'workspace:^' },
		};
		expect(
			undeclaredImports(manifest, [
				[
					'dist/index.js',
					'import { generate } from "@nxgt/openapi-codegen";\nexport { generate };',
				],
			]),
		).toEqual([['dist/index.js', '@nxgt/openapi-codegen']]);
	});

	test('passes the runtime, relative files, chunks and the package itself', () => {
		expect(
			undeclaredImports(msw, [
				[
					'dist/index.js',
					[
						'import { listen } from "bun";',
						'import { Database } from "bun:sqlite";',
						'import { lookup } from "node:dns";',
						'import { readFileSync } from "fs";',
						'import { reply } from "./chunks/reply-abc.js";',
						'import x from "@nxgt/openapi-msw/package.json";',
						'export { listen, Database, lookup, readFileSync, reply, x };',
					].join('\n'),
				],
			]),
		).toEqual([]);
	});

	test('reads a bin past its #! line', () => {
		expect(
			undeclaredImports(msw, [
				[
					'dist/cli.js',
					'#!/usr/bin/env bun\nimport { generate } from "@nxgt/openapi-codegen";\ngenerate();',
				],
			]),
		).toEqual([['dist/cli.js', '@nxgt/openapi-codegen']]);
	});

	test('reads a bin whose #! line ends in CRLF', () => {
		expect(
			undeclaredImports(msw, [
				[
					'dist/cli.js',
					'#!/usr/bin/env bun\r\nimport "@nxgt/openapi-codegen";',
				],
			]),
		).toEqual([['dist/cli.js', '@nxgt/openapi-codegen']]);
	});

	test('strips a #! only on the first line', () => {
		expect(() =>
			undeclaredImports(msw, [
				['dist/cli.js', 'import "a";\n#!/usr/bin/env bun\n'],
			]),
		).toThrow();
	});

	test('passes a peer, a dependency and an optional dependency', () => {
		expect(
			undeclaredImports(
				{
					...msw,
					peerDependencies: { '@nxgt/httpyz': '^0.1.0' },
					dependencies: { a: '1' },
					optionalDependencies: { b: '1' },
				},
				[
					[
						'dist/index.js',
						'import "@nxgt/httpyz/integration";\nimport "a";\nimport "b/sub";',
					],
				],
			),
		).toEqual([]);
	});

	test('catches a dynamic import, a require and a re-export too', () => {
		expect(
			undeclaredImports(msw, [
				['dist/a.js', 'export * from "@nxgt/openapi-codegen";'],
				[
					'dist/b.js',
					'export const load = () => import("@nxgt/openapi-hono");',
				],
				['dist/c.js', 'module.exports = require("@nxgt/typespec");'],
			]),
		).toEqual([
			['dist/a.js', '@nxgt/openapi-codegen'],
			['dist/b.js', '@nxgt/openapi-hono'],
			['dist/c.js', '@nxgt/typespec'],
		]);
	});

	test('catches the type-only imports a declaration file holds', () => {
		expect(
			undeclaredImports(msw, [
				[
					'dist/a.d.ts',
					"export type { GenerateOptions } from '@nxgt/openapi-codegen';",
				],
				[
					'dist/b.d.ts',
					"import type { RuntimeOperation } from '@nxgt/openapi-hono';\nexport type J = RuntimeOperation;",
				],
				[
					'dist/c.d.ts',
					"export type R = import('@nxgt/typespec').NxgtDecorators;",
				],
				['dist/d.d.ts', "export type { Reply } from './protocol/reply';"],
				['dist/e.d.ts', '/// <reference types="@nxgt/httpyz-query" />'],
				[
					'dist/f.d.ts',
					"import type { Server } from 'bun';\nexport type S = Server;",
				],
			]),
		).toEqual([
			['dist/a.d.ts', '@nxgt/openapi-codegen'],
			['dist/b.d.ts', '@nxgt/openapi-hono'],
			['dist/c.d.ts', '@nxgt/typespec'],
			['dist/e.d.ts', '@nxgt/httpyz-query'],
		]);
	});
});

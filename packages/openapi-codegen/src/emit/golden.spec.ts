/**
 * What the generated code looks like, pinned file by file by snapshot:
 * `bun test --update-snapshots` accepts a change, and the snapshot diff is
 * what a reviewer reads. `test/generate.ts` writes the same files to the
 * git-ignored `test/generated/`, for the specs that run them and for `tsc`.
 */
import { describe, expect, it } from 'bun:test';
import { basename } from 'node:path';
import { CASES, fixtureFiles } from '../../test/generate';

describe('generated code', () => {
	for (const name of CASES) {
		it(`is unchanged for ${name}`, async () => {
			for (const generated of await fixtureFiles(name)) {
				const file = basename(generated.path);
				if (file === 'agreement.ts') continue;
				expect(generated.content).toMatchSnapshot(`${name}/${file}`);
			}
		});
	}
});

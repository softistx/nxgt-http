/** `scalars: 'exact'`: a string scalar of @nxgt/typespec as the schema of @nxgt/zod. */
import { describe, expect, it } from 'bun:test';
import { operations } from '../../test/generated/scalars/operations';
import * as Z from '../../test/generated/scalars/zod';
import { generateFiles } from '../generate';

const input = new URL(
	'../../test/fixtures/scalars/openapi.yaml',
	import.meta.url,
).pathname;

/** The fixture's files by name, generated with `scalars` as given. */
async function generated(scalars?: 'pattern' | 'exact') {
	const { files } = await generateFiles({
		input,
		output: '/out',
		hono: true,
		alxia: true,
		importExtension: '.js',
		...(scalars === undefined ? {} : { scalars }),
	});
	return Object.fromEntries(
		files.map((f) => [f.path.split('/').pop(), f.content]),
	);
}

const ok = (
	schema: { safeParse(v: unknown): { success: boolean } },
	value: unknown,
) => schema.safeParse(value).success;

describe('scalars: pattern', () => {
	it('is the default, byte for byte', async () => {
		expect(await generated('pattern')).toEqual(await generated());
	});

	it('checks a scalar by its pattern and imports nothing of @nxgt/zod', async () => {
		const files = await generated('pattern');
		for (const [name, content] of Object.entries(files)) {
			expect(content, name).not.toContain('@nxgt/zod');
		}
		expect(files['zod.ts']).toContain(
			'export const zIBAN = z.string().regex(/^[A-Z]{2}\\d{2}[A-Z0-9]{1,30}$/u);',
		);
		expect(files['zod.ts']).toMatchSnapshot('pattern/zod.ts');
	});
});

describe('scalars: exact', () => {
	it('prints the schema of @nxgt/zod, imported by name where it is used', async () => {
		const files = await generated('exact');
		expect(files['zod.ts']).toContain('export const zIBAN = ibanSchema;');
		expect(files['zod.ts']).toContain(
			"import { emailAddressSchema, emojiSchema, ibanSchema, ipSchema, uuidSchema } from '@nxgt/zod';",
		);
		expect(files['operations.ts']).toContain(
			"import { emailAddressSchema } from '@nxgt/zod';",
		);
		expect(files['alxia.ts']).toContain(
			"import { emailAddressSchema } from '@nxgt/zod';",
		);
		expect(files['types.ts']).not.toContain('@nxgt/zod');
		expect(files['zod.ts']).toMatchSnapshot('exact/zod.ts');
	});

	it('adds the bounds of the spec as checks, which every schema takes', async () => {
		const { 'zod.ts': zod } = await generated('exact');
		expect(zod).toContain(
			'bounded: ibanSchema.check(z.minLength(15), z.maxLength(24)).optional()',
		);
		expect(zod).toContain('ipSchema.check(z.maxLength(45)).nullable()');
	});

	it('leaves a codec and an unknown scalar to their pattern', async () => {
		const { 'zod.ts': zod } = await generated('exact');
		expect(zod).toContain(
			'export const zDateTime = z.iso.datetime({ offset: true }).regex(',
		);
		expect(zod).toContain('legacy: z.string().regex(/^L-\\d+$/u).optional()');
	});

	it('validates with the schemas, bounds included', () => {
		const iban = 'FR7630006000011234567890189';
		expect(ok(Z.zIBAN, iban)).toBe(true);
		expect(ok(Z.zIBAN, 'FR76')).toBe(false);
		const account = {
			id: '123e4567-e89b-12d3-a456-426614174000',
			iban,
			openedAt: '2024-03-10T10:00:00Z',
		};
		expect(ok(Z.zAccount, account)).toBe(true);
		expect(ok(Z.zAccount, { ...account, id: 'nope' })).toBe(false);
		expect(ok(Z.zAccount, { ...account, bounded: iban })).toBe(false);
		expect(ok(Z.zAccount, { ...account, bounded: 'BE68539007547034' })).toBe(
			true,
		);
		expect(ok(Z.zAccount, { ...account, lastIp: null })).toBe(true);
		expect(ok(Z.zAccount, { ...account, lastIp: '10.0.0.1' })).toBe(true);
		expect(ok(Z.zAccount, { ...account, lastIp: '10.0.0.999' })).toBe(false);
		expect(ok(Z.zAccount, { ...account, mood: '🙂' })).toBe(true);
		expect(ok(Z.zAccount, { ...account, mood: 'happy' })).toBe(false);
	});

	it('validates an inline parameter with its bound', () => {
		const { query } = operations.listAccounts;
		expect(ok(query, { owner: 'a@b.co' })).toBe(true);
		expect(ok(query, { owner: `${'a'.repeat(250)}@b.co` })).toBe(false);
		expect(ok(query, { owner: 'not an email' })).toBe(false);
	});
});

import { describe, expect, expectTypeOf, test } from 'bun:test';
import { client } from '@alxia/client';
import { alxia } from '@alxia/core';
import { z } from 'zod';
import { bearer } from './bearer';
import { createJwt } from './jwt';

const secret = 'a-secret-of-at-least-thirty-two-bytes!';

describe('createJwt', () => {
	test('signs and verifies with HS256, checking issuer and audience', async () => {
		const jwt = createJwt({
			secret,
			issuer: 'api',
			audience: 'web',
			expiresIn: 60,
		});
		const token = await jwt.sign({ sub: 'ada' });
		const verified = await jwt.verify(token);
		expect(verified.ok && verified.claims.sub).toBe('ada');
		expect(verified.ok && verified.claims.iss).toBe('api');
		const other = createJwt({ secret, issuer: 'other' });
		expect(await other.verify(token)).toEqual({ ok: false, reason: 'issuer' });
	});

	test('refuses a forged, an expired, a malformed token, and alg none', async () => {
		const jwt = createJwt({ secret });
		const token = await jwt.sign({ sub: 'ada' });
		const [head, body] = token.split('.');
		const forged = `${head}.${Buffer.from('{"sub":"eve"}').toString('base64url')}.${token.split('.')[2]}`;
		expect(await jwt.verify(forged)).toEqual({
			ok: false,
			reason: 'signature',
		});
		const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${body}.`;
		expect(await jwt.verify(none)).toEqual({ ok: false, reason: 'algorithm' });
		const expired = await jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 });
		expect(await jwt.verify(expired)).toEqual({ ok: false, reason: 'expired' });
		expect(await jwt.verify('a.b')).toEqual({ ok: false, reason: 'malformed' });
	});

	test('ES256 with a key pair; a verifier without the private key cannot sign', async () => {
		const pair = (await crypto.subtle.generateKey(
			{ name: 'ECDSA', namedCurve: 'P-256' },
			true,
			['sign', 'verify'],
		)) as CryptoKeyPair;
		const signer = createJwt({
			algorithm: 'ES256',
			privateKey: pair.privateKey,
			publicKey: pair.publicKey,
		});
		const verifier = createJwt({
			algorithm: 'ES256',
			publicKey: pair.publicKey,
		});
		const token = await signer.sign({ sub: 'ada' });
		expect((await verifier.verify(token)).ok).toBe(true);
		expect(verifier.sign({})).rejects.toThrow('private key');
	});

	test('refuses a short secret', () => {
		expect(() => createJwt({ secret: 'short' })).toThrow('32 bytes');
	});
});

describe('bearer', () => {
	const jwt = createJwt({ secret });
	const app = alxia()
		.use(
			bearer({
				jwt,
				schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }),
			}),
		)
		.get('/me', ({ user, reply }) => reply(200, user));

	test('a valid token: the claims, checked, as user', async () => {
		const token = await jwt.sign({ sub: 'ada', role: 'admin' });
		const result = await client(app).get('/me', {
			init: { headers: { authorization: `Bearer ${token}` } },
		});
		expect(result.status).toBe(200);
		if (result.status === 200) {
			expectTypeOf(result.data).toEqualTypeOf<{
				sub: string;
				role: 'admin' | 'user';
			}>();
		}
	});

	test('a 401, typed, for a missing token or refused claims', async () => {
		const missing = await client(app).get('/me');
		expect(missing.status).toBe(401);
		if (missing.status === 401) expect(missing.data.reason).toBe('missing');
		expect(missing.response.headers.get('www-authenticate')).toBe('Bearer');
		const token = await jwt.sign({ sub: 'ada', role: 'root' });
		const claims = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect((await claims.json()).reason).toBe('claims');
	});

	test('a token read from a cookie', async () => {
		const fromCookie = alxia()
			.use(bearer({ jwt, cookie: 'token' }))
			.get('/me', ({ user, reply }) => reply(200, user.sub ?? ''));
		const token = await jwt.sign({ sub: 'ada' });
		const response = await fromCookie.request('/me', {
			headers: { cookie: `token=${token}` },
		});
		expect(await response.text()).toBe('ada');
	});
});

/**
 * JSON Web Tokens on Web Crypto: nothing to install. HMAC with a secret,
 * or ECDSA, RSA and EdDSA with a key pair.
 */

export type HmacAlgorithm = 'HS256' | 'HS384' | 'HS512';
export type KeyAlgorithm =
	| 'ES256'
	| 'ES384'
	| 'RS256'
	| 'RS384'
	| 'RS512'
	| 'EdDSA';
export type Algorithm = HmacAlgorithm | KeyAlgorithm;

/** The claims a token carries. */
export interface JwtClaims {
	readonly iss?: string;
	readonly sub?: string;
	readonly aud?: string | readonly string[];
	readonly exp?: number;
	readonly nbf?: number;
	readonly iat?: number;
	readonly jti?: string;
	readonly [claim: string]: unknown;
}

interface Common {
	/** Checked on verify, set on sign. */
	readonly issuer?: string;
	/** Checked on verify, set on sign: the token must name it. */
	readonly audience?: string;
	/** Seconds a signed token lives. None by default: set one. */
	readonly expiresIn?: number;
	/** Seconds of clock skew allowed on `exp` and `nbf`. 5 by default. */
	readonly clockTolerance?: number;
}

export type JwtOptions = Common &
	(
		| {
				readonly algorithm?: HmacAlgorithm;
				readonly secret: string | Uint8Array;
		  }
		| {
				readonly algorithm: KeyAlgorithm;
				/** Signs: needed by `sign` only. */
				readonly privateKey?: CryptoKey;
				/** Verifies. */
				readonly publicKey: CryptoKey;
		  }
	);

export type VerifyResult =
	| { readonly ok: true; readonly claims: JwtClaims }
	| {
			readonly ok: false;
			readonly reason:
				| 'malformed'
				| 'algorithm'
				| 'signature'
				| 'expired'
				| 'not_yet_valid'
				| 'issuer'
				| 'audience';
	  };

export interface Jwt {
	readonly algorithm: Algorithm;
	/** A token of `claims`, with `iat`, and `exp`, `iss`, `aud` from the options unless given. */
	sign(
		claims: JwtClaims,
		options?: { readonly expiresIn?: number },
	): Promise<string>;
	/** Checks the signature, the algorithm, the times, the issuer and the audience. */
	verify(token: string): Promise<VerifyResult>;
}

const HASH: Record<Algorithm, string> = {
	HS256: 'SHA-256',
	HS384: 'SHA-384',
	HS512: 'SHA-512',
	ES256: 'SHA-256',
	ES384: 'SHA-384',
	RS256: 'SHA-256',
	RS384: 'SHA-384',
	RS512: 'SHA-512',
	EdDSA: '',
};

function params(algorithm: Algorithm): AlgorithmIdentifier | EcdsaParams {
	if (algorithm.startsWith('HS')) return { name: 'HMAC' };
	if (algorithm.startsWith('ES'))
		return { name: 'ECDSA', hash: HASH[algorithm] };
	if (algorithm.startsWith('RS')) return { name: 'RSASSA-PKCS1-v1_5' };
	return { name: 'Ed25519' };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new TypeError('not base64url');
	return new Uint8Array(Buffer.from(text, 'base64url'));
}

/**
 * A signer and verifier of tokens.
 *
 * ```ts
 * const jwt = createJwt({ secret: Bun.env.JWT_SECRET!, issuer: 'api', expiresIn: 3600 });
 * const token = await jwt.sign({ sub: user.id });
 * ```
 */
export function createJwt(options: JwtOptions): Jwt {
	const algorithm: Algorithm = options.algorithm ?? 'HS256';
	const tolerance = options.clockTolerance ?? 5;
	let keys: Promise<{ sign?: CryptoKey; verify: CryptoKey }>;
	if ('secret' in options) {
		const secret =
			typeof options.secret === 'string'
				? encoder.encode(options.secret)
				: new Uint8Array(options.secret);
		if (secret.byteLength < 32) {
			throw new TypeError('A JWT secret must hold at least 32 bytes');
		}
		keys = crypto.subtle
			.importKey(
				'raw',
				secret,
				{ name: 'HMAC', hash: HASH[algorithm] },
				false,
				['sign', 'verify'],
			)
			.then((key) => ({ sign: key, verify: key }));
	} else {
		keys = Promise.resolve(
			options.privateKey === undefined
				? { verify: options.publicKey }
				: { sign: options.privateKey, verify: options.publicKey },
		);
	}

	return {
		algorithm,
		async sign(claims, signOptions) {
			const key = (await keys).sign;
			if (key === undefined) throw new TypeError('Signing needs a private key');
			const now = Math.floor(Date.now() / 1000);
			const expiresIn = signOptions?.expiresIn ?? options.expiresIn;
			const payload: Record<string, unknown> = {
				iat: now,
				...(options.issuer === undefined ? {} : { iss: options.issuer }),
				...(options.audience === undefined ? {} : { aud: options.audience }),
				...(expiresIn === undefined ? {} : { exp: now + expiresIn }),
				...claims,
			};
			const head = base64url(
				encoder.encode(JSON.stringify({ alg: algorithm, typ: 'JWT' })),
			);
			const body = base64url(encoder.encode(JSON.stringify(payload)));
			const signature = await crypto.subtle.sign(
				params(algorithm),
				key,
				encoder.encode(`${head}.${body}`),
			);
			return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
		},
		async verify(token) {
			const parts = token.split('.');
			if (parts.length !== 3) return { ok: false, reason: 'malformed' };
			const [head, body, signature] = parts as [string, string, string];
			let header: { alg?: unknown };
			let claims: JwtClaims;
			let signed: Uint8Array<ArrayBuffer>;
			try {
				header = JSON.parse(decoder.decode(fromBase64url(head)));
				claims = JSON.parse(decoder.decode(fromBase64url(body)));
				signed = fromBase64url(signature);
			} catch {
				return { ok: false, reason: 'malformed' };
			}
			if (
				claims === null ||
				typeof claims !== 'object' ||
				Array.isArray(claims)
			) {
				return { ok: false, reason: 'malformed' };
			}
			if (header.alg !== algorithm) return { ok: false, reason: 'algorithm' };
			const valid = await crypto.subtle.verify(
				params(algorithm),
				(await keys).verify,
				signed,
				encoder.encode(`${head}.${body}`),
			);
			if (!valid) return { ok: false, reason: 'signature' };
			const now = Math.floor(Date.now() / 1000);
			if (typeof claims.exp === 'number' && now - tolerance >= claims.exp) {
				return { ok: false, reason: 'expired' };
			}
			if (typeof claims.nbf === 'number' && now + tolerance < claims.nbf) {
				return { ok: false, reason: 'not_yet_valid' };
			}
			if (options.issuer !== undefined && claims.iss !== options.issuer) {
				return { ok: false, reason: 'issuer' };
			}
			if (options.audience !== undefined) {
				const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
				if (!audiences.includes(options.audience)) {
					return { ok: false, reason: 'audience' };
				}
			}
			return { ok: true, claims };
		},
	};
}

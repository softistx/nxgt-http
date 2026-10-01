import { describe, expect, expectTypeOf, test } from 'bun:test';
import { client } from '@alxia/client';
import { alxia, type Jsonify } from '@alxia/core';
import {
	createMemoryStores,
	fixedClock,
	janus,
	type Session,
	scryptHasher,
} from '@nxgt/janus';
import {
	createMemoryRelations,
	defineModel,
	fromField,
	permissions,
	when,
} from '@nxgt/janus/permissions';
import { z } from 'zod';
import { type JanusErrorBody, janusErrors } from './errors';
import { byParam, permission } from './permission';
import { sendSession, session, signOut } from './session';

const ada = { email: 'ada@example.test', name: 'Ada Lovelace' };
const password = 'correct horse';
const DAY = 86_400_000;

function setup() {
	const clock = fixedClock(Date.UTC(2026, 8, 24));
	const stores = createMemoryStores();
	const outage = { on: false };
	const find = stores.sessions.findSessionByTokenHash.bind(stores.sessions);
	const auth = janus({
		users: {
			patient: {
				schema: z.strictObject({ email: z.email(), name: z.string() }),
				password: { login: 'email' },
				session: { lifespan: '7d', renewAfter: '1d' },
			},
			staff: {
				schema: z.strictObject({ username: z.string() }),
				password: { login: 'username' },
			},
		},
		store: {
			...stores,
			sessions: {
				...stores.sessions,
				findSessionByTokenHash: (hash) => {
					if (outage.on) throw new Error('connection refused');
					return find(hash);
				},
			},
		},
		hasher: scryptHasher({ cost: 10 }),
		clock,
	});
	const model = defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: {
					owners: ['patient'],
					doctors: fromField('doctorId', 'staff'),
				},
				permits: {
					view: ['owners', 'doctors'],
					edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
				},
			},
		},
	});
	const access = permissions({ model, store: createMemoryRelations() });
	const records = new Map([
		['r1', { id: 'r1', doctorId: null as string | null, title: 'Blood test' }],
	]);

	const app = alxia()
		.use(janusErrors())
		.post(
			'/signup',
			{
				body: z.object({
					email: z.string(),
					name: z.string(),
					password: z.string(),
				}),
			},
			async (ctx) => {
				const signedIn = await auth.patient.signUp(ctx.body);
				return ctx.reply(201, { id: sendSession(ctx, auth, signedIn).id });
			},
		)
		.post(
			'/signin',
			{ body: z.object({ email: z.string(), password: z.string() }) },
			async (ctx) => {
				const signedIn = await auth.patient.signIn(ctx.body);
				return ctx.reply(200, { id: sendSession(ctx, auth, signedIn).id });
			},
		)
		.post('/signout', async (ctx) => ctx.reply(200, await signOut(ctx, auth)))
		.get('/whoami', async ({ reply }) => reply(200, 'anyone'))
		.use(session(auth, { type: 'patient', required: true }))
		.get('/me', ({ user, session: current, reply }) => {
			expectTypeOf(user.email).toBeString();
			expectTypeOf(current).toEqualTypeOf<Session>();
			return reply(200, { name: user.name });
		})
		.group('/records/:id', (records_) =>
			records_
				.use(
					permission(
						access,
						'view',
						'record',
						byParam('id', (id) => records.get(id) ?? null),
					),
				)
				.get('/', ({ object, reply }) => reply(200, { title: object.title })),
		);
	return { auth, access, clock, outage, app };
}

const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.find((value) => value.startsWith('janus-session='));
const tokenOf = (response: Response) =>
	cookieOf(response)?.split(';')[0]?.split('=')[1] ?? '';

async function signUp(app: ReturnType<typeof setup>['app']) {
	const response = await app.request('/signup', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...ada, password }),
	});
	return { response, token: tokenOf(response) };
}

describe('session', () => {
	test('a sign-up sends the cookie, and the session reads the user', async () => {
		const { app } = setup();
		const { response, token } = await signUp(app);
		expect(response.status).toBe(201);
		expect(cookieOf(response)).toContain('HttpOnly');
		expect(JSON.stringify(await response.json())).not.toContain(token);
		const me = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await me.json()).toEqual({ name: 'Ada Lovelace' });
		const bearer = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(bearer.status).toBe(200);
	});

	test('anonymous is a 401, typed; routes before the session are open', async () => {
		const { app } = setup();
		const anonymous = await client(app).get('/me');
		expect(anonymous.status).toBe(401);
		if (anonymous.status === 401) {
			// The session's own 401, or janus's — a refused code — through janusErrors().
			expectTypeOf(anonymous.data).toEqualTypeOf<
				{ error: 'unauthenticated' } | Jsonify<JanusErrorBody>
			>();
		}
		expect((await app.request('/whoami')).status).toBe(200);
	});

	test('a renewed session is sent again, only to a cookie client', async () => {
		const { app, clock } = setup();
		const { token } = await signUp(app);
		clock.advance(2 * DAY);
		const viaCookie = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(cookieOf(viaCookie)).toBeDefined();
		clock.advance(2 * DAY);
		const viaBearer = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(viaBearer.status).toBe(200);
		expect(cookieOf(viaBearer)).toBeUndefined();
	});

	test('sign-out revokes the session and clears the cookie', async () => {
		const { app } = setup();
		const { token } = await signUp(app);
		const out = await app.request('/signout', {
			method: 'POST',
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await out.json()).toBe(true);
		expect(cookieOf(out)).toContain('Max-Age=0');
		expect(
			(
				await app.request('/me', {
					headers: { cookie: `janus-session=${token}` },
				})
			).status,
		).toBe(401);
	});

	test('an outage is a 503, never a 401', async () => {
		const { app, outage } = setup();
		const { token } = await signUp(app);
		outage.on = true;
		const response = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
	});
});

describe('janusErrors', () => {
	test('refusals answered with their status and a safe body', async () => {
		const { app } = setup();
		await signUp(app);
		expect((await signUp(app)).response.status).toBe(409);
		const wrong = await app.request('/signin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ada.email, password: 'wrong password' }),
		});
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toEqual({ code: 'CREDENTIALS_INVALID' });
	});
});

describe('permission', () => {
	test('403 to a denial, 404 to nothing loaded, the object to an allowed subject', async () => {
		const { app, access, auth } = setup();
		const { token } = await signUp(app);
		const headers = { authorization: `Bearer ${token}` };
		expect((await app.request('/records/r1', { headers })).status).toBe(403);
		expect((await app.request('/records/gone', { headers })).status).toBe(404);
		const user = await auth.patient.findByLogin(ada.email);
		if (user === null) throw new Error('no user');
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);
		const allowed = await app.request('/records/r1', { headers });
		expect(await allowed.json()).toEqual({ title: 'Blood test' });
		expect((await app.request('/records/r1')).status).toBe(401);
	});
});

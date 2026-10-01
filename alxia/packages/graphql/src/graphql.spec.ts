import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type RoutesOf } from '@alxia/core';
import { createSchema, type Plugin } from 'graphql-yoga';
import { type GraphQLContext, graphql } from './graphql';

const users = new Map([['1', { id: '1', name: 'Ada' }]]);

const base = alxia()
	.decorate({ users })
	.derive(({ request }) => ({
		viewer: request.headers.get('x-user') ?? null,
	}));

type Context = GraphQLContext<typeof base>;

const schema = createSchema<Context>({
	typeDefs: /* GraphQL */ `
		type User { id: ID!, name: String! }
		type Query {
			me: String
			user(id: ID!): User
			boom: String
		}
		type Mutation { login(name: String!): Boolean! }
		type Subscription { countdown(from: Int!): Int! }
	`,
	resolvers: {
		Query: {
			me: (_, __, context) => {
				expectTypeOf(context.viewer).toEqualTypeOf<string | null>();
				return context.viewer;
			},
			user: (_, args: { id: string }, context) =>
				context.users.get(args.id) ?? null,
			boom: () => {
				throw new Error('database password is hunter2');
			},
		},
		Mutation: {
			login: (_, args: { name: string }, context) => {
				context.set.cookies.set('session', args.name, { httpOnly: true });
				return true;
			},
		},
		Subscription: {
			countdown: {
				async *subscribe(_, args: { from: number }) {
					for (let n = args.from; n >= 0; n--) yield { countdown: n };
				},
			},
		},
	},
});

let executions = 0;
const counting: Plugin = {
	onExecute: () => {
		executions++;
	},
};

const app = base.use((app) =>
	graphql(app, { schema, plugins: [counting], logging: false }),
);

const post = (
	target: { fetch: (request: Request) => Promise<Response> },
	path: string,
	query: string,
	headers: Record<string, string> = {},
) =>
	target.fetch(
		new Request(`http://localhost${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ query }),
		}),
	);

describe('graphql', () => {
	test("resolvers read the app's context, typed", async () => {
		const response = await post(
			app,
			'/graphql',
			'{ me user(id: "1") { name } }',
			{
				'x-user': 'ada',
			},
		);
		expect(await response.json()).toEqual({
			data: { me: 'ada', user: { name: 'Ada' } },
		});
	});

	test('a GET query, and Yoga plugins run', async () => {
		const before = executions;
		const response = await app.request(
			`/graphql?query=${encodeURIComponent('{ me }')}`,
			{
				headers: { accept: 'application/json' },
			},
		);
		expect(await response.json()).toEqual({ data: { me: null } });
		expect(executions).toBe(before + 1);
	});

	test('a resolver sets a cookie through the context', async () => {
		const response = await post(
			app,
			'/graphql',
			'mutation { login(name: "ada") }',
		);
		expect(response.headers.getSetCookie()[0]).toContain('session=ada');
	});

	test('errors are masked', async () => {
		const response = await post(app, '/graphql', '{ boom }');
		const body = await response.json();
		expect(body.errors[0].message).toBe('Unexpected error.');
		expect(JSON.stringify(body)).not.toContain('hunter2');
	});

	test('subscriptions over server-sent events', async () => {
		const response = await app.request('/graphql', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'text/event-stream',
			},
			body: JSON.stringify({ query: 'subscription { countdown(from: 2) }' }),
		});
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		const text = await response.text();
		for (const n of [2, 1, 0])
			expect(text).toContain(`{"data":{"countdown":${n}}}`);
	});

	test('GraphiQL, with a policy that lets it load', async () => {
		const response = await app.request('/graphql', {
			headers: { accept: 'text/html' },
		});
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(response.headers.get('content-security-policy')).toContain(
			'unpkg.com',
		);
	});

	test('behind a guard, under a prefix', async () => {
		const guarded = alxia({ prefix: '/api' })
			.derive(({ request, reply }) =>
				request.headers.get('authorization') === 'Bearer ok'
					? { viewer: 'ok' as string | null, users }
					: reply(401, { error: 'unauthorized' as const }),
			)
			.use((app) => graphql(app, { schema, logging: false }));
		expect((await post(guarded, '/api/graphql', '{ me }')).status).toBe(401);
		const ok = await post(guarded, '/api/graphql', '{ me }', {
			authorization: 'Bearer ok',
		});
		expect(await ok.json()).toEqual({ data: { me: 'ok' } });

		const root = alxia({ prefix: '/v1' }).use(guarded);
		const mounted = await post(root, '/v1/api/graphql', '{ me }', {
			authorization: 'Bearer ok',
		});
		expect(await mounted.json()).toEqual({ data: { me: 'ok' } });

		expectTypeOf<
			keyof RoutesOf<typeof guarded>
		>().toEqualTypeOf<'/api/graphql'>();
		expectTypeOf<
			RoutesOf<typeof guarded>['/api/graphql']['POST']['output']['status']
		>().toExtend<number>();
	});

	test('a schema whose context the app does not build is a compile error', () => {
		const _never = () =>
			alxia().use((app) =>
				// @ts-expect-error: the schema reads `viewer` and `users`, which no hook derives
				graphql(app, { schema }),
			);
		expect(_never).toBeFunction();
	});

	test('a custom path', async () => {
		const custom = alxia()
			.decorate({ users })
			.derive(() => ({ viewer: null as string | null }))
			.use((app) => graphql(app, { schema, path: '/gql', logging: false }));
		expect((await post(custom, '/gql', '{ __typename }')).status).toBe(200);
		expectTypeOf<keyof RoutesOf<typeof custom>>().toEqualTypeOf<'/gql'>();
	});
});

describe('ide', () => {
	test('apollo-sandbox: a browser gets the Sandbox, at the URL it asked', async () => {
		const sandboxed = alxia({ prefix: '/api' })
			.decorate({ users })
			.derive(() => ({ viewer: null as string | null }))
			.use((app) =>
				graphql(app, {
					schema,
					ide: 'apollo-sandbox',
					sandbox: { title: 'Users </title>', initialDocument: '{ me }' },
					logging: false,
				}),
			);
		const page = await sandboxed.fetch(
			new Request('https://api.example.com/api/graphql', {
				headers: { accept: 'text/html' },
			}),
		);
		const text = await page.text();
		expect(page.headers.get('content-type')).toContain('text/html');
		expect(page.headers.get('content-security-policy')).toContain(
			'sandbox.embed.apollographql.com',
		);
		expect(text).toContain(
			'"initialEndpoint":"https://api.example.com/api/graphql"',
		);
		expect(text).toContain('Users &#60;/title&#62;');
		expect(text).not.toContain('graphiql');
		const query = await post(sandboxed, '/api/graphql', '{ me }');
		expect(await query.json()).toEqual({ data: { me: null } });
	});

	test('false: no IDE at all', async () => {
		const bare = alxia()
			.decorate({ users })
			.derive(() => ({ viewer: null as string | null }))
			.use((app) => graphql(app, { schema, ide: false, logging: false }));
		const page = await bare.request('/graphql', {
			headers: { accept: 'text/html' },
		});
		expect(page.headers.get('content-type') ?? '').not.toContain('text/html');
	});
});

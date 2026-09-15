import { createRoutes } from '../../generated/hono';

// Auto-imported by the module: `c.env.event` is the h3 event, in the
// spec's routes as in the app's own.
const app = createHonoApp();
const routes = createRoutes(app);

routes.get('/items/{id}', (c) => {
	const { id } = c.req.valid('param');
	// @ts-expect-error the env holds the event, and nothing else
	c.env.db;
	return c.json(
		{
			id,
			name: `Item ${id}`,
			cookie: getRequestHeader(c.env.event, 'cookie') ?? null,
			path: c.req.path,
		},
		200,
	);
});

routes.post('/items', (c) =>
	c.json(
		{
			id: 1,
			name: c.req.valid('json').name,
			cookie: c.req.header('cookie') ?? null,
			path: c.req.path,
		},
		201,
	),
);

// Outside the spec: a plain Hono route, its env typed.
app.get('/whoami', (c) => c.json({ path: c.env.event.path }));

export default app;

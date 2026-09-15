import { Hono } from 'hono';
import { createRoutes } from '../../generated/hono';

const app = new Hono();
const routes = createRoutes(app);

routes.get('/items/{id}', (c) => {
	const { id } = c.req.valid('param');
	return c.json(
		{
			id,
			name: `Item ${id}`,
			cookie: c.req.header('cookie') ?? null,
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

export default app;

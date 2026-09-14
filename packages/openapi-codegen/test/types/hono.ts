/**
 * What `routes` lets through, checked by `tsc`: every `@ts-expect-error`
 * below must be an error, and every other line must compile.
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { createRoutes as dateRoutes } from '../generated/dates/hono.gen.js';
import { createRoutes as kitchenRoutes } from '../generated/kitchen-sink/hono.gen.js';
import { createRoutes as searchRoutes } from '../generated/query/hono.gen.js';
import { createApi, createRoutes } from '../generated/split/hono.gen.js';
import type { Employee } from '../generated/split/types.gen.js';

declare const ada: Employee;
declare const auth: MiddlewareHandler;

export function examples(): void {
	const app = new Hono();
	const routes = createRoutes(app);

	routes.put('/employees/{id}', auth, auth, (c) => {
		c.req.valid('param').id satisfies string;
		c.req.valid('json').email satisfies string;
		return c.json(ada, 200);
	});
	routes.get('/employees', (c) => {
		c.req.valid('query').page satisfies number | undefined;
		return c.json([ada], 200);
	});
	routes.delete('/employees/{id}', auth, routes.validate, (c) =>
		c.body(null, 204),
	);
	routes.operation('createEmployee', async (c) => c.json(ada, 201));

	// @ts-expect-error 201 is not a status getEmployee declares
	routes.get('/employees/{id}', (c) => c.json(ada, 201));
	// @ts-expect-error a 200 of getEmployee is an Employee
	routes.get('/employees/{id}', (c) => c.json({ id: 1 }, 200));
	// @ts-expect-error no operation patches /employees
	routes.patch('/employees', (c) => c.json(ada, 200));
	// @ts-expect-error no operation is called nope
	routes.operation('nope', (c) => c.json(ada, 200));
	routes.get('/employees/{id}', (c) => {
		// @ts-expect-error getEmployee has no body
		c.req.valid('json');
		return c.json(ada, 200);
	});

	createApi()
		.routes(app, { tag: 'employees', prefix: '/employees' })
		.get('/employees/{id}', (c) => c.json(ada, 200));
	// @ts-expect-error no operation is tagged nope
	createApi().routes(app, { tag: 'nope' });
	createRoutes(app, { prefix: '/employees/{id}' })
		// @ts-expect-error /employees is outside the prefix
		.get('/employees', (c) => c.json([ada], 200));

	searchRoutes(app).query('/employees', (c) => {
		c.req.valid('json').first satisfies number;
		return c.json([{ id: '1' }], 200);
	});
	kitchenRoutes(app).post('/uploads', (c) => c.text('ok', 200));
	// @ts-expect-error a 200 of upload is text, not JSON
	kitchenRoutes(app).post('/uploads', (c) => c.json('ok', 200));

	// dates: 'date': a handler gets Dates, and c.json() sends them as strings.
	dateRoutes(app).post('/events', (c) => {
		const body = c.req.valid('json');
		body.startsAt satisfies Date;
		return c.json({ ...body, id: '1', createdAt: new Date() }, 201);
	});
	// @ts-expect-error createdAt is a date-time, not a number
	dateRoutes(app).post('/events', (c) =>
		c.json({ ...c.req.valid('json'), id: '1', createdAt: 1 }, 201),
	);

	// A hook answers, throws, or returns nothing for the default answer.
	createRoutes(app, {
		onValidationError: (failure, c) => c.json(failure, 422),
	});
	createRoutes(app, {
		onValidationError: (failure) => {
			throw new Error(failure.issues[0]?.message);
		},
	});
	createRoutes(app, { onValidationError: (failure) => void failure });
	createRoutes(app, {
		onValidationError: (failure) => {
			console.warn(failure.operationId);
		},
	});
	createRoutes(app, {
		onValidationError: async (failure) => {
			await Promise.resolve(failure);
		},
	});
	// @ts-expect-error a hook answers with a Response, not a body
	createRoutes(app, { onValidationError: (failure) => failure.issues });
}

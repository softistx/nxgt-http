/**
 * The client's copy of the failure, `@nxgt/httpyz`'s, stays the server's:
 * a client reads the issues of a 400 as the types it has for them.
 */
import { describe, expect, it } from 'bun:test';
import type {
	ValidationFailure as ClientFailure,
	ValidationIssue as ClientIssue,
} from '@nxgt/httpyz';
import { Hono } from 'hono';
import {
	type ValidationFailure,
	type ValidationIssue,
	validationErrorHandler,
} from './errors';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The issues are one type; a server's failure is a client's, whose
// `operationId` is optional, since a call without a spec has none.
const issues: Same<ValidationIssue, ClientIssue> = true;
const failure: ValidationFailure extends ClientFailure ? true : false = true;

describe('validationErrorHandler', () => {
	it("answers a request's failure with issues a client's types read", async () => {
		const sent: ValidationFailure = {
			kind: 'request',
			operationId: 'getItem',
			method: 'get',
			path: '/items/{id}',
			issues: [
				{
					target: 'param',
					path: ['id'],
					code: 'invalid_type',
					message: 'Expected number',
				},
			],
		};
		const app = new Hono().get('/', (c) => validationErrorHandler(sent, c));
		const reply = await app.request('/');
		expect(reply.status).toBe(400);
		const body = (await reply.json()) as { issues: ClientIssue[] };
		expect(body.issues).toEqual(sent.issues);
		expect(issues && failure).toBe(true);
	});
});

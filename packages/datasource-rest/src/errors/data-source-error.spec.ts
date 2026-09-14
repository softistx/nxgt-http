/** `toDataSourceError`: whatever the client throws, as one error with a code. */
import { describe, expect, it } from 'bun:test';
import {
	NetworkError,
	ok,
	TimeoutError,
	UndeclaredStatusError,
	ValidationError,
} from '@nxgt/httpyz';
import { codeOf, DataSourceError, toDataSourceError } from '../index';

const call = { method: 'GET', path: '/bookmarks/{id}' };

/** The `ReplyStatusError` of a non-2xx reply. */
function refused(status: number, data: unknown): unknown {
	try {
		ok({ status, data });
	} catch (error) {
		return error;
	}
	throw new Error('ok() accepted a non-2xx reply');
}

describe('toDataSourceError', () => {
	it.each([
		[400, 'BAD_REQUEST'],
		[401, 'UNAUTHENTICATED'],
		[403, 'FORBIDDEN'],
		[404, 'NOT_FOUND'],
		[409, 'BAD_REQUEST'],
		[500, 'INTERNAL_SERVER_ERROR'],
		[503, 'INTERNAL_SERVER_ERROR'],
	] as const)('codes a %i reply %s', (status, code) => {
		expect(codeOf(status)).toBe(code);
		expect(toDataSourceError(refused(status, null))).toMatchObject({
			code,
			status,
			extensions: { code, status },
		});
	});

	it("takes the message of the reply's body, and keeps the body and the cause", () => {
		const cause = refused(404, {
			message: 'errors.not-found',
			debugMessage: 'x',
		});
		const error = toDataSourceError(cause);
		expect(error).toBeInstanceOf(DataSourceError);
		expect(error.name).toBe('DataSourceError');
		expect(error.message).toBe('errors.not-found');
		expect(error.data).toEqual({
			message: 'errors.not-found',
			debugMessage: 'x',
		});
		expect(error.cause).toBe(cause);
		expect(toDataSourceError(refused(404, 'gone')).message).toBe(
			'Expected a 2xx reply, got 404',
		);
	});

	it('codes an undeclared status by it, with the body it was given', () => {
		const error = toDataSourceError(
			new UndeclaredStatusError(call, new Response(null, { status: 403 })),
			{ message: 'errors.forbidden' },
		);
		expect(error).toMatchObject({
			code: 'FORBIDDEN',
			status: 403,
			message: 'errors.forbidden',
		});
	});

	it('is SERVICE_UNAVAILABLE when no reply came back', () => {
		for (const cause of [
			new NetworkError(call),
			new TimeoutError(call, 1_000),
		]) {
			expect(toDataSourceError(cause)).toMatchObject({
				code: 'SERVICE_UNAVAILABLE',
				status: undefined,
			});
		}
	});

	it('blames the caller for a request the spec refuses, and the service for a reply', () => {
		const failed = (kind: 'request' | 'response') =>
			new ValidationError(call, {
				kind,
				...call,
				issues: [
					{
						target: 'param',
						path: ['id'],
						code: 'too_small',
						message: 'Too short',
					},
				],
			});
		expect(toDataSourceError(failed('request'))).toMatchObject({
			code: 'BAD_REQUEST',
			data: [{ path: ['id'], message: 'Too short' }],
		});
		expect(toDataSourceError(failed('response')).code).toBe(
			'INTERNAL_SERVER_ERROR',
		);
	});

	it('keeps a DataSourceError as it is, and codes anything else as the server failing', () => {
		const own = new DataSourceError('gone', { code: 'NOT_FOUND', status: 404 });
		expect(toDataSourceError(own)).toBe(own);
		expect(toDataSourceError(new Error('boom'))).toMatchObject({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'boom',
		});
		expect(toDataSourceError('boom').message).toBe('An error occurred');
	});
});

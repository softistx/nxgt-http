import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';

export function errorToException(error: any, response: Response) {
	let status = ErrorCode.BadRequest;
	switch (response.status) {
		case 401:
			status = ErrorCode.Unauthenticated;
			break;
		case 403:
			status = ErrorCode.Forbidden;
			break;
		case 404:
			status = ErrorCode.NotFound;
			break;
		case 500:
			status = ErrorCode.InternalServerError;
			break;
		default:
			status = ErrorCode.BadRequest;
	}

	return CustomException.from({
		message: error?.message || 'An error occurred',
		code: status,
		options: {},
		debugMessage: error?.debugMessage,
	});
}

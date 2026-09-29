import "@typespec/http";

using Http;

/**
 * nxgt's HTTP conventions, as the `@nxgt/*` packages serve them.
 */
namespace Nxgt;

/**
 * Where `@nxgt/openapi-hono` found a request value wrong: a request location,
 * or `response` for a reply the spec does not declare.
 */
@friendlyName("ValidationTarget")
union ValidationTarget {
  "param",
  "query",
  "header",
  "json",
  "form",
  "body",
  "response",
}

/** One value `@nxgt/openapi-hono` refused, and why. */
@friendlyName("ValidationIssue")
model ValidationIssue {
  target: ValidationTarget;

  /** Inside the target: `["items", 0, "name"]`, or `[]` for the whole of it. */
  path: (string | integer)[];

  /**
   * Zod's issue code, or one of the engine's own: `invalid_json`,
   * `invalid_form`, `invalid_content_type`, `missing_body`,
   * `repeated_parameter`, `undeclared_status`.
   */
  code: string;

  message: string;
}

/** The body of an error reply, as `@nxgt/openapi-hono` sends it. */
model ErrorBody<Status extends integer> {
  /** The reply's status, repeated in the body. */
  status: Status;

  /** An i18n key, such as `errors.not-found`, not a sentence. */
  message: string;

  /** When the error was answered. */
  timestamp: utcDateTime;
}

/**
 * The 400. `@nxgt/openapi-hono` sends it with the `issues` when its
 * validators refuse a request; a handler sends it without them.
 */
@friendlyName("BadRequestBody")
model BadRequestBody {
  ...ErrorBody<400>;

  /** Every value the validators refused, from every target at once. */
  issues?: ValidationIssue[];
}

@friendlyName("UnauthorizedBody")
model UnauthorizedBody is ErrorBody<401>;
@friendlyName("ForbiddenBody")
model ForbiddenBody is ErrorBody<403>;
@friendlyName("NotFoundBody")
model NotFoundBody is ErrorBody<404>;
@friendlyName("ConflictBody")
model ConflictBody is ErrorBody<409>;
@friendlyName("UnprocessableEntityBody")
model UnprocessableEntityBody is ErrorBody<422>;
@friendlyName("TooManyRequestsBody")
model TooManyRequestsBody is ErrorBody<429>;
@friendlyName("InternalServerErrorBody")
model InternalServerErrorBody is ErrorBody<500>;

/** The request is refused, by the validators or by a handler. */
@error
model BadRequest {
  @statusCode _: 400;
  @body body: BadRequestBody;
}

/** No credentials, or credentials that are not valid. */
@error
model Unauthorized {
  @statusCode _: 401;
  @body body: UnauthorizedBody;
}

/** Authenticated, but not allowed. */
@error
model Forbidden {
  @statusCode _: 403;
  @body body: ForbiddenBody;
}

/** Nothing is there. */
@error
model NotFound {
  @statusCode _: 404;
  @body body: NotFoundBody;
}

/** The request conflicts with the resource's state, such as a version that moved on. */
@error
model Conflict {
  @statusCode _: 409;
  @body body: ConflictBody;
}

/** Well-formed, but not something the server can act on. */
@error
model UnprocessableEntity {
  @statusCode _: 422;
  @body body: UnprocessableEntityBody;
}

/** Too many requests. */
@error
model TooManyRequests {
  @statusCode _: 429;
  @body body: TooManyRequestsBody;
}

/**
 * The server failed. `@nxgt/openapi-hono` answers it too when a reply
 * breaks the spec, with `errors.response-validation-failed`.
 */
@error
model InternalServerError {
  @statusCode _: 500;
  @body body: InternalServerErrorBody;
}

/** Any other status, with the same body. */
@error
model ErrorResponse<Status extends integer> {
  @statusCode _: Status;
  @body body: ErrorBody<Status>;
}

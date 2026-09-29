import "@typespec/http";

using Http;

namespace Nxgt;

/**
 * A session token in the `X-Session-Token` header, as `@nxgt/janus` reads it
 * after `Authorization: Bearer`.
 */
model SessionTokenAuth is ApiKeyAuth<ApiKeyLocation.header, "X-Session-Token">;

/**
 * A session token in the `janus-session` cookie, as `@nxgt/janus` sets it for
 * a browser.
 */
model SessionCookieAuth is ApiKeyAuth<ApiKeyLocation.cookie, "janus-session">;

/**
 * Every way `@nxgt/janus` reads a session token, in its order:
 * `Authorization: Bearer`, then `X-Session-Token`, then the `janus-session`
 * cookie. Any one of them is enough. Use it with `@useAuth(JanusAuth)`.
 */
alias JanusAuth = BearerAuth | SessionTokenAuth | SessionCookieAuth;

// An error reply without a body, as the @nxgt/janus guards send one:
// requireUser() and permission() answer 401, 403 or 404 with no body.
/** The request was refused; the reply has no body. */
@error
model ErrorWithoutBody<Status extends integer> {
  @statusCode _: Status;
}

// A handler's own 401, with the envelope, is Unauthorized.
/** The request carries no session, or one the server does not know. */
@error
model AuthenticationRequired is ErrorWithoutBody<401>;

// A handler's own 403, with the envelope, is Forbidden.
/** The session's user may not do this. */
@error
model AccessDenied is ErrorWithoutBody<403>;

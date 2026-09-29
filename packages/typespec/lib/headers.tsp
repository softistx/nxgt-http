import "@typespec/http";

using Http;

namespace Nxgt;

/**
 * The `Idempotency-Key` a client may send with a write, 1 to 255 characters.
 * Spread it into an operation's parameters.
 */
model IdempotencyKeyHeader {
  /**
   * Made up by the client, once per write it means, and sent again with every
   * retry of that write: the write happens once, and a retry gets the first
   * answer back. Without it, every request writes.
   */
  @header("Idempotency-Key")
  @minLength(1)
  @maxLength(255)
  idempotencyKey?: string;
}

/** `Idempotent-Replayed`, on a reply to a request with an `Idempotency-Key`. */
model IdempotentReplayedHeader {
  /**
   * `true` when this answer is the one an earlier request with the same
   * `Idempotency-Key` got, and nothing was written this time.
   */
  @header("Idempotent-Replayed")
  idempotentReplayed?: "true";
}

/** The `RateLimit-*` headers of a rate-limited route's replies. */
model RateLimitHeaders {
  /** How many requests a full window allows. */
  @header("RateLimit-Limit")
  rateLimitLimit?: integer;

  /** How many more requests are allowed now, after this one. */
  @header("RateLimit-Remaining")
  rateLimitRemaining?: integer;

  /** Seconds until the window is full again, rounded up. */
  @header("RateLimit-Reset")
  rateLimitReset?: integer;
}

/** `Retry-After`, in seconds. */
model RetryAfterHeader {
  /** Seconds to wait before trying again, rounded up: a delay, never a date. */
  @header("Retry-After")
  retryAfter?: integer;
}

/**
 * A request with this `Idempotency-Key` is still running. Retry it as it is,
 * after `Retry-After`.
 */
@error
model IdempotencyInProgress {
  @statusCode _: 409;
  ...RetryAfterHeader;
  @body body: ConflictBody;
}

/**
 * This `Idempotency-Key` was already used for a request with another body. A
 * new request takes a new key.
 */
@error
model IdempotencyKeyReused {
  @statusCode _: 422;
  @body body: UnprocessableEntityBody;
}

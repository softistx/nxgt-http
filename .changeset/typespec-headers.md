---
'@nxgt/typespec': minor
---

Add the headers of an idempotent write and of a rate limit: `IdempotencyKeyHeader` (`Idempotency-Key`, 1 to 255 characters, checked), `IdempotentReplayedHeader`, `RateLimitHeaders` (`RateLimit-Limit`, `-Remaining`, `-Reset`), `RetryAfterHeader`, and the replies `IdempotencyInProgress` (409) and `IdempotencyKeyReused` (422). `TooManyRequests` now carries the `RateLimit-*` headers and `Retry-After`.

---
'@nxgt/openapi-hono': minor
---

The editor now completes the body in a handler's `c.json({ … }, status)`: it offers the fields of the body declared for that status, then only the ones not written yet. Hono's own `c.json()` takes any value, so it had nothing to offer.

- **The body is typed by its status.** The handler's `c` has a `c.json()` whose body type follows the status passed after it, and the new `DeclaredJson` type describes it. The reply is still typed as Hono types it, so what a handler returns is checked against the spec exactly as before, and `c` is still a `Context`.
- **One overload per chain length.** A registration, `routes.get()` and the other methods or `routes.operation()`, has one overload for each length up to five middlewares, then one for longer chains, as Hono's own `app.get` does. These are the new `Register` and `RegisterOperation` types. Before, a single rest of middlewares left the handler's `c` untyped while its reply was unfinished.

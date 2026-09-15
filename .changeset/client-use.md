---
'@nxgt/httpyz': minor
'@nxgt/openapi-httpyz': minor
---

`use(...middlewares)` adds middleware to a client you already have: `http.use(timing)`, and `api.use(timing)` on a bound client. It changes the client in place and returns it, so calls chain. Its middleware runs after the chain the client already has: retry → auth → `use` → what `use()` added → fetch. Calls made from then on go through it. A group runs through its parent's middleware, even middleware added after the group was made, and what is added to a group stays the group's.

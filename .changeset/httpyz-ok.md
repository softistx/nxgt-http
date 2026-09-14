---
'@nxgt/httpyz': minor
---

`ok(reply)` returns the data of any 2xx reply, narrowed to the success statuses the call declares, and throws a `ReplyStatusError` for any other. `Success<Reply>` is the type of those replies.

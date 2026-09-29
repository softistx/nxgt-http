import "@nxgt/typespec";

using Nxgt;

namespace Blog;

/** Someone who writes posts and comments. */
model Author {
  @visibility(Lifecycle.Read)
  id: uuid;

  @minLength(1)
  @maxLength(80)
  name: string;

  email: email;

  ...Timestamps;
}

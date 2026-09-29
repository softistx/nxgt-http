import "@nxgt/typespec";

using Nxgt;

namespace Blog;

/** A reply to a post. */
model Comment {
  @visibility(Lifecycle.Read)
  id: uuid;

  @visibility(Lifecycle.Read)
  postId: uuid;

  authorId: uuid;

  @minLength(1)
  @maxLength(2000)
  body: string;

  ...Timestamps;
  ...SoftDelete;
}

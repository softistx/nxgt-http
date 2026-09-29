namespace Blog;

/** A reply to a post. */
model Comment {
  @visibility(Lifecycle.Read)
  @format("uuid")
  id: string;

  @visibility(Lifecycle.Read)
  @format("uuid")
  postId: string;

  @format("uuid")
  authorId: string;

  @minLength(1)
  @maxLength(2000)
  body: string;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}

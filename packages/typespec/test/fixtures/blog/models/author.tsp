namespace Blog;

/** Someone who writes posts and comments. */
model Author {
  @visibility(Lifecycle.Read)
  @format("uuid")
  id: string;

  @minLength(1)
  @maxLength(80)
  name: string;

  @format("email")
  email: string;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}

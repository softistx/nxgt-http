namespace Blog;

/** Where a post stands. */
enum PostStatus {
  draft,
  published,
  archived,
}

/** An article, by one author. */
model Post {
  @visibility(Lifecycle.Read)
  @format("uuid")
  id: string;

  @format("uuid")
  authorId: string;

  @minLength(1)
  @maxLength(200)
  title: string;

  body: string;
  status: PostStatus;
  tags?: string[];

  @visibility(Lifecycle.Read)
  publishedAt: utcDateTime | null;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}

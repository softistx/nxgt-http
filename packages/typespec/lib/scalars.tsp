namespace Nxgt;

// The id @nxgt/drizzle's id() and actors() columns hold by default.
/** A UUID, such as `0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e`. */
@friendlyName("Uuid")
@format("uuid")
scalar uuid extends string;

/** An e-mail address. */
@friendlyName("Email")
@format("email")
scalar email extends string;

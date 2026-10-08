import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An e-mail address, in any case, kept as sent: `ada@example.com`. The local
 * part is letters, digits, `_`, `'`, `+`, `-` and dots between them, with no
 * quoted form; the domain is at least two labels, as `hostname` takes them,
 * the last of letters or `xn--`. Only the shape is checked.
 */
@friendlyName("EmailAddress")
@format("email")
@pattern("^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+\\-]@(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$")
@extension("x-nxgt-scalar", "EmailAddress")
scalar emailAddress extends string;

/** `emailAddress`, under the name @nxgt/typespec gave it first. */
alias email = emailAddress;

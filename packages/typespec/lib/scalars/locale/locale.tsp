import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A well-formed BCP 47 language tag in canonical case, kept as sent, at most
 * 255 characters: `fr`, `fr-FR`, `zh-Hant-TW`, `en-US-u-ca-buddhist`. The
 * language is lowercase, a script Titlecase, a region uppercase, the rest
 * lowercase. The order of extensions and of `-u-` keywords is not in the
 * pattern, nor is the IANA registry.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc5646.
 */
@friendlyName("Locale")
@format("locale")
@pattern("^(?=.{1,255}$)[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\\d{3}))?(?:-(?:[a-z0-9]{5,8}|\\d[a-z0-9]{3}))*(?:-[0-9a-wyz](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?$")
@extension("x-nxgt-scalar", "Locale")
scalar locale extends string;

/**
 * Converts a product name into a URL-safe slug: lowercase, spaces and
 * repeated separators collapsed to single hyphens, anything that isn't a
 * letter/number/hyphen stripped. Used for auto-generating a slug from the
 * product name in the admin form — the field stays editable afterward,
 * this only supplies the initial/suggested value.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
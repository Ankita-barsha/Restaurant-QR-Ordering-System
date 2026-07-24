/**
 * URL slug generation.
 *
 * Slugs give the customer menu readable URLs (/menu/margherita-pizza) and a
 * stable lookup key that does not expose an internal id.
 */

/**
 * Converts a display name into a URL-safe slug.
 *
 * NFD normalisation splits an accented character into a base letter plus a
 * separate combining mark, so stripping the marks turns "Creme Brulee" into
 * "creme-brulee" rather than dropping the accented letters entirely.
 */
export const slugify = (value: string): string =>
  value
    .normalize("NFD")
    // U+0300-U+036F is the Combining Diacritical Marks block. Written as
    // escapes rather than literal characters, which are invisible in an
    // editor and corrupt easily when the file is re-encoded.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Produces a slug that does not collide with an existing one.
 *
 * `exists` is injected rather than querying Prisma here, so this stays a pure
 * function that any model can reuse and that is trivial to unit test.
 *
 * Appends -2, -3, ... rather than a random suffix, keeping URLs predictable.
 */
export const uniqueSlug = async (
  value: string,
  exists: (candidate: string) => Promise<boolean>
): Promise<string> => {
  const base = slugify(value) || "item";

  if (!(await exists(base))) {
    return base;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;

    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  // Practically unreachable; guarantees termination rather than looping.
  return `${base}-${Date.now()}`;
};

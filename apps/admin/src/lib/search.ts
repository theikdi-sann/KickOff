/**
 * Search-term sanitising for the staff console.
 *
 * The order search is interpolated into a PostgREST `or=(...)` filter, so the
 * term has to be a literal value: anything that carries filter syntax has to
 * be removed before it reaches the query.
 */

/**
 * The characters that carry meaning in a PostgREST filter.
 *
 * The term is a search for an order id or a payment reference, so keeping
 * letters, digits, spaces, dashes, underscores, dots and `@` is enough.
 */
const FILTER_METACHARACTERS = /[%*,():"'\\]/g;

/**
 * Strips the PostgREST filter syntax from a user-supplied search term.
 *
 * @param {string} value the raw search term
 * @returns {string} a term that can only be a literal value
 */
export function sanitizeSearchTerm(value: string): string {
  return value.trim().replace(FILTER_METACHARACTERS, "").trim();
}

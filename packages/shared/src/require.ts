/**
 * Narrowing helpers.
 *
 * `docs/ARCHITECTURE.md` §6.1 forbids the non-null assertion (`!`) outside
 * generated types: an assertion tells the compiler to stop checking, so the
 * code keeps its type but loses its safety. These helpers narrow *and* name
 * the value, so a missing value fails with a message instead of a crash at
 * the point of use.
 */

/**
 * Narrows an optional value to a definite one.
 *
 * Used where a value is guaranteed by a guard that the compiler cannot see —
 * a React Query hook that only fetches when an id is present, for example.
 * The id is captured in the query key and the fetch is disabled while it is
 * missing, so the value is always there when the function runs.
 *
 * @param value the value to narrow
 * @param name what the value is, for the error message
 * @returns the value, narrowed
 * @throws Error when the value is missing or empty
 */
export function requireDefined<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

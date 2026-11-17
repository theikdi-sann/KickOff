import { localeFromTag, translate } from '@kickoff/shared';
import { useTenantDisplay } from './queries/tenant';

/**
 * The app's translator (C10.2, GAP-05).
 *
 * One hook, one function: the club's locale (`tenants.locale`, through the
 * cached display query) decides which catalog every literal key resolves
 * against. English needs no catalog — the key *is* the copy — so a missing
 * Thai entry renders the English string instead of a hole, and the coverage
 * contract (`scripts/tests/i18n.test.mjs`) is what keeps the catalog whole.
 *
 * Keys must be literals: a dynamic key cannot be checked against the
 * catalog, and the contract fails on one.
 */
export function useTranslator(): (
  key: string,
  params?: Record<string, string | number>,
) => string {
  const display = useTenantDisplay();
  const locale = localeFromTag(display.locale);
  return (key, params) => translate(locale, key, params);
}

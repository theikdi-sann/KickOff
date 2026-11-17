// GENERATED FILE — do not edit.
// Source: packages/shared/src/i18n.ts
// Regenerate: node scripts/sync-edge-schemas.mjs
//
// Supabase deploys only `supabase/functions/**`, so this copy cannot be an
// import from `@kickoff/shared`. It is generated from the canonical source,
// and a contract test fails if it drifts.

/**
 * The translation layer (C10.2, GAP-05).
 *
 * The model follows the white-label one (ADR-004): one app per club speaks
 * the club's language, so the locale comes from `tenants.locale` — mapped
 * here to a catalog. **The English copy is the key itself**: there is no
 * English catalog to drift, a missing Thai entry degrades to the English
 * string instead of a hole, and interpolation runs on whichever message
 * resolved (an English key with `{name}` in it interpolates too).
 *
 * Coverage is a contract, not a type: `scripts/tests/i18n.test.mjs` fails
 * when a key the apps or the receipt use is missing from the Thai catalog,
 * or when an entry nothing uses lingers.
 */
import { th } from './messages.th.ts';

/** The locales the catalogs cover. */
export type AppLocale = 'en' | 'th';

const CATALOGS: Partial<Record<AppLocale, Record<string, string>>> = { th };

/**
 * Maps a club's BCP-47 tag (`tenants.locale`, e.g. `th-TH`) to a catalog
 * locale. Anything the catalogs do not cover renders English — the product's
 * language until a translation exists.
 */
export function localeFromTag(tag: string): AppLocale {
  return tag.toLowerCase().startsWith('th') ? 'th' : 'en';
}

/**
 * Resolves `key` in `locale` and interpolates `{name}` placeholders.
 *
 * @param locale the catalog to read
 * @param key the English source string (or a `th` key)
 * @param params values for the `{name}` placeholders; a missing one leaves
 *   its placeholder visible rather than printing `undefined`
 */
export function translate(
  locale: AppLocale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = CATALOGS[locale]?.[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

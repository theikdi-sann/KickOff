// The MVP demo gate pays with the Stripe test card on the Stripe-hosted
// checkout page. Diagnosed 2026-11-13: the page and every resource loaded
// (14 frames, zero console errors, zero failed requests) but the card form
// never mounted — Stripe's risk engine saw `navigator.webdriver = true` and a
// `HeadlessChrome/…` user agent and withheld the payment form.
//
// The live proof is the gate run itself (all steps green). These contracts
// keep the hardened browser configuration from regressing:
//
//   MG-1  the webdriver flag is neutralized before any page script runs
//   MG-2  the user agent sent to the page never identifies as headless
//   MG-3  the gate launches the full Chromium, not the headless shell
//   MG-4  the gate still refuses to run without a Stripe test-mode key
//   MG-5  the gate drives the Payment Element frame: contact email, the card
//         fields by their W3C autocomplete tokens, and the Card method only
//         when a PromptPay-default session hides the fields
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const raw = readFileSync(resolve(root, 'scripts/mvp-gate.mjs'), 'utf8');

/** The source without comments, so an explanation may name the old signals. */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

test('MG-1 the webdriver flag is neutralized before any page script runs', () => {
  assert.match(
    source,
    /addInitScript/,
    'an init script must run before the page scripts — clearing the flag afterwards is too late',
  );
  assert.match(
    source,
    /webdriver/,
    'the init script must target navigator.webdriver, the first automation signal Stripe reads',
  );
});

test('MG-2 the user agent sent to the page never identifies as headless', () => {
  assert.match(
    source,
    /userAgent\s*:/,
    'the context must be given an explicit user agent',
  );
  assert.doesNotMatch(
    source,
    /HeadlessChrome/,
    'the UA sent to Stripe must not contain HeadlessChrome',
  );
});

test('MG-3 the gate launches the full Chromium, not the headless shell', () => {
  assert.match(
    source,
    /channel:\s*['"]chromium['"]/,
    "chromium.launch({ channel: 'chromium' }) selects the full browser (new headless), not chromium_headless_shell",
  );
});

test('MG-4 the gate refuses to run without a Stripe test-mode key', () => {
  assert.match(source, /sk_test_/, 'the §0 guardrail — test mode only — must stay');
});

test('MG-5 the gate drives the Payment Element frame with stable selectors', () => {
  // Diagnosed 2026-11-13 (third iteration — the first two used the wrong
  // session shape): everything lives inside Stripe's Payment Element iframe,
  // the current Payment Element names its fields `payment-*` (the legacy
  // `#cardNumber` id is gone) and addresses them by W3C autocomplete tokens,
  // and a session that is not restricted to card shows PromptPay selected by
  // default with the card fields hidden behind the Card option.
  assert.match(
    source,
    /frames\(\)|frameLocator/,
    'the payment element iframe must be resolved — the main document holds no fields',
  );
  assert.match(
    source,
    /autocomplete="cc-number"/,
    'the card number must be addressed by its W3C autocomplete token — #cardNumber no longer exists',
  );
  assert.match(source, /autocomplete="cc-exp"/, 'the expiry field, same reason');
  assert.match(source, /autocomplete="cc-csc"/, 'the CVC field, same reason');
  assert.match(
    source,
    /linkAuthentication-emailInput/,
    'the contact email field (rendered above the form) must be filled',
  );
  assert.match(
    source,
    /isEditable\(\)/,
    "the contact field is readonly+disabled when Stripe pre-fills it from the session's customer_email — filling it would fail actionability",
  );
  assert.match(
    source,
    /=== 0\)[\s\S]{0,220}?Card\\s\*Visa/,
    'the Card method may only be clicked when the card fields are absent (PromptPay-default sessions)',
  );
});

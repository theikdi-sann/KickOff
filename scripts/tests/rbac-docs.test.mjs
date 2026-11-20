// RBAC-D1…RBAC-D6 — the REQ-046 documentation contract.
//
// Custom per-club roles are a *tracked open requirement*, not a shipped
// capability. The failure mode this file prevents is documentation drift in
// the optimistic direction: a rewording that drops the "open" state, deletes a
// pending acceptance ID, or describes `customer` as a third staff role.
//
// These contracts are green today because the documentation is internally
// consistent. They do not prove the feature; `rbac-acceptance.test.mjs` holds
// the pending RBAC-1…RBAC-8 cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const requirements = read('docs/REQUIREMENTS.md');
const srs = read('docs/SRS.md');
const testing = read('docs/TESTING.md');
const security = read('docs/SECURITY.md');
const architecture = read('docs/ARCHITECTURE.md');
const truth = read('docs/TRUTH.md');
const acceptance = read('scripts/tests/rbac-acceptance.test.mjs');

const CAPABILITIES = [
  'manage_staff',
  'operate_gate',
  'manage_matches',
  'manage_venues',
  'publish_news',
  'refund_orders',
  'read_audit',
  'manage_settings',
  'export_data',
  'view_reports',
];

test('RBAC-D1 REQ-046 exists in REQUIREMENTS and SRS and is open', () => {
  for (const [name, doc] of [
    ['REQUIREMENTS.md', requirements],
    ['SRS.md', srs],
  ]) {
    assert.match(doc, /REQ-046/, `${name} must carry REQ-046`);
    assert.match(
      doc,
      /REQ-046[^\n]*\bopen\b|REQ-046[\s\S]{0,120}\(\`open\`\)/i,
      `${name} must state that REQ-046 is open`,
    );
  }
});

test('RBAC-D2 NFR-10 is open and GAP-11 is registered', () => {
  assert.match(
    requirements,
    /\|\s*NFR-10\s*\|[^\n]*\*\*open\*\*/i,
    'REQUIREMENTS.md NFR-10 must be open',
  );
  assert.match(
    srs,
    /\|\s*NFR-10\s*\|[^\n]*\*\*open\*\*/i,
    'SRS.md NFR-10 must be open',
  );
  assert.match(requirements, /GAP-11/, 'REQUIREMENTS.md must register GAP-11');
  assert.match(requirements, /GAP-11[^\n]*REQ-046|REQ-046[^\n]*GAP-11/i,
    'GAP-11 must point at REQ-046');
});

test('RBAC-D3 every pending acceptance ID is listed and registered as todo', () => {
  for (let i = 1; i <= 8; i += 1) {
    assert.match(
      testing,
      new RegExp(`RBAC-${i}\\b`),
      `TESTING.md §10 must list RBAC-${i}`,
    );
    assert.match(
      acceptance,
      new RegExp(`RBAC-${i}\\b`),
      `rbac-acceptance.test.mjs must register RBAC-${i}`,
    );
  }
  assert.match(testing, /pending/i, 'TESTING.md must mark the suite pending');
  assert.match(testing, /test\.todo/, 'TESTING.md must state the todo convention');
});

test('RBAC-D4 no document claims custom RBAC is shipped or out of scope', () => {
  const docs = {
    'REQUIREMENTS.md': requirements,
    'SRS.md': srs,
    'ARCHITECTURE.md': architecture,
    'SECURITY.md': security,
    'TESTING.md': testing,
    'TRUTH.md': truth,
  };
  for (const [name, doc] of Object.entries(docs)) {
    assert.doesNotMatch(
      doc,
      /custom (?:staff )?(?:roles?|rbac)[^\n]{0,80}\bshipped\b/i,
      `${name} must not claim custom RBAC is shipped`,
    );
    assert.doesNotMatch(
      doc,
      /custom (?:staff )?roles?[^\n]{0,80}out of scope/i,
      `${name} must not call custom roles out of scope (they are REQ-046)`,
    );
  }
  assert.match(
    requirements,
    /REQ-046[^\n]*\*\*open\*\*|\*\*open\*\*[^\n]*REQ-046/i,
    'REQ-046 must be explicitly open',
  );
});

test('RBAC-D5 the capability catalogue is closed and mirrored', () => {
  for (const capability of CAPABILITIES) {
    assert.match(
      requirements,
      new RegExp('`' + capability + '`'),
      `REQUIREMENTS.md must define capability ${capability}`,
    );
    assert.match(
      security,
      new RegExp('`' + capability + '`'),
      `SECURITY.md must mirror capability ${capability}`,
    );
  }
  assert.match(
    requirements,
    /`admin`\s*=\s*all ten capabilities/i,
    'admin must seed all ten capabilities',
  );
  assert.match(
    requirements,
    /`gatekeeper`\s*=\s*`operate_gate` only/i,
    'gatekeeper must seed exactly operate_gate',
  );
  assert.match(
    security,
    /`admin`\s*=\s*all ten/i,
    'SECURITY.md must mirror the admin seed',
  );
});

test('RBAC-D6 customer is described as the absence of a membership', () => {
  for (const [name, doc] of [
    ['ARCHITECTURE.md', architecture],
    ['REQUIREMENTS.md', requirements],
    ['SECURITY.md', security],
    ['RUNBOOK.md', read('docs/RUNBOOK.md')],
    ['TRUTH.md', truth],
  ]) {
    assert.match(
      doc,
      /customer[^\n]{0,120}(?:absence|no)\s+(?:of\s+)?(?:a\s+)?`?staff_members`?\s+row|absence of a `staff_members` row/i,
      `${name} must define customer as the absence of a staff_members row`,
    );
  }
  assert.match(
    architecture,
    /Staff roles are exactly `admin` and `gatekeeper`/,
    'ARCHITECTURE.md must state the two built-in staff roles',
  );
});

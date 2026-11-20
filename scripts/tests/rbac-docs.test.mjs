// RBAC-D1…RBAC-D6 — REQ-046 documentation stays aligned with the shipped state.
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

const CAPABILITIES = [
  'manage_staff', 'operate_gate', 'manage_matches', 'manage_venues',
  'publish_news', 'refund_orders', 'read_audit', 'manage_settings',
  'export_data', 'view_reports',
];

test('RBAC-D1 REQ-046 is shipped in REQUIREMENTS and SRS', () => {
  for (const [name, doc] of [['REQUIREMENTS.md', requirements], ['SRS.md', srs]]) {
    assert.match(doc, /REQ-046/);
    assert.match(doc, /REQ-046[^\n]*shipped|shipped[^\n]*REQ-046/i,
      `${name} must state that REQ-046 is shipped`);
  }
});

test('RBAC-D2 NFR-10 is shipped and GAP-11 is closed', () => {
  assert.match(requirements, /\|\s*NFR-10\s*\|[^\n]*\*\*shipped\*\*/i);
  assert.match(srs, /\|\s*NFR-10\s*\|[^\n]*\*\*shipped\*\*/i);
  assert.match(requirements, /GAP-11[^\n]*closed/i);
});

test('RBAC-D3 every acceptance ID is mapped', () => {
  for (let i = 1; i <= 8; i += 1) {
    assert.match(testing, new RegExp(`RBAC-${i}\\b`));
  }
  assert.match(testing, /rbac\.test\.sql/);
  assert.match(testing, /rbac-api\.test\.ts/);
});

test('RBAC-D4 no document calls custom roles open or out of scope', () => {
  for (const [name, doc] of Object.entries({
    'REQUIREMENTS.md': requirements, 'SRS.md': srs, 'ARCHITECTURE.md': architecture,
    'SECURITY.md': security, 'TESTING.md': testing, 'TRUTH.md': truth,
  })) {
    assert.doesNotMatch(doc, /REQ-046[^\n]{0,120}\bopen\b/i, `${name} must not call REQ-046 open`);
    assert.doesNotMatch(doc, /custom (?:staff )?roles?[^\n]{0,80}out of scope/i);
  }
});

test('RBAC-D5 the capability catalogue is closed and mirrored', () => {
  for (const capability of CAPABILITIES) {
    assert.match(requirements, new RegExp('`' + capability + '`'));
    assert.match(security, new RegExp('`' + capability + '`'));
  }
});

test('RBAC-D6 customer is the absence of a staff membership', () => {
  for (const doc of [requirements, architecture, security, truth]) {
    assert.match(
      doc,
      /customer[\s\S]{0,200}(?:absence\s+of\s+a\s+`?staff_members`?\s+row|no\s+`?staff_members`?\s+row)/i,
    );
  }
});

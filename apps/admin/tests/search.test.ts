// The order search is interpolated into a PostgREST `or=(...)` filter, so the
// term must be reduced to a literal value before it reaches the query.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSearchTerm } from '../src/lib/search.ts';

test('a plain search term is preserved', () => {
  assert.equal(sanitizeSearchTerm('ord_123'), 'ord_123');
  assert.equal(sanitizeSearchTerm('pi_abc123'), 'pi_abc123');
  assert.equal(sanitizeSearchTerm('  order 42  '), 'order 42');
});

test('the filter metacharacters are stripped', () => {
  assert.equal(sanitizeSearchTerm('%'), '');
  assert.equal(sanitizeSearchTerm('a,b'), 'ab');
  assert.equal(sanitizeSearchTerm('a(b)c'), 'abc');
  assert.equal(sanitizeSearchTerm('a*b'), 'ab');
  assert.equal(sanitizeSearchTerm('a:b'), 'ab');
  assert.equal(sanitizeSearchTerm('a"b'), 'ab');
  assert.equal(sanitizeSearchTerm("a'b"), 'ab');
});

test('a crafted filter cannot survive', () => {
  // The classic PostgREST injection: close the group and add a condition.
  const crafted = 'x),not.is.null,id.ilike.%y';
  const sanitized = sanitizeSearchTerm(crafted);

  assert.equal(sanitized.includes(','), false, 'a comma would start another condition');
  assert.equal(sanitized.includes('('), false, 'a parenthesis would close the group');
  assert.equal(sanitized.includes(')'), false, 'a parenthesis would close the group');
  assert.equal(sanitized.includes('%'), false, 'a wildcard would broaden the filter');
});

test('an empty result is not searched for', () => {
  assert.equal(sanitizeSearchTerm('   '), '');
  assert.equal(sanitizeSearchTerm('%%%'), '');
});

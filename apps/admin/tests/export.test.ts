// REQ-24 — the orders CSV must be RFC-4180 and open correctly in Excel.
//
// The refund path is executed by `supabase/functions/tests/refund-order.test.ts`;
// this covers the export half, including the BOM Thai text needs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/lib/export.ts';

test('CSV starts with a UTF-8 BOM and uses CRLF rows', () => {
  const csv = toCsv([{ name: 'Nara', total: 350 }], [
    { key: 'name', label: 'Name' },
    { key: 'total', label: 'Total' },
  ]);

  assert.equal(csv.startsWith('\uFEFF'), true, 'Excel needs the BOM to read Thai text');
  assert.equal(csv, '\uFEFFName,Total\r\nNara,350\r\n');
});

test('CSV quotes commas, quotes and newlines', () => {
  const csv = toCsv(
    [
      { note: 'a,b', name: 'Nara "Nok"' },
      { note: 'line one\nline two', name: 'Kiet' },
    ],
    [
      { key: 'note', label: 'Note' },
      { key: 'name', label: 'Name' },
    ],
  );

  assert.match(csv, /"a,b","Nara ""Nok"""/);
  assert.match(csv, /"line one\nline two",Kiet/);
});

test('CSV writes null and undefined as empty cells', () => {
  const csv = toCsv([{ a: null, b: undefined }], [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ]);

  assert.equal(csv, '\uFEFFA,B\r\n,\r\n');
});

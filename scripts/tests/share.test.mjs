// Phase B — punch list #5+#6: shareable pass image (wallet dropped).
//
// The pass screen's share sent plain text, and "Add to wallet" was a
// dead-end alert ("Apple Wallet passes are not part of this release").
// The walkthrough decision: drop the wallet button, share a real image
// of the pass instead — capture the pass view to a PNG and hand it to
// the OS share sheet (react-native-view-shot ships in Expo Go). Locks in:
//   1. the capture dependency is installed,
//   2. the pass screen captures the pass view and shares it as an image,
//   3. the wallet dead-end is gone, replaced by the share action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

test('SH-1 the view-capture dependency is installed', () => {
  const pkg = readJson('apps/mobile/package.json');

  assert.ok(
    pkg.dependencies['react-native-view-shot'],
    'apps/mobile must depend on react-native-view-shot (included in Expo Go)',
  );
});

test('SH-2 the pass screen captures the pass view and shares it as an image', () => {
  const source = read('apps/mobile/src/app/ticket/[id].tsx');

  assert.match(source, /captureRef\(/, 'sharing must capture the pass view to an image');
  assert.match(source, /passRef/, 'the capture needs a ref on the pass container');
  assert.match(source, /mimeType: 'image\/png'/, 'the share sheet must receive a PNG');
  assert.match(source, /shareAsync\(/, 'the image must go through the OS share sheet');
  assert.match(
    source,
    /Share\.share/,
    'a text fallback must remain for when capture or sharing is unavailable',
  );
});

test('SH-3 the wallet dead-end is replaced by the share action', () => {
  const source = read('apps/mobile/src/app/ticket/[id].tsx');

  assert.doesNotMatch(
    source,
    /Add to wallet/,
    'the wallet button is dropped — it only ever showed an unavailable alert',
  );
  assert.doesNotMatch(
    source,
    /Wallet pass unavailable/,
    'the unavailable alert must be gone with the button',
  );
  assert.match(source, /Share pass/, 'the actions row must offer the image share');
});

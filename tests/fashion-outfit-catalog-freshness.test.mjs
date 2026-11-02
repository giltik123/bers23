import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../src/components/editor/outfits/OutfitPanel.jsx', import.meta.url), 'utf8');

test('Outfit catalog starts unconfirmed and mutations require a confirmed read', () => {
  assert.match(panel, /const \[catalogFresh, setCatalogFresh\] = useState\(false\)/);
  assert.match(panel, /const mutationLocked = Boolean\(busy\) \|\| !catalogFresh/);
  assert.match(panel, /if \(!newName\.trim\(\) \|\| mutationLocked\) return/);
  assert.match(panel, /if \(!selected \|\| mutationLocked\) return false/);
  assert.ok((panel.match(/disabled=\{mutationLocked/g) || []).length >= 8,
    'editing controls must be disabled while the Outfit catalog is unconfirmed');
  assert.equal((panel.match(/disabled=\{Boolean\(busy\)/g) || []).length, 1,
    'only the explicit Reload control may remain available after a failed read');
});

test('late canonical list responses cannot overwrite a newer reload or reconciliation', () => {
  assert.match(panel, /const loadRequestRef = useRef\(0\)/);
  assert.ok((panel.match(/const request = \+\+loadRequestRef\.current/g) || []).length >= 2);
  assert.ok((panel.match(/if \(request !== loadRequestRef\.current\) return/g) || []).length >= 2);
  assert.match(panel, /return \(\) => \{ loadRequestRef\.current \+= 1; \}/,
    'unmount must invalidate pending reads');
  assert.match(panel, /loadRequestRef\.current \+= 1;\s*setBusy\('create'\)/);
  assert.match(panel, /loadRequestRef\.current \+= 1;\s*setBusy\(key\)/);
});

test('failed read and failed mutation reconciliation keep stale Outfit entries read-only', () => {
  const reload = panel.slice(panel.indexOf('const reload = useCallback'), panel.indexOf('const reconcileQuietly = useCallback'));
  const reconcile = panel.slice(panel.indexOf('const reconcileQuietly = useCallback'), panel.indexOf('useEffect(() => {'));
  assert.match(reload, /setCatalogFresh\(false\)/);
  assert.match(reload, /applySnapshot\(snapshot\);\s*setCatalogFresh\(true\)/);
  assert.match(reload, /if \(request === loadRequestRef\.current\) \{\s*setError\(/);
  assert.match(reconcile, /setCatalogFresh\(false\)/);
  assert.match(reconcile, /applySnapshot\(snapshot\);\s*setCatalogFresh\(true\)/);
  assert.match(reconcile, /catch \{ \/\* Keep the originating mutation error; the stale catalog remains read-only/);
  assert.match(panel, /await reconcileQuietly\(\)/);
  assert.doesNotMatch(panel, /Canonical state was refreshed/,
    'the UI must not claim a successful refresh when the recovery read failed');
  assert.match(panel, /onClick=\{\(\) => reload\(\)\} disabled=\{Boolean\(busy\)\}/);
});

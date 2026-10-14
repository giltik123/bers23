import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { manualTryOnSelectionKey, isFreshManualTryOnLoad } from '../src/application/fashion/manualTryOnSelectionGuard.js';

const selection = {
  projectId: 'project-one', sourceArtifactId: 'source-1',
  entryId: 'entry-1',
  outfit: {
    id: 'outfit-one', revision: 2,
    entries: [{ entryId: 'entry-1', garmentId: 'shirt-a', garmentCategory: 'shirts' }],
  },
};
test('same identity permits one current asynchronous source load', () => {
  const key = manualTryOnSelectionKey(selection);
  assert.equal(isFreshManualTryOnLoad(4,4,key,key),true);
  assert.equal(isFreshManualTryOnLoad(4,5,key,key),false);
  assert.equal(isFreshManualTryOnLoad(0,0,key,key),false);
});

test('source, Outfit revision, entry, garment and Project identity invalidate prior download', () => {
  const baseline = manualTryOnSelectionKey(selection);
  const mutants = [
    {...selection, projectId:'project-two'},
    {...selection, sourceArtifactId:'source-2'},
    {...selection, outfit:{...selection.outfit,id:'outfit-two'}},
    {...selection, outfit:{...selection.outfit,revision:3}},
    {...selection, entryId:'entry-2'},
    {...selection, outfit:{...selection.outfit,entries:[{entryId:'entry-1',garmentId:'coat-b',garmentCategory:'jackets'}]}},
    {...selection, outfit:{...selection.outfit,entries:[{entryId:'entry-1',garmentId:'shirt-a',garmentCategory:'jackets'}]}},
  ];
  for(const candidate of mutants) {
    const next=manualTryOnSelectionKey(candidate);
    assert.notEqual(next,baseline);
    assert.equal(isFreshManualTryOnLoad(4,4,baseline,next),false);
  }
});

test('ambiguous duplicate entry or empty selection cannot reuse old garment evidence', () => {
  const baseline=manualTryOnSelectionKey(selection);
  const duplicated={...selection,outfit:{...selection.outfit,entries:[...selection.outfit.entries,...selection.outfit.entries]}};
  assert.notEqual(manualTryOnSelectionKey(duplicated),baseline);
  assert.equal(manualTryOnSelectionKey(null),null);
  assert.equal(isFreshManualTryOnLoad(1,1,null,null),false);
});

test('Fashion panel checks the stale response before it can open either manual editor', async () => {
  const source=await readFile('src/components/editor/outfits/CanonicalTryOnManualRemediationPanel.jsx','utf8');
  assert.match(source, /loadSequenceRef\.current \+= 1/);
  assert.match(source, /manualTryOnSelectionKey\(selection\)/);
  assert.match(source, /isFreshManualTryOnLoad\(/);
  assert.match(source, /openedSelectionKeyRef\.current === selectionKey/);
  assert.match(source, /savedSelectionKeyRef\.current === selectionKey/);
  assert.match(source, /source\?\.garmentId !== livePolicy\.contourRequest\.garmentId/);
  assert.match(source, /requestedSelectionKey !== currentSelectionKeyRef\.current|isFreshManualTryOnLoad/);
});

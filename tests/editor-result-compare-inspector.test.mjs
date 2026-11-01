import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canCompareOperationAligned, canComparePixelsAligned, nativeInspectionCanvasSize } from '../src/components/editor/compareGeometryPolicy.js';
import { reviewCandidateIdentity, canAcceptReviewedCandidate } from '../src/application/editor/ai-first/resultReviewGate.js';

test('precise before/after split requires identical real image dimensions',()=>{
  assert.equal(canComparePixelsAligned({width:512,height:768},{width:512,height:768}),true);
  assert.equal(canComparePixelsAligned({width:768,height:512},{width:512,height:768}),false,'rotations must not align');
  assert.equal(canComparePixelsAligned({width:512,height:768},{width:256,height:384}),false,'resized frames must not align');
  assert.equal(canComparePixelsAligned({width:512,height:768},{width:512,height:767}),false,'crops must not align');
  for(const candidate of [
    null,undefined,{}, {width:0,height:1},{width:1,height:-2},
    {width:1.5,height:1},{width:16385,height:1},{width:8192,height:8192},
    {width:NaN,height:3},{width:'512',height:768},
  ]) assert.equal(canComparePixelsAligned({width:512,height:768},candidate),false);
});

test('ResultCompare presents accessible split and zoom but changes Project only through explicit callbacks',async()=>{
  const component=await readFile('src/components/editor/ResultCompare.jsx','utf8');
  const editor=await readFile('src/pages/Editor.jsx','utf8');
  assert.match(component,/canComparePixelsAligned\(beforeSize, afterSize\)/u);
  assert.match(component,/geometry === 'aligned' && canCompareOperationAligned\(candidateOperation\)/u);
  assert.match(component,/disabled=\{!splitAllowed\}/u);
  assert.match(component,/aria-label=\{language === 'ru' \? t\('editControls\.compareMode'\)/u);
  assert.match(component,/aria-pressed=\{mode === 'split'\}/u);
  assert.match(component,/aria-label=\{language === 'ru' \? t\('editControls\.boundary'\)/u);
  assert.match(component,/max="100" step="1"/u);
  assert.match(component,/aria-label=\{language === 'ru' \? t\('editControls\.zoom'\)/u);
  assert.match(component,/<option value=\{2\}>200%<\/option>/u);
  assert.match(component,/style=\{\{ clipPath:/u);
  assert.match(component,/disabled=\{busy\}/u);
  for(const accepted of ['onAccept','onDiscard','onRetry']) assert.match(component,new RegExp(`onClick=\\{${accepted}\\}`,'u'));
  for(const forbidden of ['coreClient','fetch(','persistFinal','uploadArtifact','changePlan','chargeCredits','Accept automatically']) {
    assert.equal(component.includes(forbidden),false,`forbidden preview authority: ${forbidden}`);
  }
  assert.match(editor,/<ResultCompare[\s\S]*candidateOperation=\{pendingResult\.kind\}/u);
  assert.match(editor,/<ResultCompare[\s\S]*onAccept=\{acceptResult\}/u);
  assert.match(editor,/onDiscard=\{discardResult\}/u);
  assert.match(editor,/onRetry=\{retryResult\}/u);
});

test('split operation admission excludes same-size flips and unverified AI re-render',()=>{
  for(const supported of ['MASKED_EXPOSURE','MASKED_WHITE_BALANCE','MASKED_LEVELS','BACKGROUND_ISOLATION','FASHION_TRYON']) {
    assert.equal(canCompareOperationAligned(supported),true,supported);
  }
  for(const unregistered of ['ORTHOGONAL_TRANSFORM','CROP','RESIZE','SUPER_RESOLUTION','GENERATE','REPLACE_OBJECT','ROTATE_180','',null,undefined]) {
    assert.equal(canCompareOperationAligned(unregistered),false,String(unregistered));
  }
});

test('zoom is genuine bounded native-pixel inspection, not an arbitrary scaled preview container', async()=>{
  assert.deepEqual(nativeInspectionCanvasSize({width:1024,height:768},1),{width:1024,height:768});
  assert.deepEqual(nativeInspectionCanvasSize({width:1024,height:768},2),{width:2048,height:1536});
  assert.deepEqual(nativeInspectionCanvasSize({width:8192,height:1024},2),{width:16384,height:2048});
  for(const v of [{width:8192,height:8192},{width:0,height:30},{width:1.2,height:100},null]) {
    assert.equal(nativeInspectionCanvasSize(v,1),null);
  }
  assert.equal(nativeInspectionCanvasSize({width:100,height:200},1.5),null);
  const component=await readFile('src/components/editor/ResultCompare.jsx','utf8');
  assert.match(component,/nativeInspectionCanvasSize\(naturalSize, zoom\)/u);
  assert.match(component,/disabled=\{!naturalSize\}/u);
  assert.match(component,/style=\{inspectedCanvas\}/u);
  assert.doesNotMatch(component,/width: `\$\{zoom \* 100\}%`/u);
});

test('all candidates require their own successfully decoded preview before Accept, not just Fashion/AI', async () => {
  const first = reviewCandidateIdentity({
    beforeUrl: '/source-a', afterUrl: '/candidate-a',
    finalArtifactId: 'final-a', executionId: 'run-a', kind: 'CROP',
  });
  const next = reviewCandidateIdentity({
    beforeUrl: '/source-a', afterUrl: '/candidate-b',
    finalArtifactId: 'final-b', executionId: 'run-b', kind: 'CROP',
  });
  const base = {
    identity: first, acknowledgedIdentity: first,
    afterLoadedIdentity: null, beforeLoadedIdentity: null,
    afterErrorIdentity: null, beforeErrorIdentity: null,
    requiresBefore: false, requiresReview: false,
    reviewComplete: true, busy: false,
  };
  assert.equal(canAcceptReviewedCandidate(base), false, 'unloaded preview must not be accepted');
  assert.equal(canAcceptReviewedCandidate({ ...base, afterErrorIdentity: first }), false, 'failed preview must not be accepted');
  assert.equal(canAcceptReviewedCandidate({ ...base, afterLoadedIdentity: first }), true, 'decoded current preview can be accepted');
  assert.equal(canAcceptReviewedCandidate({ ...base, afterLoadedIdentity: first, busy: true }), false, 'busy commit must not be accepted');
  assert.equal(canAcceptReviewedCandidate({ ...base, identity: next, afterLoadedIdentity: first }), false, 'stale decoded preview must not admit next candidate');
  assert.equal(canAcceptReviewedCandidate({ ...base, identity: next, afterLoadedIdentity: next }), false, 'next candidate needs its own identity acknowledgement');
  assert.equal(canAcceptReviewedCandidate({ ...base, identity: next, acknowledgedIdentity: next, afterLoadedIdentity: next }), true);

  const component = await readFile('src/components/editor/ResultCompare.jsx', 'utf8');
  assert.match(component, /const reviewBlocked = !canAcceptReviewedCandidate\(\{/u);
  assert.match(component, /requiresBefore: needsHumanReview/u);
  assert.match(component, /requiresReview: needsHumanReview/u);
  assert.match(component, /disabled=\{busy \|\| reviewBlocked\}/u);
  assert.match(component, /loaded\.after !== identity && failed\.after !== identity/u);
  assert.match(component, /failed\.after === identity \|\| \(needsHumanReview && failed\.before === identity\)/u);
});

test('human-scoped/Fashion review still requires both previews and affirmative review', () => {
  const identity = reviewCandidateIdentity({
    beforeUrl: '/original', afterUrl: '/fashion',
    finalArtifactId: 'final-f', executionId: 'run-f', kind: 'FASHION_TRYON',
  });
  const base = {
    identity, acknowledgedIdentity: identity,
    afterLoadedIdentity: identity, beforeLoadedIdentity: null,
    afterErrorIdentity: null, beforeErrorIdentity: null,
    requiresBefore: true, requiresReview: true,
    reviewComplete: false, busy: false,
  };
  assert.equal(canAcceptReviewedCandidate(base), false, 'before image is required');
  assert.equal(canAcceptReviewedCandidate({ ...base, beforeLoadedIdentity: identity }), false, 'human review is required');
  assert.equal(canAcceptReviewedCandidate({ ...base, beforeLoadedIdentity: identity, reviewComplete: true }), true);
  assert.equal(canAcceptReviewedCandidate({ ...base, beforeLoadedIdentity: identity, beforeErrorIdentity: identity, reviewComplete: true }), false);
});

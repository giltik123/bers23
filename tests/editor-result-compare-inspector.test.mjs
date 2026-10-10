import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canComparePixelsAligned } from '../src/components/editor/compareGeometryPolicy.js';

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
  assert.match(component,/geometry !== 'aligned'/u);
  assert.match(component,/aria-label="Image comparison mode"/u);
  assert.match(component,/aria-pressed=\{mode === 'split'\}/u);
  assert.match(component,/aria-label="Split boundary"/u);
  assert.match(component,/max="100" step="1"/u);
  assert.match(component,/aria-label="Inspection zoom"/u);
  assert.match(component,/<option value=\{2\}>200%<\/option>/u);
  assert.match(component,/style=\{\{ clipPath:/u);
  assert.match(component,/disabled=\{busy\}/u);
  for(const accepted of ['onAccept','onDiscard','onRetry']) assert.match(component,new RegExp(`onClick=\\{${accepted}\\}`,'u'));
  for(const forbidden of ['coreClient','fetch(','persistFinal','uploadArtifact','changePlan','chargeCredits','Accept automatically']) {
    assert.equal(component.includes(forbidden),false,`forbidden preview authority: ${forbidden}`);
  }
  assert.match(editor,/<ResultCompare[\s\S]*onAccept=\{acceptResult\}/u);
  assert.match(editor,/onDiscard=\{discardResult\}/u);
  assert.match(editor,/onRetry=\{retryResult\}/u);
});

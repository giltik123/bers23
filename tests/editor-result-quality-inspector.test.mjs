import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  availableInspectorModes,
  clampComparisonSplit,
  clampInspectorPan,
  INSPECTOR_ZOOM_LEVELS,
  isComparableGeometry,
  nextInspectorZoom,
} from '../src/components/editor/qualityInspectorGeometry.js';

const same={width:512,height:768};
const different={width:256,height:384};

test('Quality Inspector only allows split if source and FINAL dimensions match exactly', () => {
  assert.equal(isComparableGeometry(same,{width:512,height:768}),true);
  assert.equal(isComparableGeometry(same,different),false);
  assert.equal(isComparableGeometry(same,{width:768,height:512}),false);
  for(const value of [null,undefined,{width:0,height:20},{width:20,height:NaN},{width:20,height:2.5},{width:-1,height:80}]) {
    assert.equal(isComparableGeometry(same,value),false);
  }
  assert.deepEqual(availableInspectorModes(same,{width:512,height:768}),['before','after','split']);
  assert.deepEqual(availableInspectorModes(same,different),['before','after']);
});

test('Comparison split is a finite, bounded, stable percentage', () => {
  assert.equal(clampComparisonSplit(0),0);
  assert.equal(clampComparisonSplit(50.5),51);
  assert.equal(clampComparisonSplit(-99),0);
  assert.equal(clampComparisonSplit(109),100);
  for(const value of [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY]) {
    assert.throws(()=>clampComparisonSplit(value),/finite/);
  }
});

test('Editor quality zoom is closed set, and pan cannot escape image limits', () => {
  assert.deepEqual(INSPECTOR_ZOOM_LEVELS,[1,2,4]);
  assert.equal(Object.isFrozen(INSPECTOR_ZOOM_LEVELS),true);
  assert.equal(nextInspectorZoom(1,'in'),2);
  assert.equal(nextInspectorZoom(2,'in'),4);
  assert.equal(nextInspectorZoom(4,'in'),4);
  assert.equal(nextInspectorZoom(4,'out'),2);
  assert.equal(nextInspectorZoom(1,'out'),1);
  assert.deepEqual(clampInspectorPan({x:200,y:-200},1),{x:0,y:0});
  assert.deepEqual(clampInspectorPan({x:200,y:-200},2),{x:50,y:-50});
  assert.deepEqual(clampInspectorPan({x:-200,y:200},4),{x:-150,y:150});
  assert.equal(Object.isFrozen(clampInspectorPan({x:1,y:2},4)),true);
  for(const geometry of [{x:NaN,y:0},{x:0,y:Infinity},null,{}]) {
    assert.throws(()=>clampInspectorPan(geometry,2),/invalid/);
  }
  for(const zoom of [-1,0,1.5,3,10,NaN]) {
    assert.throws(()=>clampInspectorPan({x:0,y:0},zoom),/invalid/);
  }
  assert.throws(()=>nextInspectorZoom(1,'other'),/Unsupported/);
});

test('Quality UI retains Core-owned explicit Accept, Discard, Retry and never executes provider or artifact authority', async () => {
  const source=await readFile('src/components/editor/ResultCompare.jsx','utf8');
  assert.match(source, /onClick=\{onAccept\}/);
  assert.match(source, /onClick=\{onDiscard\}/);
  assert.match(source, /onClick=\{onRetry\}/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(source, /aria-pressed=\{mode === value\}/);
  assert.match(source, /disabled=\{value === 'split' && !sameGeometry\}/);
  assert.match(source, /aria-label="Comparison split position"/);
  assert.match(source, /onPointerCancel=\{pointerCancel\}/);
  assert.match(source, /onKeyDown=\{handleKeys\}/);
  assert.match(source, /'Viewing does not change the Project or image bytes'|Viewing does not change the Project or image bytes/);
  for (const forbidden of ['coreClient','persistFinal','issueStoredFinal','executeWorkflow','walletBalance','billingEngine','creditsWallet','fetch(', 'localStorage.', 'sessionStorage.']) {
    assert.equal(source.includes(forbidden),false,`ResultCompare cannot assume authority: ${forbidden}`);
  }
});

test('Image comparison clips After on the RIGHT while Before remains on the LEFT',async()=>{
  const source=await readFile('src/components/editor/ResultCompare.jsx','utf8');
  assert.match(source,/const afterClipLeft = mode === 'before' \? 100 : mode === 'after' \? 0 : split/);
  assert.match(source,/clipPath: `inset\(0 0 0 \$\{afterClipLeft\}%\)`/);
  assert.match(source,/style=\{transform\}/);
  assert.match(source,/setBeforeSize\(\{ width: event\.currentTarget\.naturalWidth/);
  assert.match(source,/setAfterSize\(\{ width: event\.currentTarget\.naturalWidth/);
});

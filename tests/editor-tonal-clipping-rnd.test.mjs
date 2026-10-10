import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeEditorTonalClippingRgba8 } from '../src/platform/creative/deterministic/EditorTonalClippingRND.ts';

test('reports new clipped highlight and crushed shadow only on editable visible pixels',()=>{
  const source=Uint8Array.from([
    100,100,100,255,
    5,5,5,255,
    20,20,20,255,
    255,0,0,0,
  ]);
  const result=Uint8Array.from([
    255,100,100,255,
    0,0,0,255,
    1,1,1,255,
    255,255,255,0,
  ]);
  const matte=Uint8Array.from([255,0,128,255]);
  const report=analyzeEditorTonalClippingRgba8(source,result,4,1,matte);
  assert.deepEqual(report,{
    visiblePixelCount:3,editableVisiblePixelCount:2,
    originallyBrightPixelCount:0,resultingBrightPixelCount:1,
    newlyBrightEditablePixelCount:1,
    originallyCrushedShadowPixelCount:1,resultingCrushedShadowPixelCount:2,
    newlyCrushedEditablePixelCount:1,
    clipThreshold:250,shadowThreshold:5,
    releaseQualityDecision:'UNREVIEWED_DIAGNOSTIC_ONLY',
  });
  assert.equal(Object.isFrozen(report),true);
});

test('transparent hidden RGB does not appear as visible clipping or a false high contrast defect',()=>{
  const source=Uint8Array.from([255,255,255,0, 1,1,1,0]);
  const result=Uint8Array.from([0,0,0,0, 255,255,255,0]);
  const report=analyzeEditorTonalClippingRgba8(source,result,2,1);
  assert.equal(report.visiblePixelCount,0);
  assert.equal(report.resultingBrightPixelCount,0);
  assert.equal(report.newlyBrightEditablePixelCount,0);
  assert.equal(report.newlyCrushedEditablePixelCount,0);
});

test('source and result are immutable and the advisory can run without a mask',()=>{
  const src=Uint8Array.from([10,20,30,255]);
  const after=Uint8Array.from([255,20,30,255]);
  const report=analyzeEditorTonalClippingRgba8(src,after,1,1);
  assert.equal(report.newlyBrightEditablePixelCount,1);
  assert.equal(src[0],10);
  assert.equal(after[0],255);
});

test('clipping audit rejects invalid geometry, byte lengths and masks',()=>{
  const src=Uint8Array.from([0,0,0,255]);
  for(const [w,h] of [[0,1],[1.2,1],[1,0],[16385,1],[8192,8192]]) {
    assert.throws(()=>analyzeEditorTonalClippingRgba8(src,src,w,h),/geometry/u);
  }
  assert.throws(()=>analyzeEditorTonalClippingRgba8(src,src,2,1),/lengths/u);
  assert.throws(()=>analyzeEditorTonalClippingRgba8(src,src,1,1,Uint8Array.from([1,2])),/lengths/u);
  assert.throws(()=>analyzeEditorTonalClippingRgba8(src,new Uint16Array(2),1,1),/lengths/u);
});

test('newly visible foreground pixels cannot inherit false clipping from hidden source RGB',()=>{
  const source=Uint8Array.from([
    255,255,255,0, 0,0,0,255,
    0,0,0,0, 255,255,255,255,
  ]);
  const result=Uint8Array.from([
    255,20,20,255, 0,0,0,0,
    0,0,0,255, 255,255,255,0,
  ]);
  const report=analyzeEditorTonalClippingRgba8(source,result,2,2);
  assert.equal(report.visiblePixelCount,4);
  assert.equal(report.originallyBrightPixelCount,1);
  assert.equal(report.resultingBrightPixelCount,1);
  assert.equal(report.newlyBrightEditablePixelCount,1,
    'hidden source white does not make new red-channel clipping pre-existing');
  assert.equal(report.originallyCrushedShadowPixelCount,1);
  assert.equal(report.resultingCrushedShadowPixelCount,1);
  assert.equal(report.newlyCrushedEditablePixelCount,1);
});

test('saturated red counts as a channel clip but not a nearly white pixel',async()=>{
  const { analyzeEditorNearWhiteAndBlackRgba8 } =
    await import('../src/platform/creative/deterministic/EditorQualityInspectorRND.ts');
  const before=Uint8Array.from([200,20,20,255]);
  const after=Uint8Array.from([255,20,20,255]);
  const channels=analyzeEditorTonalClippingRgba8(before,after,1,1);
  const nearWhite=analyzeEditorNearWhiteAndBlackRgba8(before,after,1,1);
  assert.equal(channels.newlyBrightEditablePixelCount,1);
  assert.equal(nearWhite.newlyClippedHighlights,0);
});

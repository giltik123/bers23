import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeEditorPixelQualityRgba8,
  requireEditorProtectedPixelsUnchanged,
} from '../src/platform/creative/deterministic/EditorQualityInspectorRND.ts';

test('quality inspector yields a zero-drift report for byte-exact source',()=>{
  const image=Uint8Array.from([100,20,30,0, 1,2,3,255]);
  const report=analyzeEditorPixelQualityRgba8(image,Uint8Array.from(image),2,1,Uint8Array.from([0,255]));
  assert.deepEqual(report,{
    width:2,height:1,pixelCount:2,changedPixels:0,changedAlphaPixels:0,
    changedProtectedPixels:0,changedAuthorizedPixels:0,protectedPixels:1,changedChannels:0,
    meanAbsoluteRgbDelta:0,maximumAbsoluteRgbDelta:0,changedBoundingRect:null,
  });
  assert.equal(Object.isFrozen(report),true);
  assert.doesNotThrow(()=>requireEditorProtectedPixelsUnchanged(report));
});

test('quality inspector locates exact protected pixel, including invisible RGB and alpha',()=>{
  const source=Uint8Array.from([
    1,2,3,0, 10,20,30,255,
    40,50,60,255, 70,80,90,0,
    100,110,120,255, 130,140,150,255,
  ]);
  const result=Uint8Array.from(source);
  result[0]=12; // changed hidden RGB outside matte
  result[3]=255; // changed alpha outside matte
  result[5]=21; // allowed edit (1,0)
  result[19]=20; // changed alpha outside matte (0,1? index 4)
  const mask=Uint8Array.from([0,255,0,0,0,0]);
  const report=analyzeEditorPixelQualityRgba8(source,result,3,2,mask);
  assert.equal(report.changedPixels,3);
  assert.equal(report.changedAlphaPixels,2);
  assert.equal(report.changedChannels,4);
  assert.equal(report.changedProtectedPixels,2);
  assert.equal(report.changedAuthorizedPixels,1);
  assert.equal(report.protectedPixels,5);
  assert.deepEqual(report.changedBoundingRect,{x:0,y:0,width:2,height:2});
  assert.equal(report.maximumAbsoluteRgbDelta,11);
  assert.equal(report.meanAbsoluteRgbDelta,12/(6*3));
  assert.throws(()=>requireEditorProtectedPixelsUnchanged(report),/changed 2 protected pixels/u);
  assert.equal(source[0],1);
});

test('quality inspector accepts 8-bit soft mask as editable only for nonzero coverage',()=>{
  const source=Uint8Array.from([10,10,10,10,20,20,20,20]);
  const result=Uint8Array.from([10,10,10,10,21,20,20,20]);
  const report=analyzeEditorPixelQualityRgba8(source,result,2,1,Uint8Array.from([0,1]));
  assert.equal(report.changedProtectedPixels,0);
  assert.equal(report.changedAuthorizedPixels,1);
  assert.equal(report.changedPixels,1);
  requireEditorProtectedPixelsUnchanged(report);
});

test('quality inspector fails closed on invalid frames and mask lengths',()=>{
  const data=Uint8Array.from([1,2,3,4]);
  assert.throws(()=>analyzeEditorPixelQualityRgba8(data,data,0,1),/geometry/u);
  assert.throws(()=>analyzeEditorPixelQualityRgba8(data,data,1.5,1),/geometry/u);
  assert.throws(()=>analyzeEditorPixelQualityRgba8(data,data,16385,1),/geometry/u);
  assert.throws(()=>analyzeEditorPixelQualityRgba8(data,data,1,2),/RGBA8/u);
  assert.throws(()=>analyzeEditorPixelQualityRgba8(data,data,1,1,Uint8Array.from([0,1])),/mask/u);
  assert.throws(()=>analyzeEditorPixelQualityRgba8(data,new Uint16Array([2,3]),1,1),/RGBA8/u);
});

test('masked non-overlap and bounding rectangle on a non-square canvas',()=>{
  const source=new Uint8Array(6*4*4);
  const modified=Uint8Array.from(source);
  modified[(3*6+5)*4+1]=77;
  modified[(0*6+2)*4+2]=88;
  const mask=new Uint8Array(6*4);
  mask[3*6+5]=255;
  mask[2]=255;
  const s=analyzeEditorPixelQualityRgba8(source,modified,6,4,mask);
  assert.deepEqual(s.changedBoundingRect,{x:2,y:0,width:4,height:4});
  assert.equal(s.changedProtectedPixels,0);
  assert.equal(s.changedAuthorizedPixels,2);
});

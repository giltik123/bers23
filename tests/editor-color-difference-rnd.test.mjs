import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deltaE2000Lab,
  srgb8ToLabD65,
  inspectEditorColorDifferenceRgba8,
} from '../src/platform/creative/deterministic/EditorColorDifferenceRND.ts';

// CIEDE2000 published color-pair reference examples (Sharma et al. dataset).
test('Delta-E 2000 agrees with reference pairs through hue, near-neutral and blue regions', () => {
  const checks = [
    [[50,2.6772,-79.7751],[50,0,-82.7485],2.0425],
    [[50,3.1571,-77.2803],[50,0,-82.7485],2.8615],
    [[50,2.8361,-74.0200],[50,0,-82.7485],3.4412],
    [[50,-1.3802,-84.2814],[50,0,-82.7485],1.0000],
    [[50,-1.1848,-84.8006],[50,0,-82.7485],1.0000],
    [[50,-0.9009,-85.5211],[50,0,-82.7485],1.0000],
    [[50,2.49,-0.001],[50,-2.49,0.0009],7.1792],
    [[50,2.49,-0.001],[50,-2.49,0.0010],7.1792],
    [[50,2.49,-0.001],[50,-2.49,0.0011],7.2195],
  ];
  for (const [a,b,expected] of checks) {
    const x=deltaE2000Lab({L:a[0],a:a[1],b:a[2]},{L:b[0],a:b[1],b:b[2]});
    assert.ok(Math.abs(x-expected)<0.0001,`Delta E mismatch ${x} vs ${expected}`);
    const reverse=deltaE2000Lab({L:b[0],a:b[1],b:b[2]},{L:a[0],a:a[1],b:a[2]});
    assert.ok(Math.abs(reverse-x)<1e-9,'Delta E must be symmetric');
  }
});
test('sRGB D65 conversion identifies black/white neutral and full primary colors', () => {
  const black=srgb8ToLabD65(0,0,0);
  const white=srgb8ToLabD65(255,255,255);
  assert.ok(Math.abs(black.L)<0.00001);
  assert.ok(Math.abs(white.L-100)<0.0001);
  assert.equal(white.L,100,'D65 white must stay inside valid Lab bounds');
  assert.equal(deltaE2000Lab(white,white),0);
  assert.ok(Math.abs(white.a)<0.01 && Math.abs(white.b)<0.01);
  const red=srgb8ToLabD65(255,0,0);
  const green=srgb8ToLabD65(0,255,0);
  const blue=srgb8ToLabD65(0,0,255);
  assert.ok(red.a>50 && green.a<0 && blue.b<0);
  for(const invalid of [NaN,-1,256,1.4,Infinity]) {
    assert.throws(()=>srgb8ToLabD65(invalid,0,0),/sRGB8/u);
  }
  assert.throws(()=>deltaE2000Lab({L:50,a:Infinity,b:0},{L:50,a:0,b:0}),/Invalid/u);
});
test('same photo bytes produce exactly zero Delta E, and differences are tracked in masked area',()=>{
  const source=Uint8Array.from([
    10,20,30,255, 50,60,70,255, 100,120,130,255,
    250,250,250,255, 2,3,4,0, 30,40,50,8,
  ]);
  const identical=inspectEditorColorDifferenceRgba8(source,new Uint8Array(source),3,2);
  assert.equal(identical.meanDeltaE2000,0);
  assert.equal(identical.maximumDeltaE2000,0);
  assert.equal(identical.largeColorShiftPositions,0);
  assert.equal(identical.evaluatedOpaquePositions,4);
  assert.equal(identical.skippedLowAlphaPositions,2);
  assert.equal(identical.qualityApproved,false);
  const altered=Uint8Array.from(source);
  altered.set([255,0,0],0);
  altered.set([0,255,0],4); // protected, must not enter diagnostic statistics
  altered.set([0,0,0],16); // alpha=0; ignored
  const report=inspectEditorColorDifferenceRgba8(source,altered,3,2,Uint8Array.from([255,0,255,255,255,255]));
  assert.equal(report.evaluatedOpaquePositions,3);
  assert.equal(report.skippedProtectedPositions,1);
  assert.equal(report.skippedLowAlphaPositions,2);
  assert.ok(report.meanDeltaE2000>0);
  assert.ok(report.maximumDeltaE2000>10);
  assert.equal(report.largeColorShiftPositions,1);
  assert.ok(report.p95DeltaE2000UpperBound>10);
});
test('large frame diagnostic uses a deterministic bounded sample stride with explicit counts',()=>{
  const width=257,height=256,pixels=width*height;
  const a=new Uint8Array(pixels*4);
  const b=new Uint8Array(pixels*4);
  for(let i=0;i<pixels;i++){a[i*4+3]=255;b[i*4+3]=255;}
  const report=inspectEditorColorDifferenceRgba8(a,b,width,height);
  assert.equal(report.stride,2);
  assert.equal(report.sampledPositions,Math.ceil(pixels/2));
  assert.equal(report.evaluatedOpaquePositions,Math.ceil(pixels/2));
  assert.equal(report.meanDeltaE2000,0);
  assert.equal(report.qualityApproved,false);
});
test('malformed inputs, alpha/mask mismatch and huge geometry fail closed',()=>{
  const rgba=Uint8Array.from([1,2,3,255]);
  assert.throws(()=>inspectEditorColorDifferenceRgba8(rgba,rgba,0,1),/geometry/u);
  assert.throws(()=>inspectEditorColorDifferenceRgba8(rgba,rgba,1,2),/RGBA8/u);
  assert.throws(()=>inspectEditorColorDifferenceRgba8(rgba,rgba,1,1,Uint8Array.from([0,0])),/mask/u);
  assert.throws(()=>inspectEditorColorDifferenceRgba8(rgba,rgba,8192,8192),/geometry/u);
  assert.throws(()=>inspectEditorColorDifferenceRgba8(rgba,Uint16Array.from([1,2]),1,1),/RGBA8/u);
});

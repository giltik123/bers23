import assert from 'node:assert/strict';
import test from 'node:test';
import { professionalToneRangeMaskRgba8RND as range } from '../src/platform/creative/deterministic/ProfessionalToneRangeMaskRND.ts';
const pixels=Uint8Array.from([
  0,0,0,255, 35,35,35,255, 100,100,100,255,
  150,150,150,255, 210,210,210,255, 255,255,255,255,
]);
test('tonal masks select perceptual shadows, midtones and highlights with smooth transitions',()=>{
  const dims=[6,1];
  const all=range(pixels,...dims,'ALL').mask;
  const shadows=range(pixels,...dims,'SHADOWS').mask;
  const middle=range(pixels,...dims,'MIDTONES').mask;
  const highlights=range(pixels,...dims,'HIGHLIGHTS').mask;
  assert.deepEqual([...all],[255,255,255,255,255,255]);
  assert.equal(shadows[0],255);
  assert.equal(shadows[5],0);
  assert.equal(highlights[0],0);
  assert.equal(highlights[5],255);
  assert.ok(middle[0]===0&&middle[2]>0&&middle[3]>0&&middle[5]===0);
  assert.ok(shadows[1]>shadows[2]&&shadows[2]>=shadows[3]);
  assert.ok(highlights[3]<highlights[4]&&highlights[4]<highlights[5]);
});

test('manual R8 mask can only narrow, never widen, a tonal selection',()=>{
  const all=range(pixels,6,1,'ALL');
  const intersection=range(pixels,6,1,'ALL',Uint8Array.from([0,64,128,200,255,0]));
  assert.deepEqual([...intersection.mask],[0,64,128,200,255,0]);
  assert.equal(intersection.protectedPixels,2);
  assert.equal(intersection.eligiblePixels,4);
  assert.equal(intersection.selectedPixels,4);
  for(const band of ['SHADOWS','MIDTONES','HIGHLIGHTS']){
    const original=range(pixels,6,1,band);
    const limited=range(pixels,6,1,band,Uint8Array.from([0,255,128,128,0,0]));
    for(let p=0;p<6;p++)assert.ok(limited.mask[p]<=original.mask[p]);
    assert.equal(limited.mask[0],0);
    assert.equal(limited.mask[4],0);
    assert.equal(limited.mask[5],0);
  }
});

test('fully transparent RGB is excluded even if it is visually pure white',()=>{
  const pixels=Uint8Array.from([255,255,255,0,0,0,0,128,255,255,255,255]);
  const mask=range(pixels,3,1,'ALL');
  assert.deepEqual([...mask.mask],[0,255,255]);
  assert.equal(mask.protectedPixels,1);
  assert.equal(mask.eligiblePixels,2);
});

test('range masks are immutable-by-convention snapshots and never modify the input photo',()=>{
  const original=Uint8Array.from(pixels);
  const selection=range(pixels,6,1,'MIDTONES');
  assert.equal(selection.coreAuthorityGranted,false);
  assert.equal(Object.isFrozen(selection),true);
  assert.deepEqual([...pixels],[...original]);
  selection.mask.fill(0);
  const rerun=range(pixels,6,1,'MIDTONES');
  assert.ok(rerun.selectedPixels>0,'output mask must not alias source state');
});

test('unsupported region, malformed image, missing mask and geometry fail closed',()=>{
  for(const invalid of ['SKIN','FASHION','SUPER_RESOLUTION','',null]) {
    assert.throws(()=>range(pixels,6,1,invalid),/unsupported/u);
  }
  assert.throws(()=>range(pixels,0,1,'ALL'),/geometry/u);
  assert.throws(()=>range(pixels,4097,1,'ALL'),/geometry/u);
  assert.throws(()=>range(pixels,6,1.5,'ALL'),/geometry/u);
  assert.throws(()=>range(Uint8Array.from([1,2,3]),6,1,'ALL'),/RGBA8/u);
  assert.throws(()=>range(pixels,6,1,'ALL',new Uint8Array(5)),/R8/u);
});

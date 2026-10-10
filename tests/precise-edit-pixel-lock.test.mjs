import assert from 'node:assert/strict';
import test from 'node:test';
import { composePreciseEditRgba8, composePreciseEditPatchRgba8 } from '../src/platform/creative/deterministic/PreciseEditPixelLock.ts';

test('precise edit never drifts even one unmasked source byte', () => {
  const source = new Uint8ClampedArray([11,22,33,44, 55,66,77,88, 99,10,20,30]);
  const candidate = new Uint8Array([1,2,3,4, 5,6,7,8, 9,10,11,12]);
  const matte = new Uint8Array([0,255,0]);
  const output = composePreciseEditRgba8(source,candidate,matte,3,1);
  assert.deepEqual([...output],[11,22,33,44, 5,6,7,8, 99,10,20,30]);
  assert.deepEqual([...source],[11,22,33,44, 55,66,77,88, 99,10,20,30]);
  assert.deepEqual([...candidate],[1,2,3,4, 5,6,7,8, 9,10,11,12]);
});

test('empty matte is byte-identical; full matte only returns candidate pixels', () => {
  const source = Uint8Array.from([1,2,3,4,5,6,7,8]);
  const candidate = Uint8Array.from([8,7,6,5,4,3,2,1]);
  assert.deepEqual([...composePreciseEditRgba8(source,candidate,Uint8Array.from([0,0]),2,1)],[...source]);
  assert.deepEqual([...composePreciseEditRgba8(source,candidate,Uint8Array.from([255,255]),2,1)],[...candidate]);
});

test('multi-turn compositing keeps unrelated pixels invariant', () => {
  const source = Uint8Array.from([1,2,3,4,5,6,7,8,9,10,11,12]);
  const a = Uint8Array.from([33,33,33,33,44,44,44,44,55,55,55,55]);
  const b = Uint8Array.from([66,66,66,66,77,77,77,77,88,88,88,88]);
  const first=composePreciseEditRgba8(source,a,Uint8Array.from([0,255,0]),3,1);
  const second=composePreciseEditRgba8(first,b,Uint8Array.from([0,0,255]),3,1);
  assert.deepEqual([...second],[1,2,3,4,44,44,44,44,88,88,88,88]);
});

test('malformed geometry, intermediate mattes and incomplete images fail closed', () => {
  const src=Uint8Array.from([1,2,3,4,5,6,7,8]);
  const edit=Uint8Array.from(src);
  for(const geometry of [[0,1],[-1,1],[Number.NaN,1],[1,1.5],[16385,1],[10000,10000]]) {
    assert.throws(()=>composePreciseEditRgba8(src,edit,Uint8Array.from([0,255]),...geometry),/geometry/u);
  }
  assert.throws(()=>composePreciseEditRgba8(src,edit,Uint8Array.from([128,0]),2,1),/binary/u);
  assert.throws(()=>composePreciseEditRgba8(src,edit,Uint8Array.from([0]),2,1),/lengths/u);
  assert.throws(()=>composePreciseEditRgba8(src,edit.subarray(0,4),Uint8Array.from([0,255]),2,1),/lengths/u);
  assert.throws(()=>composePreciseEditRgba8([],edit,Uint8Array.from([0,255]),2,1),/lengths/u);
});


test('ROI precise edit changes only selected crop pixels while retaining source resolution', () => {
  const source = Uint8Array.from(Array.from({ length: 36 }, (_, index) => index + 1));
  const patch = Uint8Array.from([201,202,203,204, 211,212,213,214, 221,222,223,224, 231,232,233,234]);
  const matte = Uint8Array.from([255,0,0,255]);
  const beforeSource = Uint8Array.from(source);
  const beforePatch = Uint8Array.from(patch);
  const output = composePreciseEditPatchRgba8(source,3,3,patch,matte,{left:1,top:1,width:2,height:2});
  assert.equal(output.length, source.length);
  assert.deepEqual([...source],[...beforeSource]);
  assert.deepEqual([...patch],[...beforePatch]);
  for (let y=0; y<3; y+=1) {
    for (let x=0; x<3; x+=1) {
      const o=(y*3+x)*4;
      const expected = x===1&&y===1 ? [201,202,203,204]
        : x===2&&y===2 ? [231,232,233,234] : [...source.slice(o,o+4)];
      assert.deepEqual([...output.slice(o,o+4)],expected,`pixel ${x},${y}`);
    }
  }
});

test('multiple localized edits preserve the original pixels outside the union of patches', () => {
  const source = Uint8Array.from(Array.from({length:48},(_,i)=>i+1));
  const patch1 = Uint8Array.from([180,181,182,183]);
  const patch2 = Uint8Array.from([200,201,202,203]);
  const step1 = composePreciseEditPatchRgba8(source,4,3,patch1,Uint8Array.from([255]),{left:1,top:0,width:1,height:1});
  const step2 = composePreciseEditPatchRgba8(step1,4,3,patch2,Uint8Array.from([255]),{left:3,top:2,width:1,height:1});
  for(let pixel=0;pixel<12;pixel+=1){
    const actual=[...step2.slice(pixel*4,pixel*4+4)];
    const expected=pixel===1?[...patch1]:pixel===11?[...patch2]:[...source.slice(pixel*4,pixel*4+4)];
    assert.deepEqual(actual,expected,`pixel ${pixel} not contaminated by an unrelated patch`);
  }
});

test('cropped edits reject all out-of-frame, noninteger, mismatched, and soft-mask payloads', () => {
  const source=Uint8Array.from(Array.from({length:36},(_,i)=>i));
  const candidate=Uint8Array.from([1,2,3,4]);
  const valid={left:1,top:1,width:1,height:1};
  for(const invalid of [
    {left:-1,top:0,width:1,height:1},
    {left:3,top:0,width:1,height:1},
    {left:2,top:2,width:2,height:1},
    {left:0,top:2,width:1,height:2},
    {left:0.5,top:0,width:1,height:1},
    {left:0,top:0,width:0,height:1},
    {left:0,top:0,width:1,height:NaN},
    null,
  ]){
    assert.throws(()=>composePreciseEditPatchRgba8(source,3,3,candidate,Uint8Array.from([255]),invalid),/geometry/u);
  }
  assert.throws(()=>composePreciseEditPatchRgba8(source,3,3,candidate,Uint8Array.from([128]),valid),/binary/u);
  assert.throws(()=>composePreciseEditPatchRgba8(source,3,3,candidate,Uint8Array.from([]),valid),/lengths/u);
  assert.throws(()=>composePreciseEditPatchRgba8(source,3,3,candidate.subarray(0,3),Uint8Array.from([255]),valid),/lengths/u);
  assert.throws(()=>composePreciseEditPatchRgba8(source.subarray(0,32),3,3,candidate,Uint8Array.from([255]),valid),/source RGBA byte length/u);
  assert.throws(()=>composePreciseEditPatchRgba8(source,0,3,candidate,Uint8Array.from([255]),valid),/source geometry/u);
  assert.throws(()=>composePreciseEditPatchRgba8(source,3,3,candidate,Uint8Array.from([255]),{left:0,top:0,width:5000,height:5000}),/geometry/u);
});

test('empty ROI matte produces exact original including transparent hidden RGB bytes', () => {
  const source=Uint8Array.from([111,112,113,0, 3,4,5,0, 6,7,8,255, 9,10,11,0]);
  const patch=Uint8Array.from([1,1,1,1, 2,2,2,2, 3,3,3,3, 4,4,4,4]);
  const actual=composePreciseEditPatchRgba8(source,2,2,patch,Uint8Array.from([0,0,0,0]),{left:0,top:0,width:2,height:2});
  assert.deepEqual([...actual],[...source]);
});

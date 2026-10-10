import assert from 'node:assert/strict';
import test from 'node:test';
import { composePreciseEditRgba8 } from '../src/platform/creative/deterministic/PreciseEditPixelLock.ts';

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

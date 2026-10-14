import assert from 'node:assert/strict';
import test from 'node:test';
import { maskAndCheckTorso, torsoBounds } from '../scripts/compare-fashion-precise-edit-real-images.mjs';

test('real-photo benchmark derives bounded Project torso rectangle with a fixed safety margin', () => {
  const corners=[[0.3,0.3],[0.7,0.3],[0.7,0.7],[0.3,0.7]];
  assert.deepEqual(torsoBounds(corners,100,100),{left:26,top:26,right:73,bottom:73});
  assert.throws(()=>torsoBounds([[0,0],[1,1]],100,100),/torso geometry/u);
  assert.throws(()=>torsoBounds([[0,0],[1,1],[2,0],[0,1]],100,100),/torso geometry/u);
});

test('real-photo benchmark flags baseline pixel contamination beyond declared torso', () => {
  const source=new Uint8Array(3*3*4);
  const baseline=new Uint8Array(source);
  baseline[(1*3+1)*4]=40;
  baseline[(0*3+0)*4]=50;
  const bounds={left:1,top:1,right:2,bottom:2};
  const evidence=maskAndCheckTorso(source,baseline,3,3,bounds);
  assert.equal(evidence.baselineChanged,2);
  assert.equal(evidence.outsideTorso,1);
  assert.equal(evidence.mask[0],0);
  assert.equal(evidence.mask[1*3+1],255);
  assert.equal(evidence.mask[2*3+2],0);
});

test('real-photo benchmark catches alpha-only drift outside garment rectangle', () => {
  const source=new Uint8Array(2*2*4);
  const baseline=new Uint8Array(source);
  baseline[3]=255;
  const evidence=maskAndCheckTorso(source,baseline,2,2,{left:1,top:1,right:1,bottom:1});
  assert.equal(evidence.baselineChanged,1);
  assert.equal(evidence.outsideTorso,1);
  assert.deepEqual([...evidence.mask],[0,0,0,0]);
});

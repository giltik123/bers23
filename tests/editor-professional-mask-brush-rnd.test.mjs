import assert from 'node:assert/strict';
import test from 'node:test';
import { paintProfessionalMaskR8RND as paint } from '../src/platform/creative/deterministic/ProfessionalMaskBrushRND.ts';
const settings={centerX:5,centerY:5,radius:4,hardnessQ8:0,opacityQ8:255,mode:'ADD'};
test('soft edit mask feather is smooth, bounded and image-independent',()=>{
  const blank=new Uint8Array(11*11);
  const result=paint(blank,11,11,settings);
  const at=(x,y)=>result[y*11+x];
  assert.equal(at(5,5),255);
  assert.ok(at(6,5)>at(7,5));
  assert.ok(at(7,5)>at(8,5));
  assert.equal(at(9,5),0);
  assert.equal(at(0,0),0);
  assert.ok(result.every(v=>v>=0&&v<=255));
  assert.ok(blank.every(v=>v===0),'input R8 cannot mutate');
});
test('SUBTRACT brush erases smoothly and never touches outside the stroke',()=>{
  const filled=new Uint8Array(11*11).fill(255);
  const output=paint(filled,11,11,{...settings,mode:'SUBTRACT'});
  assert.equal(output[5*11+5],0);
  assert.equal(output[5*11+9],255);
  assert.ok(output[5*11+8]>output[5*11+7]);
  assert.ok(filled.every(v=>v===255));
});
test('ADD/SUBTRACT alpha combination remains monotonic and idempotent in extremal cases',()=>{
  const blank=new Uint8Array(25);
  const stamp={centerX:2,centerY:2,radius:2,hardnessQ8:255,opacityQ8:255,mode:'ADD'};
  const added=paint(blank,5,5,stamp);
  assert.equal(added[12],255);
  assert.equal(paint(added,5,5,stamp)[12],255);
  assert.equal(paint(added,5,5,{...stamp,mode:'SUBTRACT'})[12],0);
  assert.deepEqual([...paint(blank,5,5,{...stamp,opacityQ8:0})],[...blank]);
});
test('stroke outside geometry or hostile input cannot leak to arbitrary buffer lengths',()=>{
  const mask=new Uint8Array(25);
  for(const bad of [
    {...settings,centerX:11},{...settings,centerY:-1},
    {...settings,mode:'CLOUD_AI'},{...settings,radius:0},
    {...settings,radius:257},{...settings,hardnessQ8:256},
    {...settings,opacityQ8:-1},{...settings,centerX:1.5},
  ])assert.throws(()=>paint(mask,5,5,bad));
  assert.throws(()=>paint(mask,5,5,null));
  assert.throws(()=>paint(mask,5,5,settings),/stroke/u); // valid coords for 11x11 only
  assert.throws(()=>paint(mask,5,1,{...settings,centerX:2,centerY:0}),/exact R8/u);
  assert.throws(()=>paint(mask,0,5,{...settings,centerX:2,centerY:2}),/geometry/u);
});

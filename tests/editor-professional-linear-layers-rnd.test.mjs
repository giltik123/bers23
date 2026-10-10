import assert from 'node:assert/strict';
import test from 'node:test';
import { composeLinearLightLayersRgba8RND as linear } from '../src/platform/creative/deterministic/ProfessionalLinearLayersRND.ts';
const frame = (...pixels) => Uint8Array.from(pixels.flat());
const layer=(id,pixels,other={})=>({id,pixels,visible:true,opacityQ8:255,blendMode:'NORMAL',...other});
test('half-opacity white over black is linear-light gray near 188, not sRGB 128',()=>{
  const background=frame([0,0,0,255]);
  const paint=layer('white',frame([255,255,255,255]),{opacityQ8:128});
  const output=linear(background,1,1,[paint]);
  for(let ch=0;ch<3;ch++)assert.ok(output[ch]>=187&&output[ch]<=189, String(output[ch]));
  assert.equal(output[3],255);
  assert.deepEqual([...background],[0,0,0,255]);
});
test('alpha-over-transparent preserves visible foreground RGB, creates expected alpha',()=>{
  const background=frame([4,222,66,0]);
  const paint=layer('red',frame([240,23,16,255]),{opacityQ8:128});
  const output=linear(background,1,1,[paint]);
  assert.deepEqual([...output],[240,23,16,128]);
});
test('fully-opaque replacement and untouched masked pixels preserve exact hidden RGB and alpha',()=>{
  const source=frame([200,24,8,255],[55,90,199,0],[20,40,80,128]);
  const overlay=layer('full',frame([10,20,30,255],[20,40,50,255],[200,222,244,255]),
    {mask:Uint8Array.from([255,0,0])});
  const output=linear(source,3,1,[overlay]);
  assert.deepEqual([...output],[10,20,30,255,55,90,199,0,20,40,80,128]);
  assert.deepEqual([...source],[200,24,8,255,55,90,199,0,20,40,80,128]);
});
test('semi-transparent matte is continuous and source-over respects layer order',()=>{
  const base=frame([18,22,26,255],[18,22,26,255]);
  const red=layer('r',frame([250,0,0,255],[250,0,0,255]),
    {opacityQ8:128,mask:Uint8Array.from([255,0])});
  const blue=layer('b',frame([0,0,255,255],[0,0,255,255]),
    {opacityQ8:128,mask:Uint8Array.from([255,0])});
  const first=linear(base,2,1,[red,blue]);
  const second=linear(base,2,1,[blue,red]);
  assert.notDeepEqual([...first.slice(0,4)],[...second.slice(0,4)]);
  assert.deepEqual([...first.slice(4,8)],[...base.slice(4,8)]);
  assert.equal(first[3],255);
});
test('invalid mask, duplicate IDs, dimensions, mode or opacity fail closed',()=>{
  const src=frame([0,0,0,255]);
  const good=layer('one',frame([255,0,0,255]));
  assert.throws(()=>linear(src,1,1,[good,good]),/identity/u);
  for(const invalid of [
    {...good,blendMode:'OVERLAY'},
    {...good,mask:Uint8Array.from([1,2])},
    {...good,opacityQ8:999},
    {...good,opacityQ8:7.5},
    {...good,visible:'yes'},
    {...good,id:'../../secret'},
    {...good,pixels:Uint8Array.from([0,0,0])},
  ]) assert.throws(()=>linear(src,1,1,[invalid]));
  assert.throws(()=>linear(src,0,1,[]),/geometry/u);
  assert.throws(()=>linear(src,1,1,Array.from({length:17},(_,i)=>({...good,id:'item'+i}))),/budget/u);
});

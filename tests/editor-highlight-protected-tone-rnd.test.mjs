import assert from 'node:assert/strict';
import test from 'node:test';
import { highlightProtectedToneRgba8RND as tone } from '../src/platform/creative/deterministic/HighlightProtectedToneRND.ts';
import { maskedExposureRgba8 as oldExposure } from '../src/platform/creative/deterministic/MaskedExposure.ts';
const image = (...p)=>Uint8Array.from(p.flat());
test('neutral tone and mask zero are byte-exact identities including hidden transparent RGB',()=>{
  const src=image([220,195,180,255],[32,70,155,0],[15,30,45,128]);
  const snapshot=new Uint8Array(src);
  assert.deepEqual([...tone(src,Uint8Array.from([255,255,255]),3,1,{eighthStops:0})],[...src]);
  assert.deepEqual([...tone(src,Uint8Array.from([0,0,0]),3,1,{eighthStops:24})],[...src]);
  assert.deepEqual([...src],[...snapshot]);
});
test('highlight-safe lift is monotone and preserves bright detail that v1 hard-clips',()=>{
  const pixels=Array.from({length:40},(_,i)=>[160+i*2,170+i*2,180+i*1,255]);
  const src=image(...pixels);
  const matte=Uint8Array.from({length:pixels.length},()=>255);
  const safe=tone(src,matte,pixels.length,1,{eighthStops:16});
  const hard=oldExposure(src,matte,pixels.length,1,16);
  let hardClipped=0,safeClipped=0,distinctSafe=new Set(),distinctOld=new Set();
  for(let i=0;i<pixels.length;i++){
    const offset=i*4;
    const old=hard[offset],bright=safe[offset];
    if(old===255)hardClipped++;
    if(bright===255)safeClipped++;
    distinctOld.add(old);distinctSafe.add(bright);
    assert.ok(bright>=src[offset]);
    assert.ok(bright<=255);
    assert.equal(safe[offset+3],255);
  }
  assert.ok(hardClipped>=20,`old clipping count ${hardClipped}`);
  assert.ok(safeClipped<=1,`safe clipping count ${safeClipped}`);
  assert.ok(distinctSafe.size>distinctOld.size,`lost tonal distinctions ${distinctSafe.size} vs ${distinctOld.size}`);
});
test('linear hue ratios stay approximately stable and protected alpha stays exact',()=>{
  const src=image([110,65,30,255],[200,210,220,128],[250,100,15,0]);
  const out=tone(src,Uint8Array.from([255,128,255]),3,1,{eighthStops:12});
  assert.equal(out[3],255);
  assert.equal(out[7],128);
  assert.deepEqual([...out.slice(8,12)],[250,100,15,0],
    'fully transparent RGB is never touched by the tone operation');
  assert.ok(out[0]>src[0]);
  assert.ok(out[4]>src[4]);
  const srgbToLinear=v=>{
    const u=v/255;
    return u<=0.04045?u/12.92:((u+0.055)/1.055)**2.4;
  };
  const beforeRatio=srgbToLinear(src[0])/srgbToLinear(src[1]);
  const afterRatio=srgbToLinear(out[0])/srgbToLinear(out[1]);
  assert.ok(Math.abs(beforeRatio-afterRatio)<0.08,`hue ratio drift: ${beforeRatio} -> ${afterRatio}`);
});
test('minus stops darken midtones but keep display white/black endpoints stable',()=>{
  const src=image([255,255,255,255],[0,0,0,255],[100,130,150,255]);
  const out=tone(src,Uint8Array.of(255,255,255),3,1,{eighthStops:-16});
  assert.deepEqual([...out.slice(0,4)],[255,255,255,255]);
  assert.deepEqual([...out.slice(4,8)],[0,0,0,255]);
  assert.ok(out[8]<100&&out[9]<130&&out[10]<150);
});
test('tone generator is deterministic, local, and rejects malformed bounds',()=>{
  const src=image([120,140,160,255]);
  const mask=Uint8Array.of(255);
  assert.deepEqual([...tone(src,mask,1,1,{eighthStops:8})],
    [...tone(src,mask,1,1,{eighthStops:8})]);
  assert.throws(()=>tone(src,mask,0,1,{eighthStops:8}),/geometry/u);
  assert.throws(()=>tone(src,mask,1,1,{eighthStops:33}),/eighth-stop/u);
  assert.throws(()=>tone(src,mask,1,1,{eighthStops:0.5}),/eighth-stop/u);
  assert.throws(()=>tone(src,Uint8Array.of(0,1),1,1,{eighthStops:1}),/R8/u);
  assert.throws(()=>tone(Uint8Array.of(1,2,3),mask,1,1,{eighthStops:1}),/RGBA8/u);
});

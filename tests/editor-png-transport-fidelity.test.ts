import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { encodeDeterministicRgbaPng } from '../src/platform/creative/deterministic/DeterministicPng.ts';

function pixels(width: number,height: number): Uint8ClampedArray {
  const data=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p++){
    const o=p*4;
    data[o]=(p*19+1)&255;data[o+1]=(p*37+2)&255;data[o+2]=(p*53+3)&255;
    data[o+3]=[0,1,127,254,255][p%5];
  }
  return data;
}
async function encodeAndCoreDecode(data: Uint8ClampedArray,width: number,height: number) {
  const png=await encodeDeterministicRgbaPng({
    width,height,data,format:'RGBA8',orientation:1,colorSpace:'srgb',
  });
  const metadata=await sharp(Buffer.from(png)).metadata();
  assert.equal(metadata.format,'png');
  assert.equal(metadata.width,width);
  assert.equal(metadata.height,height);
  assert.equal(metadata.channels,4);
  const decoded=await sharp(Buffer.from(png)).ensureAlpha().toColourspace('srgb')
    .raw().toBuffer({resolveWithObject:true});
  assert.equal(decoded.info.width,width);
  assert.equal(decoded.info.height,height);
  assert.equal(decoded.info.channels,4);
  return {png,rgba:Buffer.from(decoded.data)};
}
test('Editor PNG candidate bytes survive browser encoding and Core sharp RGB/alpha decode',async()=>{
  for(const [width,height] of [[1,1],[2,5],[7,11],[51,37]]) {
    const source=pixels(width,height);
    const backup=Buffer.from(source);
    const a=await encodeAndCoreDecode(source,width,height);
    assert.deepEqual(a.rgba,backup,`Core-visible pixel bytes drifted on ${width}x${height}`);
    const b=await encodeAndCoreDecode(source,width,height);
    assert.deepEqual(Buffer.from(a.png),Buffer.from(b.png),'deterministic candidate PNG');
    assert.deepEqual(Buffer.from(source),backup,'source was mutated');
  }
});
test('Editor PNG upload encoding rejects malformed geometry and non-Uint8ClampedArray pixels',async()=>{
  await assert.rejects(
    encodeDeterministicRgbaPng({width:2,height:2,data:pixels(1,1),format:'RGBA8',orientation:1,colorSpace:'srgb'}),
    /Malformed RGBA8 image/u,
  );
  await assert.rejects(
    encodeDeterministicRgbaPng({width:0,height:1,data:pixels(1,1),format:'RGBA8',orientation:1,colorSpace:'srgb'}),
    /Malformed RGBA8 image/u,
  );
  await assert.rejects(
    encodeDeterministicRgbaPng({width:1,height:1,data:Uint8Array.from([1,2,3,4]) as never,format:'RGBA8',orientation:1,colorSpace:'srgb'}),
    /Malformed RGBA8 image/u,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { resizeProfessionalLanczos3Rgba8RND as professional } from '../src/platform/creative/deterministic/ProfessionalResizeLanczosRND.ts';
import { resizeRgba8 as acceptedBilinear } from '../src/platform/creative/deterministic/Resize.ts';

const rgba = (width,height,get) => {
  const out = new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)out.set(get(x,y),(y*width+x)*4);
  return out;
};
test('professional scale preserves exact RGBA identity including invisible RGB',()=>{
  const original=rgba(17,13,(x,y)=>[(x*17+y*5)%256, (x+y*33)%256, (x*9)%256,(y*31)%256]);
  const snapshot=new Uint8Array(original);
  const same=professional(original,17,13,{width:17,height:13});
  assert.deepEqual([...same],[...original]);
  same.fill(0);
  assert.deepEqual([...original],[...snapshot],'input must never alias the output');
});
test('flat colors and all alpha levels remain byte-exact under large and tiny resize',()=>{
  for(const alpha of [0,1,33,128,255])for(const dims of [{width:1,height:1},{width:19,height:37},{width:4,height:3}]){
    const source=rgba(8,6,()=>[19,132,244,alpha]);
    const output=professional(source,8,6,dims);
    for(let i=0;i<output.length;i+=4)assert.deepEqual([...output.slice(i,i+4)],[19,132,244,alpha]);
  }
});
test('downsample checkerboard uses area-aware antialias and linear-light energy',()=>{
  const image=rgba(8,8,(x,y)=>((x+y)&1)?[255,255,255,255]:[0,0,0,255]);
  const out=professional(image,8,8,{width:1,height:1});
  // Half luminous flux in D65-sRGB has gamma-encoded value ~188 (not 127).
  for(let channel=0;channel<3;channel++)assert.ok(out[channel]>=175&&out[channel]<=200,`antialiased linear-light energy, actual=${out[channel]}`);
  assert.equal(out[3],255);
  const other=acceptedBilinear(image,8,8,{width:1,height:1});
  assert.ok(out[0]>other[0]+30,'new v2 light model must be measurably distinct from accepted v1');
});
test('transparent blue RGB cannot create a blue fringe beside an opaque red subject',()=>{
  const image=rgba(11,7,(x)=>x<6?[240,20,16,255]:[0,0,255,0]);
  for(const output of [
    professional(image,11,7,{width:4,height:3}),
    professional(image,11,7,{width:33,height:21}),
  ]){
    let visible=0,partial=0;
    for(let i=0;i<output.length;i+=4){
      if(output[i+3]===0)continue;
      visible++;
      if(output[i+3]!==255)partial++;
      assert.ok(output[i]>=238,`red subject contamination: R=${output[i]}`);
      assert.ok(output[i+1]<=22,`green subject contamination: G=${output[i+1]}`);
      assert.ok(output[i+2]<=18,`invisible blue fringe: B=${output[i+2]}`);
    }
    assert.ok(visible>0);
    assert.ok(partial>0,'reconstruction should preserve fractional edge coverage');
  }
});
test('high-contrast step never creates negative channel or overshoot chroma due to Lanczos lobes',()=>{
  const image=rgba(17,13,x=>x<8?[12,23,34,255]:[220,230,240,255]);
  const result=professional(image,17,13,{width:31,height:7});
  for(let i=0;i<result.length;i+=4){
    assert.ok(result[i]>=12&&result[i]<=220, `R overshot: ${result[i]}`);
    assert.ok(result[i+1]>=23&&result[i+1]<=230, `G overshot: ${result[i+1]}`);
    assert.ok(result[i+2]>=34&&result[i+2]<=240, `B overshot: ${result[i+2]}`);
  }
});
test('separable operator is deterministic and respects bounded geometry',()=>{
  const input=rgba(37,13,(x,y)=>[(x*29+y*7)%256,(x*3+y*43)%256,x+y,(x*53+y*11)%256]);
  const a=professional(input,37,13,{width:7,height:23});
  const b=professional(input,37,13,{width:7,height:23});
  assert.deepEqual([...a],[...b]);
  for(const bad of [
    [0,1,{width:1,height:1}],[1,1,{width:0,height:1}],
    [1,1,{width:4097,height:1}],[1,1,{width:2048,height:2049}],
    [1.1,1,{width:2,height:2}],
  ])assert.throws(()=>professional(new Uint8Array(4),bad[0],bad[1],bad[2]),/geometry/u);
  assert.throws(()=>professional(new Uint8Array(5),1,1,{width:2,height:1}),/RGBA8/u);
  assert.throws(()=>professional(new Uint8Array(4),1,1,null),/target/u);
});

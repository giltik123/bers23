import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  partitionClassicalColorRegions,runClassicalSceneSegmentation,
} from '../server/core/scene/classicalSceneSegmentation.ts';

function swatch(width,height,rectangle) {
  const rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;
    const inBox=x>=rectangle.x&&x<rectangle.x+rectangle.w&&
      y>=rectangle.y&&y<rectangle.y+rectangle.h;
    const rgb=inBox ? [192,35,45] : [25,115,192];
    rgba.set([...rgb,255],p);
  }
  return rgba;
}
const makeSource=async(width,height,rgba)=>sharp(rgba,{
  raw:{width,height,channels:4},
}).png().toBuffer();
test('local classical algorithm finds a real interior color region and approximate border background',async()=>{
  const width=64,height=64,rgba=swatch(width,height,{x:16,y:12,w:32,h:38});
  const model=partitionClassicalColorRegions(rgba,width,height);
  const areas=model.regions.filter(r=>r.category==='OTHER_OBJECT');
  assert.ok(areas.length>=1);
  assert.ok(model.regions.some(r=>r.category==='BACKGROUND'));
  const original=await makeSource(width,height,rgba);
  const run=await runClassicalSceneSegmentation({imagePng:original,width,height});
  assert.equal(run.modelId,'bers-classical-cv');
  assert.ok(run.instances.some(i=>i.category==='BACKGROUND'));
  assert.ok(run.instances.some(i=>i.category==='OTHER_OBJECT'));
  assert.ok(run.instances.every(i=>i.confidence===0&&i.alpha.byteLength===width*height));
  const object=run.instances.find(i=>i.category==='OTHER_OBJECT');
  assert.equal(object.alpha[31*width+31],255);
  assert.equal(object.alpha[0],0);
});
test('flat-color photo produces no fictitious objects or false body/clothes labels',async()=>{
  const width=64,height=64,rgba=swatch(width,height,{x:0,y:0,w:64,h:64});
  const photo=await makeSource(width,height,rgba);
  const run=await runClassicalSceneSegmentation({imagePng:photo,width,height});
  assert.equal(run.instances.length,0);
});
test('classical operation never produces face/clothes/accessory semantic claims',async()=>{
  const width=64,height=64,rgba=swatch(width,height,{x:20,y:20,w:20,h:20});
  const run=await runClassicalSceneSegmentation({
    imagePng:await makeSource(width,height,rgba),width,height,
  });
  assert.ok(run.instances.every(x=>['BACKGROUND','OTHER_OBJECT'].includes(x.category)));
  assert.ok(run.instances.every(x=>x.modelId==='bers-classical-cv'));
});
test('reject oversized or malformed source geometry without processing external resources',async()=>{
  const a=await makeSource(64,64,swatch(64,64,{x:16,y:16,w:32,h:32}));
  await assert.rejects(
    ()=>runClassicalSceneSegmentation({imagePng:a,width:1,height:2}),
    /bounded canonical photo/,
  );
  await assert.rejects(
    ()=>runClassicalSceneSegmentation({imagePng:a,width:5000,height:5000}),
    /bounded canonical photo/,
  );
  assert.throws(
    ()=>partitionClassicalColorRegions(new Uint8Array(13),64,64),
    /geometry/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeLocalSelfieCategoryMask,MEDIAPIPE_SELFIE_CLASSES,
  MEDIAPIPE_LOCAL_MODEL_ID,
} from '../src/application/scene/decodeLocalSelfieCategoryMask.js';
import { validateSceneCandidates } from '../src/application/scene/autoSceneMaskContract.js';

const width=32,height=24;
const classes=new Uint8Array(width*height); // background 0
const paint=(id,x0,y0,w,h)=>{
  for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)
    classes[y*width+x]=id;
};
paint(1,10,1,9,4); // hair
paint(3,11,5,7,5); // face skin
paint(2,10,10,10,5); // body skin
paint(4,10,15,10,7); // clothes
paint(5,22,10,5,4); // accessories/other
const source={
  id:'p1',current_image_artifact_id:'signed-source-1',width:64,height:48,
};
test('six MediaPipe classes produce six bounded local alpha masks without cloud calls',()=>{
  const output=decodeLocalSelfieCategoryMask({
    categoryMask:classes,width,height,sourceWidth:64,sourceHeight:48,
  });
  assert.equal(output.modelId,MEDIAPIPE_LOCAL_MODEL_ID);
  assert.equal(output.instances.length,6);
  assert.ok(output.instances.every(instance=>instance.alpha.length===64*48 &&
    instance.alpha.some(value=>value>0) && instance.confidence===0));
  const categories=new Set(output.instances.map(i=>i.category));
  assert.deepEqual([...categories].sort(),
    ['ACCESSORY','BACKGROUND','CLOTHING_GENERIC','FACE','OTHER_OBJECT'].sort());
  const canonicalShape=validateSceneCandidates({
    modelId:output.modelId,modelVersion:output.modelVersion,
    projectId:source.id,sourceArtifactId:source.current_image_artifact_id,
    width:64,height:48,instances:output.instances,
  },source);
  assert.equal(canonicalShape.instances.length,6);
});
test('the model groups clothes and other/accessories without hallucinating individual garment identities',()=>{
  assert.equal(MEDIAPIPE_SELFIE_CLASSES[4].category,'CLOTHING_GENERIC');
  assert.equal(MEDIAPIPE_SELFIE_CLASSES[5].label,'Прочие области / аксессуары');
  assert.equal(MEDIAPIPE_SELFIE_CLASSES[2].category,'OTHER_OBJECT');
  assert.ok(!MEDIAPIPE_SELFIE_CLASSES.some(x=>/jacket|bag|watch|glasses/i.test(x.label)));
});
test('two disconnected face components remain different original-space alpha masks',()=>{
  const map=new Uint8Array(32*24);
  for(let y=5;y<10;y++)for(let x=2;x<8;x++)map[y*32+x]=3;
  for(let y=5;y<10;y++)for(let x=18;x<24;x++)map[y*32+x]=3;
  const result=decodeLocalSelfieCategoryMask({
    categoryMask:map,width:32,height:24,sourceWidth:32,sourceHeight:24,
  });
  assert.equal(result.instances.filter(x=>x.category==='FACE').length,2);
});
test('reject corrupt or huge class maps; never invent category masks',()=>{
  const defaults={width,height,sourceWidth:64,sourceHeight:48};
  assert.throws(()=>decodeLocalSelfieCategoryMask({
    ...defaults,categoryMask:new Uint8Array(width*height-1),
  }),/geometry/);
  assert.throws(()=>decodeLocalSelfieCategoryMask({
    ...defaults,categoryMask:new Uint8Array(width*height).fill(250),
  }),/unsupported class/);
  assert.throws(()=>decodeLocalSelfieCategoryMask({
    ...defaults,categoryMask:classes,sourceWidth:10000,sourceHeight:10000,
  }),/geometry/);
  const empty=decodeLocalSelfieCategoryMask({
    ...defaults,categoryMask:new Uint8Array(width*height).fill(0),
  });
  assert.equal(empty.instances.length,0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  sceneSourceKey, validateSceneCandidates, sceneObjectFromCanonical,
  SCENE_GROUPS,
} from '../src/application/scene/autoSceneMaskContract.js';
import { createAutoSceneMaskCoordinator } from '../src/application/scene/createAutoSceneMaskCoordinator.js';

const source = Object.freeze({
  id:'project-1',current_image_artifact_id:'source-signed-1',
  current_image_url:'/api/core/artifacts/results/signed',width:4,height:3,
  revision:0,objects:[{id:'user-1',label:'Manual selection',metadata:{segmentation:'MANUAL'}}],
});
const categories = [
  ['FACE','Лицо'],['CLOTHING_UPPER','Рубашка'],['ACCESSORY','Очки'],
  ['BACKGROUND','Фон'],['OTHER_OBJECT','Лампа'],
];
const maskOf = (index) => new Uint8Array(12).map((_,i) => i===index ? 255 : 0);
const evidence = (src=source) => ({
  projectId:src.id,sourceArtifactId:src.current_image_artifact_id,
  width:src.width,height:src.height,modelId:'semantic-instance-model',
  modelVersion:'1.0',
  instances:categories.map(([category,label],i)=>({
    category,label,confidence:.84,alpha:maskOf(i),
  })),
});
const provider = () => ({
  supportsSemanticInstances:true,
  isAvailable:async()=>true,
  segmentScene:async()=>evidence(),
});
function fixture(options={}) {
  let saved=[],published=[],live=source,ids=0,providerCalls=0;
  const p=options.provider===null ? null : {
    supportsSemanticInstances:true,
    isAvailable:async()=>true,
    segmentScene:async()=>{
      providerCalls++;
      return options.result?.() ?? evidence();
    },
  };
  const runner=createAutoSceneMaskCoordinator({
    provider:p,
    persistMask:async input=>{
      saved.push(input);
      if(options.afterPersist)options.afterPersist(saved.length, v=>live=v);
      return { artifactId:'canonical-mask-'+saved.length,role:'MASK',
        state:'AVAILABLE',coordinateSpace:'ORIGINAL',
        sourceImageArtifactId:input.sourceImageArtifactId };
    },
    getProject:async()=>live,
    commitObjects:async (snap,objects)=>{
      if(options.beforeCommit)options.beforeCommit(v=>live=v);
      if(sceneSourceKey(live)!==sceneSourceKey(snap) ||
         live.revision!==snap.revision){
        throw Object.assign(new Error('Source conflict'),{code:'project_source_conflict'});
      }
      published.push(objects);
    },
    nextObjectId:()=> 'auto-object-'+(++ids),
  });
  return {runner, saved, published, stats:()=>({providerCalls}),setLive:v=>live=v};
}

test('five requested scene groups use separate original-space raster candidates',()=>{
  const normalized=validateSceneCandidates(evidence(),source);
  assert.equal(normalized.instances.length,5);
  assert.deepEqual([...new Set(normalized.instances.map(item=>item.group))].sort(),[...SCENE_GROUPS].sort());
  assert.deepEqual(normalized.instances[0].box,{x:0,y:0,w:.25,h:1/3});
  assert.equal(normalized.instances[0].confidence,.84);
});

test('a box alone, zero alpha, full-frame alpha or noncanonical source is not a mask',()=>{
  for(const bad of [
    {...evidence(),sourceArtifactId:'wrong'},
    {...evidence(),instances:[{category:'FACE',label:'Face',confidence:.8,box:{x:0,y:0,w:1,h:1}}]},
    {...evidence(),instances:[{category:'FACE',label:'Face',confidence:.8,alpha:new Uint8Array(12)}]},
    {...evidence(),instances:[{category:'BACKGROUND',label:'Background',confidence:.8,alpha:new Uint8Array(12).fill(255)}]},
    {...evidence(),instances:[{category:'CLOTHING_UPPER',label:'Tee',confidence:1.1,alpha:maskOf(0)}]},
    {...evidence(),instances:[{category:'SOMETHING_UNKNOWN',label:'Anything',confidence:.8,alpha:maskOf(0)}]},
    {...evidence(),modelId:''},
  ])assert.throws(()=>validateSceneCandidates(bad,source));
});

test('semantic model unavailable never creates guessed objects, persisted masks or credit work',async()=>{
  const f=fixture({provider:null});
  const result=await f.runner.start(source);
  assert.equal(result.status,'MODEL_UNAVAILABLE');
  assert.equal(f.saved.length,0);
  assert.equal(f.published.length,0);
  assert.equal(f.stats().providerCalls,0);
});

test('five separate real candidate masks are persisted through Core then published once',async()=>{
  const f=fixture();
  const result=await f.runner.start(source);
  assert.equal(result.status,'COMPLETED');
  assert.equal(f.saved.length,5);
  assert.equal(f.published.length,1);
  const objects=f.published[0];
  assert.equal(objects.length,6);
  assert.equal(objects[0].id,'user-1');
  assert.equal(result.objects.length,5);
  for(const object of result.objects){
    assert.match(object.mask_artifact_id,/^canonical-mask-/);
    assert.equal(object.metadata.sourceArtifactId,source.current_image_artifact_id);
    assert.equal(object.metadata.segmentation,'AUTO');
    assert.equal(object.selected,false);
    assert.ok(object.box.w>0);
  }
});

test('after source swap no saved or published objects can escape to new photo',async()=>{
  const f=fixture({result:()=>{f.setLive({...source,current_image_artifact_id:'new-final',revision:1});return evidence();}});
  const result=await f.runner.start(source);
  assert.equal(result.status,'STALE_SOURCE');
  assert.equal(f.saved.length,0);
  assert.equal(f.published.length,0);
});

test('after a persisted mask, changing Project revision blocks partial publication',async()=>{
  const f=fixture({afterPersist:(count,set)=>{if(count===1)set({...source,revision:1});}});
  const result=await f.runner.start(source);
  assert.equal(result.status,'STALE_SOURCE');
  assert.equal(f.saved.length,1);
  assert.equal(f.published.length,0);
});

test('an atomic Core CAS race is surfaced as stale and never reported complete',async()=>{
  const f=fixture({beforeCommit:set=>set({...source,revision:1})});
  const result=await f.runner.start(source);
  assert.equal(result.status,'STALE_SOURCE');
  assert.equal(f.saved.length,5);
  assert.equal(f.published.length,0);
});

test('Core rejection of missing or wrong-source MASK aborts all Object publishing',async()=>{
  const invalid=sceneObjectFromCanonical.bind(null,validateSceneCandidates(evidence(),source).instances[0]);
  for(const result of [
    {artifactId:'real',role:'MASK',state:'AVAILABLE',coordinateSpace:'ORIGINAL',sourceImageArtifactId:'old'},
    {artifactId:'real',role:'MASK',state:'DRAFT',coordinateSpace:'ORIGINAL',sourceImageArtifactId:'source-signed-1'},
    {artifactId:'',role:'MASK',state:'AVAILABLE',coordinateSpace:'ORIGINAL',sourceImageArtifactId:'source-signed-1'},
  ])assert.throws(()=>invalid(result,source,'id'));
});

test('Editor mounts a source-bound status panel, not a legacy detection/synthetic-mask fallback',async()=>{
  const [editor,panel,transport,store] = await Promise.all([
    readFile('src/pages/Editor.jsx','utf8'),
    readFile('src/components/editor/AutoSceneMasksPanel.jsx','utf8'),
    readFile('server/core/http/nodeHttpAdapter.ts','utf8'),
    readFile('server/core/projects/postgresProjectStore.ts','utf8'),
  ]);
  assert.match(editor,/<AutoSceneMasksPanel/);
  assert.match(panel,/runner\.start\(project\)/);
  assert.match(panel,/SCENE_GROUPS\.map/);
  assert.doesNotMatch(panel,/sam3Segment|segmentationService\.start|detectObjects/);
  assert.match(transport,/expectedSourceArtifactId/);
  assert.match(transport,/expectedRevision/);
  assert.match(store,/current_image_storage_id=\$\$?\{/);
  assert.match(store,/project_source_conflict/);
});

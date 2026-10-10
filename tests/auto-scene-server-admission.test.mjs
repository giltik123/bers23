import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCanonicalSceneObjectPublication } from '../server/core/projects/sceneObjectAdmission.ts';

const scope={tenantId:'tenant',userId:'user',projectId:'project'};
const photo='signed-photo';
const mask='signed-mask-1';
const object={
  id:'auto-1',type:'object',label:'Face',category:'FACE',group:'FACE',
  confidence:.9,selected:false,mask_url:null,mask_artifact_id:mask,
  box:{x:.2,y:.1,w:.4,h:.5},
  metadata:{
    segmentation:'AUTO',modelId:'semantic-model',modelVersion:'1.0',
    sourceArtifactId:photo,maskState:'CORE_PERSISTED_UNREVIEWED',
  },
};
function fixture({storedSource='storage-image',storedWidth=8,producerOperation='LOCAL_SEGMENTATION'}={}){
  let loads=0;
  return {
    input:{
      objects:[object],sourceArtifactId:photo,sourceStorageId:'storage-image',
      scope,
      artifacts:{
        images:{loadSource:async()=>({width:8,height:6})},
        external:{resolveStoredMask:(id,sc)=>{
          if(id!==mask||sc.projectId!=='project')throw Error('bad signature/scope');
          return {storageId:'mask-storage'};
        }},
        masks:{load:async()=>{loads++;return{
          storageId:'mask-storage',sourceImageStorageId:storedSource,
          producerOperation,width:storedWidth,height:6,
        };}},
      },
    },
    getMaskLoads:()=>loads,
  };
}
test('real Core signed MASK with matching source and geometry may publish once',async()=>{
  const f=fixture();
  await assert.doesNotReject(()=>assertCanonicalSceneObjectPublication(f.input));
  assert.equal(f.getMaskLoads(),1);
});
test('semantic labels and boxes alone never substitute for signed canonical MASKs',async()=>{
  for(const change of [
    {mask_artifact_id:null},
    {mask_artifact_id:'fake-mask'},
    {category:'UNKNOWN'},
    {category:'ACCESSORY',group:'FACE'},
    {confidence:1.1},
    {selected:true},
    {mask_url:'/fake.png'},
    {box:{x:0,y:0,w:1.5,h:1}},
    {metadata:{...object.metadata,sourceArtifactId:'old'}},
    {metadata:{...object.metadata,maskState:'UNVERIFIED'}},
  ]){
    const f=fixture();
    f.input.objects=[{...object,...change}];
    await assert.rejects(()=>assertCanonicalSceneObjectPublication(f.input),/Scene Object/);
  }
});
test('cross-source or wrong-dimension MASK is rejected by Core after model admission',async()=>{
  for(const changed of [
    {storedSource:'old-image'},
    {storedWidth:12},
  ]){
    const f=fixture(changed);
    await assert.rejects(()=>assertCanonicalSceneObjectPublication(f.input),/exact canonical photo/);
  }
});
test('manual MASK cannot be falsely relabeled as an automatically analyzed face',async()=>{
  const f=fixture({producerOperation:'MANUAL_SELECTION'});
  await assert.rejects(
    ()=>assertCanonicalSceneObjectPublication(f.input),
    /exact canonical photo/,
  );
});

test('two semantic labels cannot point to the same canonical MASK',async()=>{
  const f=fixture();
  f.input.objects=[object,{...object,id:'auto-2',label:'Glasses',category:'ACCESSORY',group:'ACCESSORY'}];
  await assert.rejects(()=>assertCanonicalSceneObjectPublication(f.input),/Scene Object/);
});
test('manual objects are allowed alongside verified auto objects, but never replace verification',async()=>{
  const f=fixture();
  f.input.objects=[{id:'manual-1',label:'Retouched area',metadata:{segmentation:'MANUAL'}},object];
  await assert.doesNotReject(()=>assertCanonicalSceneObjectPublication(f.input));
  const g=fixture();
  g.input.objects=[{id:'manual-only',label:'Other',metadata:{segmentation:'MANUAL'}}];
  await assert.rejects(()=>assertCanonicalSceneObjectPublication(g.input),/one to 64/);
});

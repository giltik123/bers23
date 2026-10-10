import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorLayerDocumentRND, changeEditorLayerDocumentRND } from '../src/platform/creative/deterministic/EditorLayerDocumentRND.ts';
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const base={tenantId:'tenant_1',projectId:'project_1',sourceArtifactId:'original_1',sourceSha256:A,width:4,height:3};
const item=(id,overrides={})=>({
  id,artifactId:`asset_${id}`,artifactSha256:B,visible:true,locked:false,opacityQ8:255,blendMode:'NORMAL',...overrides,
});
const mutate=(document,change,overrides={})=>
  changeEditorLayerDocumentRND(document,{expectedRevision:document.revision,sourceSha256:A,change,...overrides});

test('source-bound Editor layer draft has no Core authority and only immutable asset references',()=>{
  const mutable=item('foreground',{maskArtifactId:'mask_1',maskSha256:C});
  const original=createEditorLayerDocumentRND({...base,layers:[mutable]});
  assert.deepEqual(original.layers,[mutable]);
  assert.equal(original.authority,'NONE_RESEARCH_ONLY');
  assert.equal(original.kind,'BERS_EDITOR_LAYER_DRAFT_RND');
  assert.equal(original.revision,0);
  assert.equal(Object.isFrozen(original),true);
  assert.equal(Object.isFrozen(original.layers),true);
  assert.equal(Object.isFrozen(original.layers[0]),true);
  mutable.opacityQ8=100;
  assert.equal(original.layers[0].opacityQ8,255);
});

test('layer draft add/move/toggle/opacity/removal produce persistent immutable snapshots',()=>{
  const zero=createEditorLayerDocumentRND(base);
  const one=mutate(zero,{type:'ADD',layer:item('front')});
  const two=mutate(one,{type:'ADD',layer:item('back')});
  const three=mutate(two,{type:'MOVE',layerId:'front',toIndex:1});
  const four=mutate(three,{type:'SET_VISIBILITY',layerId:'front',visible:false});
  const five=mutate(four,{type:'SET_OPACITY',layerId:'front',opacityQ8:120});
  const six=mutate(five,{type:'REMOVE',layerId:'back'});
  assert.deepEqual([one.revision,two.revision,three.revision,four.revision,five.revision,six.revision],[1,2,3,4,5,6]);
  assert.deepEqual(three.layers.map(x=>x.id),['back','front']);
  assert.equal(four.layers[1].visible,false);
  assert.equal(five.layers[1].opacityQ8,120);
  assert.deepEqual(six.layers.map(x=>x.id),['front']);
  assert.equal(two.layers[0].visible,true);
  assert.equal(two.layers[0].opacityQ8,255);
  assert.deepEqual(zero.layers,[]);
});

test('source drift, stale local revision, locked layer and unknown operation fail closed',()=>{
  const doc=createEditorLayerDocumentRND({...base,layers:[item('locked',{locked:true}),item('free')]});
  assert.throws(()=>mutate(doc,{type:'SET_OPACITY',layerId:'free',opacityQ8:15},{sourceSha256:B}),/source SHA drift/u);
  assert.throws(()=>mutate(doc,{type:'SET_OPACITY',layerId:'free',opacityQ8:15},{expectedRevision:1}),/stale revision/u);
  for(const change of [
    {type:'REMOVE',layerId:'locked'},
    {type:'MOVE',layerId:'locked',toIndex:1},
    {type:'SET_VISIBILITY',layerId:'locked',visible:false},
    {type:'SET_OPACITY',layerId:'locked',opacityQ8:0},
  ])assert.throws(()=>mutate(doc,change),/locked/u);
  assert.throws(()=>mutate(doc,{type:'DANGEROUS_COMMIT',layerId:'free'}),/unsupported/u);
});

test('invalid artifact SHA, missing mask hash, duplicate identities, bounded layer caps fail closed',()=>{
  for(const invalid of [
    {...base,sourceSha256:B.toUpperCase()},
    {...base,width:0},
    {...base,width:16000,height:16000},
    {...base,layers:[item('one'),item('one')]},
    {...base,layers:[item('bad!',{})]},
    {...base,layers:[item('one',{maskArtifactId:'mask_1'})]},
    {...base,layers:[item('one',{maskSha256:C})]},
    {...base,layers:[item('one',{artifactSha256:'invalid'})]},
    {...base,layers:[item('one',{opacityQ8:256})]},
    {...base,layers:[item('one',{blendMode:'SCREEN'})]},
    {...base,layers:Array.from({length:33},(_,i)=>item(`item_${i}`))},
  ]) assert.throws(()=>createEditorLayerDocumentRND(invalid));
  const d=createEditorLayerDocumentRND({...base,layers:[item('one')]});
  assert.throws(()=>mutate(d,{type:'ADD',layer:item('one')}),/duplicate/u);
  assert.throws(()=>mutate(d,{type:'MOVE',layerId:'one',toIndex:1}),/index/u);
  assert.throws(()=>mutate(d,{type:'SET_OPACITY',layerId:'one',opacityQ8:1.3}),/opacity/u);
  assert.throws(()=>mutate(d,{type:'REMOVE',layerId:'missing'}),/not found/u);
});

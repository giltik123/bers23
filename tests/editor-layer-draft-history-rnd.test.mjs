import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorLayerDocumentRND } from '../src/platform/creative/deterministic/EditorLayerDocumentRND.ts';
import {
  createEditorLayerDraftHistoryRND,
  applyEditorLayerDraftHistoryRND,
  undoEditorLayerDraftHistoryRND,
  redoEditorLayerDraftHistoryRND,
} from '../src/platform/creative/deterministic/EditorLayerDraftHistoryRND.ts';

const SOURCE='a'.repeat(64);
const WRONG='b'.repeat(64);
const layer=(id)=>({id,artifactId:'source_'+id,artifactSha256:'c'.repeat(64),
  visible:true,locked:false,opacityQ8:255,blendMode:'NORMAL'});
const start=()=>createEditorLayerDraftHistoryRND(createEditorLayerDocumentRND({
  tenantId:'tenant_1',projectId:'project_1',sourceArtifactId:'source_1',sourceSha256:SOURCE,
  width:12,height:7,
}));
const apply=(state,change)=>applyEditorLayerDraftHistoryRND(state,state.current.revision,SOURCE,change);
const undo=(state)=>undoEditorLayerDraftHistoryRND(state,state.current.revision,SOURCE);
const redo=(state)=>redoEditorLayerDraftHistoryRND(state,state.current.revision,SOURCE);

test('layer document Undo/Redo are source-bound, persistent and revision-monotonic',()=>{
  const s0=start();
  const s1=apply(s0,{type:'ADD',layer:layer('A')});
  const s2=apply(s1,{type:'ADD',layer:layer('B')});
  const s3=apply(s2,{type:'SET_OPACITY',layerId:'A',opacityQ8:83});
  const s4=undo(s3);
  const s5=undo(s4);
  const s6=redo(s5);
  assert.deepEqual(s4.current.layers.map(x=>x.id),['A','B']);
  assert.equal(s4.current.layers[0].opacityQ8,255);
  assert.deepEqual(s5.current.layers.map(x=>x.id),['A']);
  assert.deepEqual(s6.current.layers.map(x=>x.id),['A','B']);
  assert.deepEqual([s0.current.revision,s1.current.revision,s2.current.revision,
    s3.current.revision,s4.current.revision,s5.current.revision,s6.current.revision],
    [0,1,2,3,4,5,6]);
  assert.equal(s3.current.layers[0].opacityQ8,83);
  assert.equal(s3.undo.length,3);
  assert.equal(s0.undo.length,0);
  assert.equal(s5.redo.length,2);
  assert.equal(s6.redo.length,1);
  assert.equal(s6.coreAuthorityGranted,false);
  assert.ok(Object.isFrozen(s6)&&Object.isFrozen(s6.undo)&&Object.isFrozen(s6.redo));
});

test('redo is invalidated by new change after undo and protected locks stay enforced',()=>{
  const s0=start(),s1=apply(s0,{type:'ADD',layer:layer('A')});
  const s2=apply(s1,{type:'ADD',layer:layer('B')});
  const undone=undo(s2);
  const changed=apply(undone,{type:'SET_VISIBILITY',layerId:'A',visible:false});
  assert.equal(changed.redo.length,0);
  assert.throws(()=>redo(changed),/redo stack empty/u);
  const locked=apply(changed,{type:'ADD',layer:{...layer('locked'),locked:true}});
  assert.throws(()=>apply(locked,{type:'REMOVE',layerId:'locked'}),/locked/u);
});

test('source SHA drift and stale state revisions deny apply Undo and Redo',()=>{
  const state=apply(start(),{type:'ADD',layer:layer('A')});
  const stale=state.current.revision-1;
  const operations=[
    ()=>applyEditorLayerDraftHistoryRND(state,stale,SOURCE,{type:'REMOVE',layerId:'A'}),
    ()=>undoEditorLayerDraftHistoryRND(state,stale,SOURCE),
    ()=>redoEditorLayerDraftHistoryRND(state,stale,SOURCE),
  ];
  for(const operation of operations)assert.throws(operation,/stale/u);
  for(const operation of [
    ()=>applyEditorLayerDraftHistoryRND(state,state.current.revision,WRONG,{type:'REMOVE',layerId:'A'}),
    ()=>undoEditorLayerDraftHistoryRND(state,state.current.revision,WRONG),
    ()=>redoEditorLayerDraftHistoryRND(state,state.current.revision,WRONG),
  ])assert.throws(operation,/source SHA drift/u);
});

test('layer history truncates safely at 64 undo steps without mutating older snapshots',()=>{
  let state=start();
  const original=state;
  for(let i=0;i<100;i++){
    state=apply(state,{type:'ADD',layer:layer('item_'+i)});
    state=apply(state,{type:'REMOVE',layerId:'item_'+i});
  }
  assert.equal(state.undo.length,64);
  assert.equal(state.current.revision,200);
  assert.equal(state.current.layers.length,0);
  assert.equal(original.current.revision,0);
  assert.equal(original.current.layers.length,0);
  for(let i=0;i<64;i++)state=undo(state);
  assert.equal(state.undo.length,0);
  assert.equal(state.current.revision,264);
  assert.throws(()=>undo(state),/undo stack empty/u);
});

test('malformed or cross-Project history snapshots cannot be replayed',()=>{
  const s1=apply(start(),{type:'ADD',layer:layer('first')});
  const forged={
    ...s1,
    undo:[{...s1.undo[0],projectId:'other_project'}],
  };
  assert.throws(()=>undo(forged),/cross source\/project bounds/u);
  assert.throws(()=>undo({...s1,maximumSteps:900}),/malformed/u);
  assert.throws(()=>undo({...s1,coreAuthorityGranted:true}),/malformed/u);
});

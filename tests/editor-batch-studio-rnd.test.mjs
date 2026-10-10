import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileEditorBatchPlanRND, executeEditorBatchPlanRND } from '../src/platform/creative/deterministic/EditorBatchStudioRND.ts';
import { cropRgba8 } from '../src/platform/creative/deterministic/Crop.ts';
import { resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { orthogonalTransformRgba8 } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pixels=Uint8Array.from([
  1,20,30,0, 40,50,60,255,
  70,80,90,100, 110,120,130,255,
  31,32,33,0, 51,52,53,128,
]);
const base=(steps,overrides={})=>({
  sourceArtifactId:'artifact_1',sourceSha256:hash(pixels),
  width:2,height:3,steps,...overrides,
});

test('batch plan compiles exact Crop/Resize/Rotate geometry and source-lineage budget',()=>{
  const steps=[
    {kind:'CROP',rect:{x:1,y:0,width:1,height:3}},
    {kind:'RESIZE',target:{width:2,height:3}},
    {kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_90_CW'},
  ];
  const plan=compileEditorBatchPlanRND(base(steps));
  assert.equal(plan.kind,'BERS_EDITOR_BATCH_PLAN_RND');
  assert.equal(plan.authority,'NONE_RESEARCH_ONLY');
  assert.equal(plan.inputWidth,2);
  assert.equal(plan.outputWidth,3);
  assert.equal(plan.outputHeight,2);
  assert.equal(plan.estimatedPixelVisits,6+3+3+6+6+6);
  assert.equal(Object.isFrozen(plan),true);
  assert.equal(Object.isFrozen(plan.steps),true);
  assert.equal(Object.isFrozen(plan.steps[0].rect),true);
  assert.deepEqual(plan.steps,steps);
});

test('local batch output equals sequential accepted deterministic kernels exactly',async()=>{
  const steps=[
    {kind:'CROP',rect:{x:1,y:0,width:1,height:3}},
    {kind:'RESIZE',target:{width:2,height:3}},
    {kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_90_CW'},
  ];
  const plan=compileEditorBatchPlanRND(base(steps));
  const before=Uint8Array.from(pixels);
  const result=await executeEditorBatchPlanRND(plan,pixels);
  const ref0=cropRgba8(pixels,2,3,steps[0].rect);
  const ref1=resizeRgba8(ref0,1,3,steps[1].target);
  const expected=orthogonalTransformRgba8(ref1,2,3,steps[2].mode);
  assert.deepEqual([...result.bytes],[...expected]);
  assert.deepEqual([...pixels],[...before]);
  assert.equal(result.width,3);
  assert.equal(result.height,2);
  assert.equal(result.executedStepCount,3);
  assert.equal(result.outputSha256,hash(expected));
  assert.equal(result.sourceSha256,hash(pixels));
  assert.equal(result.coreAuthorityGranted,false);
  assert.equal(result.cloudProviderUsed,false);
  assert.equal(Object.isFrozen(result),true);
  const view=result.bytes;
  view.fill(0);
  assert.equal(hash(result.bytes),result.outputSha256,'result buffer must be defensive');
});

test('identical recipe and source pixels reproduce the identical local result hash',async()=>{
  const steps=[{kind:'ORTHOGONAL_TRANSFORM',mode:'FLIP_HORIZONTAL'}];
  const plan=compileEditorBatchPlanRND(base(steps));
  const one=await executeEditorBatchPlanRND(plan,pixels);
  const two=await executeEditorBatchPlanRND(plan,Uint8Array.from(pixels));
  assert.deepEqual(Buffer.from(one.bytes),Buffer.from(two.bytes));
  assert.equal(one.outputSha256,two.outputSha256);
});

test('mismatched exact source SHA, malformed payloads, unknown GPU/cloud operations fail closed',async()=>{
  const valid=compileEditorBatchPlanRND(base([{kind:'CROP',rect:{x:0,y:0,width:2,height:2}}]));
  const modified=Uint8Array.from(pixels);
  modified[0]=255;
  await assert.rejects(executeEditorBatchPlanRND(valid,modified),/source SHA mismatch/u);
  await assert.rejects(executeEditorBatchPlanRND({...valid,outputWidth:10},pixels),/tampered/u);
  await assert.rejects(executeEditorBatchPlanRND(valid,pixels.slice(0,5)),/exact RGBA8/u);
  for(const invalid of [
    base([]),base(Array.from({length:9},()=>({kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_90_CW'}))),
    base([{kind:'GENERATIVE_RETOUCH',provider:'Ideogram'}]),
    base([{kind:'CROP',rect:{x:0,y:0,width:3,height:3}}]),
    base([{kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_45'}]),
    base([{kind:'RESIZE',target:{width:5000,height:5}}]),
    base([{kind:'RESIZE',target:{width:2,height:2},secretProvider:'cloud'}]),
    base([{kind:'CROP',rect:{x:0,y:0,width:2,height:1,cloud:true}}]),
    base([{kind:'RESIZE',target:{width:2,height:1,cloud:true}}]),
    base([{kind:'CROP',rect:null}]),
    base([{kind:'RESIZE',target:null}]),
    base([{kind:'RESIZE',target:{width:1.5,height:1}}]),
    base([{kind:'CROP',rect:{x:0,y:0,width:1,height:1}}],{sourceSha256:'wrong'}),
    base([{kind:'CROP',rect:{x:0,y:0,width:1,height:1}}],{sourceArtifactId:'../wrong'}),
  ])assert.throws(()=>compileEditorBatchPlanRND(invalid));
});

test('cancel is observed before source work, and cannot lead to a partial published FINAL',async()=>{
  const controller=new AbortController();
  controller.abort();
  const plan=compileEditorBatchPlanRND(base([{kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_90_CW'}]));
  await assert.rejects(executeEditorBatchPlanRND(plan,pixels,controller.signal),/cancelled/u);
  assert.equal(plan.authority,'NONE_RESEARCH_ONLY');
});

test('batch work budget and input geometry are bounded independently from operation kernels',()=>{
  const sha='a'.repeat(64);
  const nearLimit=compileEditorBatchPlanRND({
    sourceArtifactId:'photo1',sourceSha256:sha,width:2048,height:2048,
    steps:[{kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_180'}],
  });
  assert.equal(nearLimit.outputWidth,2048);
  assert.throws(()=>compileEditorBatchPlanRND({
    sourceArtifactId:'photo1',sourceSha256:sha,width:2048,height:2048,
    steps:Array.from({length:8},()=>({kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_180'})),
  }),/budget/u);
  assert.throws(()=>compileEditorBatchPlanRND({
    sourceArtifactId:'photo1',sourceSha256:sha,width:8192,height:8192,
    steps:[{kind:'ORTHOGONAL_TRANSFORM',mode:'ROTATE_180'}],
  }),/geometry/u);
});

test('batch source excludes hidden upload/provider/Billing/FINAL side effects',async()=>{
  const source=await readFile('src/platform/creative/deterministic/EditorBatchStudioRND.ts','utf8');
  for(const forbidden of ['Core.UploadFile','fetch(','coreClient','createFinal','commitProject','billCredits','invoice','providerKey']) {
    assert.equal(source.includes(forbidden),false,forbidden);
  }
  assert.match(source,/cloudProviderUsed:false/u);
  assert.match(source,/coreAuthorityGranted:false/u);
});

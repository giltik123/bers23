import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  ACCEPTED_EXECUTOR_BASE_SHA,
  MANIFEST_SCHEMA,
  collectFoundationEvidence,
  normalizeDispatchManifest,
} from '../scripts/hsme-foundation-benchmark-evidence-collector.mjs';
import { hsmeFoundationFixturePlanDigestV1 } from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkFixturePlanV1.ts';

const root=process.cwd();
const cache='.test-cache/hsme-2a-3-3c';
const outputDomain='bers:hsme:foundation-benchmark-output-set:v1\0';
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>JSON.stringify(value,null,2)+'\n';

const campaign=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8'));
const trust=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8'));
const fixturePlan=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json','utf8'));
const fixturePack=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json','utf8'));
const fixturePlanDigest=await hsmeFoundationFixturePlanDigestV1(fixturePlan,hashPort);
const substratePaths=[
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-execution-profiles.v1.json',
  'tests/fixtures/hsme-foundation-generated-editing-v1/fixture-manifest.json',
  'tests/fixtures/tiny-sd-d6-quality-corpus-v1.json',
];
const substrateDigests={};
for(const path of substratePaths)substrateDigests[path]=sha(await readFile(path));
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];

function outputDigest(outputs){
  const normalized=[...outputs].map(x=>({fixtureId:x.fixtureId,seed:x.seed,blindId:x.blindId,imageSha256:x.imageSha256}))
    .sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed||a.blindId.localeCompare(b.blindId));
  return sha(Buffer.from(outputDomain+JSON.stringify(normalized),'utf8'));
}
function candidate(id){return campaign.candidates.find(x=>x.candidateId===id);}
function basePlan(c,cap,disposition){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1',
    candidateSha:ACCEPTED_EXECUTOR_BASE_SHA,
    controllerMainSha:ACCEPTED_EXECUTOR_BASE_SHA,
    substrateDigests:{...substrateDigests},
    campaignId:campaign.campaignId,
    campaignDigest:trust.campaignDigest,
    fixturePlanDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    candidateId:c.candidateId,
    capability:cap,
    disposition,
    immutableRevision:c.immutableRevision,
    modelContentSha256:c.modelContentSha256,
    executionProfileSha256:c.executionProfileSha256,
    rightsEvidenceSha256:c.rightsEvidenceSha256,
    runtimeArtifacts:disposition==='EXECUTE'?[{relativePath:'weights.bin',bytes:3,contentSha256:'a'.repeat(64)}]:[],
    ordinaryCiModelExecutionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
}
function terminalRun(plan,status){
  return {
    candidateId:plan.candidateId,capability:plan.capability,status,
    immutableRevision:plan.immutableRevision,modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:'UNKNOWN',outputSetSha256:'UNKNOWN',reviewPackageSha256:'UNKNOWN',
    failureEvidenceSha256:'UNKNOWN',outputs:[],
  };
}
async function writeJson(path,value){
  const bytes=Buffer.from(stable(value),'utf8');
  await writeFile(path,bytes);
  return sha(bytes);
}
async function writeFailedBundle(dir,plan){
  await mkdir(dir,{recursive:true});
  await writeJson(join(dir,'execution-plan.json'),plan);
  const inventory={schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',candidateId:plan.candidateId,immutableRevision:plan.immutableRevision,complete:false,artifacts:[]};
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inventory);
  const failure={schemaVersion:'BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1',candidateId:plan.candidateId,capability:plan.capability,errorType:'SyntheticFailure',errorMessage:'synthetic collector fixture',tracebackSha256:'b'.repeat(64),productionAuthorityGranted:false,winnerSelectionAllowed:false};
  const failureSha=await writeJson(join(dir,'failure-evidence.json'),failure);
  const run={
    candidateId:plan.candidateId,capability:plan.capability,status:'FAILED',
    immutableRevision:plan.immutableRevision,modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:inventorySha,outputSetSha256:'UNKNOWN',reviewPackageSha256:'UNKNOWN',
    failureEvidenceSha256:failureSha,outputs:[],
  };
  await writeJson(join(dir,'candidate-run.json'),run);
}
async function writeTerminalBundle(dir,plan,status){
  await mkdir(dir,{recursive:true});
  await writeJson(join(dir,'execution-plan.json'),plan);
  await writeJson(join(dir,'terminal-row.json'),terminalRun(plan,status));
}
function blind(candidateId,cap,fixtureId,seed,salt=''){
  return 'blind_'+sha(Buffer.from(candidateId+'\0'+cap+'\0'+fixtureId+'\0'+seed+'\0'+salt)).slice(0,24);
}
async function writeCompleteBundle(dir,plan,{reuseBlindFrom=null}={}){
  await mkdir(join(dir,'blind-review'),{recursive:true});
  await writeJson(join(dir,'execution-plan.json'),plan);
  const inventory={schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',candidateId:plan.candidateId,immutableRevision:plan.immutableRevision,complete:true,artifacts:[{relativePath:'weights.bin',bytes:3,contentSha256:'a'.repeat(64)}]};
  const inventorySha=await writeJson(join(dir,'runtime-inventory.json'),inventory);
  const fixtureIds=fixturePlan.assets.filter(x=>x.capability===plan.capability).map(x=>x.fixtureId).sort();
  const outputs=[];
  const reviewOutputs=[];
  for(const fixtureId of fixtureIds){
    for(const seed of fixturePack.sources.outputSetContract.requiredSeeds){
      const blindId=reuseBlindFrom?blind(reuseBlindFrom.candidateId,reuseBlindFrom.capability,fixtureId,seed):blind(plan.candidateId,plan.capability,fixtureId,seed);
      const bytes=Buffer.from('synthetic-image:'+plan.candidateId+':'+plan.capability+':'+fixtureId+':'+seed);
      const imageSha256=sha(bytes);
      await writeFile(join(dir,'blind-review',blindId+'.png'),bytes);
      outputs.push({fixtureId,seed,blindId,imageSha256});
      reviewOutputs.push({fixtureId,seed,blindId,imageSha256,relativePath:blindId+'.png'});
    }
  }
  outputs.sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed);
  reviewOutputs.sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed);
  const review={
    schemaVersion:'BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1',
    campaignId:campaign.campaignId,capability:plan.capability,outputs:reviewOutputs,
    candidateIdentityIncluded:false,latencyIncluded:false,sizeIncluded:false,costIncluded:false,
  };
  const reviewSha=await writeJson(join(dir,'review-package.json'),review);
  const run={
    candidateId:plan.candidateId,capability:plan.capability,status:'COMPLETE',
    immutableRevision:plan.immutableRevision,modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:inventorySha,outputSetSha256:outputDigest(outputs),reviewPackageSha256:reviewSha,
    failureEvidenceSha256:'UNKNOWN',outputs,
  };
  await writeJson(join(dir,'candidate-run.json'),run);
}
function makeManifest(rows){
  return {
    schemaVersion:MANIFEST_SCHEMA,
    acceptedExecutorBaseSha:ACCEPTED_EXECUTOR_BASE_SHA,
    campaignId:campaign.campaignId,
    rows,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
async function buildCampaignBundles(name,{completeIds=['tiny-sd-control-v1\0TEXT_TO_IMAGE'],duplicateBlindPair=null}={}){
  const base=join(cache,name);
  await rm(base,{recursive:true,force:true});
  await mkdir(base,{recursive:true});
  const rows=[];
  let runId=1000;
  for(const c of campaign.candidates){
    for(const cap of caps){
      const supported=c.capabilities.includes(cap);
      let disposition=supported?'EXECUTE':'NOT_APPLICABLE';
      if(c.candidateId==='sana-sprint-0.6b-split-v1'&&cap==='TEXT_TO_IMAGE')disposition='BLOCKED_PARITY_PENDING';
      const plan=basePlan(c,cap,disposition);
      const rel=base+'/'+c.candidateId+'--'+cap;
      const dir=join(root,rel);
      if(disposition==='NOT_APPLICABLE')await writeTerminalBundle(dir,plan,'NOT_APPLICABLE');
      else if(disposition==='BLOCKED_PARITY_PENDING')await writeTerminalBundle(dir,plan,'BLOCKED_PARITY_PENDING');
      else if(completeIds.includes(c.candidateId+'\0'+cap)){
        let reuse=null;
        if(duplicateBlindPair&&duplicateBlindPair.target===c.candidateId+'\0'+cap)reuse=duplicateBlindPair.source;
        await writeCompleteBundle(dir,plan,{reuseBlindFrom:reuse});
      }else await writeFailedBundle(dir,plan);
      rows.push({candidateId:c.candidateId,capability:cap,workflowRunId:runId++,bundlePath:rel});
    }
  }
  return {base,manifest:makeManifest(rows)};
}

test.after(async()=>{await rm(cache,{recursive:true,force:true});});

test('frozen dispatch matrix matches campaign roster and current SANA block',async()=>{
  const matrix=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-dispatch-matrix.v1.json','utf8'));
  assert.equal(matrix.acceptedExecutorBaseSha,ACCEPTED_EXECUTOR_BASE_SHA);
  assert.equal(matrix.candidateShaInput,ACCEPTED_EXECUTOR_BASE_SHA);
  assert.equal(matrix.manualDispatchOnly,true);
  assert.equal(matrix.ordinaryCiDispatchAllowed,false);
  assert.equal(matrix.winnerSelectionAllowed,false);
  assert.equal(matrix.rows.length,12);
  const keys=matrix.rows.map(x=>x.candidateId+'\0'+x.capability);
  assert.equal(new Set(keys).size,12);
  for(const row of matrix.rows){
    const c=candidate(row.candidateId);
    assert.ok(c);
    const supported=c.capabilities.includes(row.capability);
    if(!supported)assert.equal(row.currentExpectedDisposition,'NOT_APPLICABLE');
    else if(row.candidateId==='sana-sprint-0.6b-split-v1'&&row.capability==='TEXT_TO_IMAGE')assert.equal(row.currentExpectedDisposition,'BLOCKED_PARITY_PENDING');
    else assert.equal(row.currentExpectedDisposition,'EXECUTE');
  }
});

test('dispatch manifest requires exact 12-row roster and unique workflow run ids',()=>{
  const rows=campaign.candidates.flatMap((c,ci)=>caps.map((cap,ki)=>({candidateId:c.candidateId,capability:cap,workflowRunId:100+ci*2+ki,bundlePath:'bundle/'+c.candidateId+'-'+cap})));
  const normalized=normalizeDispatchManifest(makeManifest(rows),campaign);
  assert.equal(normalized.rows.length,12);
  const duplicate=structuredClone(makeManifest(rows));
  duplicate.rows[1].workflowRunId=duplicate.rows[0].workflowRunId;
  assert.throws(()=>normalizeDispatchManifest(duplicate,campaign),error=>error?.code==='hsme_collector_manifest_duplicate_run');
  const missing=structuredClone(makeManifest(rows.slice(0,11)));
  assert.throws(()=>normalizeDispatchManifest(missing,campaign),error=>error?.code==='hsme_collector_manifest_row_count');
});

test('manifest rejects path traversal and wrong accepted executor base',()=>{
  const rows=campaign.candidates.flatMap((c,ci)=>caps.map((cap,ki)=>({candidateId:c.candidateId,capability:cap,workflowRunId:200+ci*2+ki,bundlePath:'bundle/'+c.candidateId+'-'+cap})));
  const traversal=makeManifest(rows);
  traversal.rows[0].bundlePath='../escape';
  assert.throws(()=>normalizeDispatchManifest(traversal,campaign),error=>error?.code==='hsme_collector_path_invalid');
  const stale=makeManifest(rows);
  stale.acceptedExecutorBaseSha='0'.repeat(40);
  assert.throws(()=>normalizeDispatchManifest(stale,campaign),error=>error?.code==='hsme_collector_executor_base_mismatch');
});

test('collector builds canonical evidence with complete, failed, blocked and unsupported rows',async()=>{
  const {manifest}=await buildCampaignBundles('mixed');
  const result=await collectFoundationEvidence(root,manifest);
  assert.equal(result.collectionProof.state,'FAILED');
  assert.equal(result.collectionProof.completeRunCount,1);
  assert.equal(result.collectionProof.blockedRunCount,1);
  assert.equal(result.collectionProof.notApplicableRunCount,4);
  assert.equal(result.collectionProof.failedRunCount,6);
  assert.equal(result.collectionProof.observedOutputCount,12);
  assert.equal(result.collectionProof.sources.length,12);
  assert.equal(result.collectionProof.winnerSelectionAllowed,false);
  assert.equal(result.evidence.runs.length,12);
});

test('collector rejects execution plan substrate digest drift',async()=>{
  const {manifest}=await buildCampaignBundles('substrate-drift');
  const row=manifest.rows.find(x=>x.candidateId==='flux2-klein-4b-distilled-v1'&&x.capability==='TEXT_TO_IMAGE');
  const planPath=join(root,row.bundlePath,'execution-plan.json');
  const plan=JSON.parse(await readFile(planPath,'utf8'));
  plan.substrateDigests['src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json']='0'.repeat(64);
  await writeJson(planPath,plan);
  await assert.rejects(collectFoundationEvidence(root,manifest),error=>error?.code==='hsme_collector_plan_substrate');
});

test('collector rejects stale candidate identity even when row shape is otherwise valid',async()=>{
  const {manifest}=await buildCampaignBundles('stale');
  const row=manifest.rows.find(x=>x.candidateId==='flux2-klein-base-4b-v1'&&x.capability==='TEXT_TO_IMAGE');
  const planPath=join(root,row.bundlePath,'execution-plan.json');
  const plan=JSON.parse(await readFile(planPath,'utf8'));
  plan.modelContentSha256='0'.repeat(64);
  await writeJson(planPath,plan);
  await assert.rejects(collectFoundationEvidence(root,manifest),error=>error?.code==='hsme_collector_plan_candidate');
});

test('collector rejects reviewer identity leakage even with matching review digest',async()=>{
  const {manifest}=await buildCampaignBundles('leak');
  const row=manifest.rows.find(x=>x.candidateId==='tiny-sd-control-v1'&&x.capability==='TEXT_TO_IMAGE');
  const reviewPath=join(root,row.bundlePath,'review-package.json');
  const runPath=join(root,row.bundlePath,'candidate-run.json');
  const review=JSON.parse(await readFile(reviewPath,'utf8'));
  review.candidateIdentityIncluded=true;
  const newReviewSha=await writeJson(reviewPath,review);
  const run=JSON.parse(await readFile(runPath,'utf8'));
  run.reviewPackageSha256=newReviewSha;
  await writeJson(runPath,run);
  await assert.rejects(collectFoundationEvidence(root,manifest),error=>error?.code==='hsme_collector_review_leak');
});

test('collector rejects hidden efficiency metadata in blind review package',async()=>{
  const {manifest}=await buildCampaignBundles('hidden-review-meta');
  const row=manifest.rows.find(x=>x.candidateId==='tiny-sd-control-v1'&&x.capability==='TEXT_TO_IMAGE');
  const reviewPath=join(root,row.bundlePath,'review-package.json');
  const runPath=join(root,row.bundlePath,'candidate-run.json');
  const review=JSON.parse(await readFile(reviewPath,'utf8'));
  review.latencyMs=123;
  const newReviewSha=await writeJson(reviewPath,review);
  const run=JSON.parse(await readFile(runPath,'utf8'));
  run.reviewPackageSha256=newReviewSha;
  await writeJson(runPath,run);
  await assert.rejects(collectFoundationEvidence(root,manifest),error=>error?.code==='hsme_collector_shape_invalid');
});

test('canonical proof rejects blind id reuse across two complete candidate rows',async()=>{
  const source={candidateId:'tiny-sd-control-v1',capability:'TEXT_TO_IMAGE'};
  const completeIds=['tiny-sd-control-v1\0TEXT_TO_IMAGE','qwen-image-t2i-reference-v1\0TEXT_TO_IMAGE'];
  const pair={source,target:'qwen-image-t2i-reference-v1\0TEXT_TO_IMAGE'};
  const {manifest}=await buildCampaignBundles('blind-duplicate',{completeIds,duplicateBlindPair:pair});
  await assert.rejects(
    collectFoundationEvidence(root,manifest),
    error=>error?.code==='hsme_foundation_run_blind_id_duplicate',
  );
});

test('collector proof and output never expose scoring or winner authority',async()=>{
  const {manifest}=await buildCampaignBundles('authority');
  const result=await collectFoundationEvidence(root,manifest);
  const serialized=JSON.stringify(result);
  assert.doesNotMatch(serialized,/qualityScore|winnerCandidate|selectedCandidate|latencyMs|workingMemoryBytes|costMicrousd/);
  assert.equal(result.collectionProof.productionAuthorityGranted,false);
  assert.equal(result.collectionProof.providerAuthorityGranted,false);
  assert.equal(result.collectionProof.winnerSelectionAllowed,false);
});

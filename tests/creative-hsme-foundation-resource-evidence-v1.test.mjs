import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN,
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
  hsmeFoundationRuntimeInventoryStableJsonV1,
  proveHsmeFoundationResourceEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';

const campaign=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8'));
const trust=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8'));
const fixturePlan=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json','utf8'));
const fixturePack=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json','utf8'));

const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];
const seeds=fixturePack.sources.outputSetContract.requiredSeeds;
const H=value=>createHash('sha256').update(value).digest('hex');

function candidateTrust(candidateId){
  const value=trust.candidates.find(x=>x.candidateId===candidateId);
  assert.ok(value);
  return value;
}
function fixtureIds(capability){
  return fixturePlan.assets.filter(x=>x.capability===capability).map(x=>x.fixtureId).sort();
}
function outputs(candidateId,capability){
  return fixtureIds(capability).flatMap(fixtureId=>seeds.map(seed=>({
    fixtureId,
    seed,
    blindId:'blind_'+H('blind|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed).slice(0,24),
    imageSha256:H('image|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed),
  }))).sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed||a.blindId.localeCompare(b.blindId));
}
function outputSetDigest(records){
  return createHash('sha256').update(HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN+JSON.stringify(records)).digest('hex');
}
function runtimeInventory(candidateId){
  const t=candidateTrust(candidateId);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId,
    immutableRevision:t.artifactManifest.primarySource.immutableRevision,
    complete:true,
    artifacts:t.artifactManifest.artifacts
      .filter(x=>x.runtimeRequired)
      .map(x=>({relativePath:x.relativePath,bytes:x.bytes,contentSha256:x.contentSha256}))
      .sort((a,b)=>a.relativePath<b.relativePath?-1:a.relativePath>b.relativePath?1:0),
  };
}
function inventoryDigest(inventory){
  return createHash('sha256').update(JSON.stringify(inventory,null,2)+'\n').digest('hex');
}
function runRow(candidate,capability,status){
  const out=status==='COMPLETE'?outputs(candidate.candidateId,capability):[];
  const inventory=status==='COMPLETE'?runtimeInventory(candidate.candidateId):null;
  return {
    candidateId:candidate.candidateId,
    capability,
    status,
    immutableRevision:candidate.immutableRevision,
    modelContentSha256:candidate.modelContentSha256,
    executionProfileSha256:candidate.executionProfileSha256,
    rightsEvidenceSha256:candidate.rightsEvidenceSha256,
    runtimeInventorySha256:inventory?inventoryDigest(inventory):status==='FAILED'?H('failed-inventory|'+candidate.candidateId+'|'+capability):'UNKNOWN',
    outputSetSha256:out.length?outputSetDigest(out):'UNKNOWN',
    reviewPackageSha256:status==='COMPLETE'?H('review|'+candidate.candidateId+'|'+capability):'UNKNOWN',
    failureEvidenceSha256:status==='FAILED'?H('failure|'+candidate.candidateId+'|'+capability):'UNKNOWN',
    outputs:out,
  };
}
function makeRunEvidence({sanaComplete=false,failedKey=null}={}){
  const runs=[];
  for(const candidate of campaign.candidates){
    for(const capability of caps){
      const key=candidate.candidateId+'\0'+capability;
      const supported=candidate.capabilities.includes(capability);
      let status=supported?'COMPLETE':'NOT_APPLICABLE';
      if(candidate.candidateId==='sana-sprint-0.6b-split-v1'&&capability==='TEXT_TO_IMAGE'&&!sanaComplete)status='BLOCKED_PARITY_PENDING';
      if(failedKey===key)status='FAILED';
      runs.push(runRow(candidate,capability,status));
    }
  }
  return {
    schemaVersion:HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:trust.campaignDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    requiredSeeds:[...seeds],
    candidateOutputsObserved:runs.some(x=>x.outputs.length>0),
    runs,
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
async function makeResourceEvidence(runEvidence){
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hashPort);
  const records=runEvidence.runs.filter(x=>x.status==='COMPLETE').map((run,index)=>({
    candidateId:run.candidateId,
    capability:run.capability,
    immutableRevision:run.immutableRevision,
    modelContentSha256:run.modelContentSha256,
    executionProfileSha256:run.executionProfileSha256,
    runtimeInventory:runtimeInventory(run.candidateId),
    hardwareProfileSha256:H('hardware|'+run.candidateId+'|'+run.capability),
    measurementMethodSha256:H('method|v1'),
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:1_000_000_000+index,
    coldEndToEndLatencyMicros:5_000_000+index,
    warmEndToEndLatencyMicros:4_000_000+index,
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    costEvidenceSha256:H('cost-evidence'),
    measurementEvidenceSha256:H('resource-evidence|'+run.candidateId+'|'+run.capability),
  }));
  return {
    schemaVersion:HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:runEvidence.campaignDigest,
    runEvidenceSha256,
    records,
    qualityScoringAllowed:false,
    qualityOrderingMutationAllowed:false,
    aggregateEfficiencyScoreAllowed:false,
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
async function prove(runEvidence,resource,rawCampaign=campaign){
  return proveHsmeFoundationResourceEvidenceV1(
    rawCampaign,trust,fixturePlan,fixturePack,runEvidence,resource,hashPort,
  );
}
function sumInventory(inventory){return inventory.artifacts.reduce((sum,x)=>sum+x.bytes,0);}

test('resource evidence covers exactly COMPLETE runs while blocked and N/A rows remain absent',async()=>{
  const runEvidence=makeRunEvidence();
  const resource=await makeResourceEvidence(runEvidence);
  const proof=await prove(runEvidence,resource);
  const complete=runEvidence.runs.filter(x=>x.status==='COMPLETE');
  assert.equal(proof.records.length,complete.length);
  assert.equal(proof.records.some(x=>x.candidateId==='sana-sprint-0.6b-split-v1'),false);
  assert.equal(proof.qualityScoringAllowed,false);
  assert.equal(proof.aggregateEfficiencyScoreAllowed,false);
  assert.equal(proof.winnerSelectionAllowed,false);
});

test('mandatory installed bytes are derived from exact verified runtime inventory artifacts',async()=>{
  const runEvidence=makeRunEvidence();
  const resource=await makeResourceEvidence(runEvidence);
  const proof=await prove(runEvidence,resource);
  for(const record of proof.records){
    const input=resource.records.find(x=>x.candidateId===record.candidateId&&x.capability===record.capability);
    assert.equal(record.mandatoryInstalledBytes,sumInventory(input.runtimeInventory));
    assert.equal(record.runtimeInventorySha256,inventoryDigest(input.runtimeInventory));
    assert.equal(record.workingMemoryKind,'CUDA_PEAK_RESERVED_BYTES');
  }
});

test('stable runtime inventory JSON matches the Python executor file contract',()=>{
  const inventory=runtimeInventory('tiny-sd-control-v1');
  assert.equal(hsmeFoundationRuntimeInventoryStableJsonV1(inventory),JSON.stringify(inventory,null,2)+'\n');
  assert.equal(inventoryDigest(inventory),H(hsmeFoundationRuntimeInventoryStableJsonV1(inventory)));
});

test('runtime inventory artifact drift fails against canonical run digest',async()=>{
  const runEvidence=makeRunEvidence();
  const resource=await makeResourceEvidence(runEvidence);
  const record=resource.records[0];
  record.runtimeInventory.artifacts[0].bytes+=1;
  await assert.rejects(prove(runEvidence,resource),error=>error?.code==='hsme_resource_inventory_digest');
});

test('missing COMPLETE record or extra blocked record fails exact roster',async()=>{
  const runEvidence=makeRunEvidence();
  const missing=await makeResourceEvidence(runEvidence);
  missing.records.pop();
  await assert.rejects(prove(runEvidence,missing),error=>error?.code==='hsme_resource_record_roster');

  const extra=await makeResourceEvidence(runEvidence);
  const sana=runEvidence.runs.find(x=>x.candidateId==='sana-sprint-0.6b-split-v1'&&x.capability==='TEXT_TO_IMAGE');
  extra.records.push({
    candidateId:sana.candidateId,
    capability:sana.capability,
    immutableRevision:sana.immutableRevision,
    modelContentSha256:sana.modelContentSha256,
    executionProfileSha256:sana.executionProfileSha256,
    runtimeInventory:runtimeInventory(sana.candidateId),
    hardwareProfileSha256:H('hardware|sana'),
    measurementMethodSha256:H('method|v1'),
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:1,
    coldEndToEndLatencyMicros:1,
    warmEndToEndLatencyMicros:1,
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    costEvidenceSha256:H('cost-evidence'),
    measurementEvidenceSha256:H('resource|sana'),
  });
  await assert.rejects(prove(runEvidence,extra),error=>error?.code==='hsme_resource_record_roster');
});

test('FAILED run cannot carry resource evidence',async()=>{
  const runEvidence=makeRunEvidence({failedKey:'flux2-klein-base-4b-v1\0IMAGE_EDITING'});
  const resource=await makeResourceEvidence(runEvidence);
  const failed=runEvidence.runs.find(x=>x.status==='FAILED');
  resource.records.push({
    candidateId:failed.candidateId,
    capability:failed.capability,
    immutableRevision:failed.immutableRevision,
    modelContentSha256:failed.modelContentSha256,
    executionProfileSha256:failed.executionProfileSha256,
    runtimeInventory:runtimeInventory(failed.candidateId),
    hardwareProfileSha256:H('hardware|failed'),
    measurementMethodSha256:H('method|v1'),
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:1,
    coldEndToEndLatencyMicros:1,
    warmEndToEndLatencyMicros:1,
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    costEvidenceSha256:H('cost-evidence'),
    measurementEvidenceSha256:H('resource|failed'),
  });
  await assert.rejects(prove(runEvidence,resource),error=>error?.code==='hsme_resource_record_roster');
});

test('candidate identity, run digest and campaign digest are immutable bindings',async()=>{
  const runEvidence=makeRunEvidence();
  const identity=await makeResourceEvidence(runEvidence);
  identity.records[0].executionProfileSha256=H('changed-profile');
  await assert.rejects(prove(runEvidence,identity),error=>error?.code==='hsme_resource_candidate_identity');

  const runDrift=await makeResourceEvidence(runEvidence);
  runDrift.runEvidenceSha256='0'.repeat(64);
  await assert.rejects(prove(runEvidence,runDrift),error=>error?.code==='hsme_resource_run_digest');

  const campaignDrift=await makeResourceEvidence(runEvidence);
  campaignDrift.campaignDigest='0'.repeat(64);
  await assert.rejects(prove(runEvidence,campaignDrift),error=>error?.code==='hsme_resource_campaign_digest');
});

test('mutated campaign object is rejected through exact candidate-trust proof',async()=>{
  const runEvidence=makeRunEvidence();
  const resource=await makeResourceEvidence(runEvidence);
  const changed=structuredClone(campaign);
  const t2i=changed.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  [t2i.dimensions[0],t2i.dimensions[1]]=[t2i.dimensions[1],t2i.dimensions[0]];
  await assert.rejects(
    prove(runEvidence,resource,changed),
    error=>error?.code==='hsme_foundation_trust_campaign_digest_mismatch',
  );
});

test('cost provenance is fail closed for zero and metered cost',async()=>{
  const runEvidence=makeRunEvidence();
  const zeroMetered=await makeResourceEvidence(runEvidence);
  zeroMetered.records[0].costKind='MEASURED_METERED';
  await assert.rejects(prove(runEvidence,zeroMetered),error=>error?.code==='hsme_resource_metered_cost');

  const nonzeroUnmetered=await makeResourceEvidence(runEvidence);
  nonzeroUnmetered.records[0].acceptedOutputCostMicrousd=1;
  await assert.rejects(prove(runEvidence,nonzeroUnmetered),error=>error?.code==='hsme_resource_unmetered_cost');
});

test('working-memory semantics cannot be relabeled as host or estimated memory',async()=>{
  const runEvidence=makeRunEvidence();
  const resource=await makeResourceEvidence(runEvidence);
  resource.records[0].workingMemoryKind='HOST_RSS_BYTES';
  await assert.rejects(
    prove(runEvidence,resource),
    error=>error?.code==='hsme_resource_literal',
  );
});

test('cost evidence digest is mandatory and content-addressed',async()=>{
  const runEvidence=makeRunEvidence();
  const resource=await makeResourceEvidence(runEvidence);
  resource.records[0].costEvidenceSha256='INVALID';
  await assert.rejects(prove(runEvidence,resource),error=>error?.code==='hsme_resource_sha256');
});

test('aggregate score, preferred candidate and authority fields cannot enter resource evidence',async()=>{
  const runEvidence=makeRunEvidence();
  for(const [field,value] of [
    ['aggregateEfficiencyScore',1],
    ['selectedCandidateId','flux2-klein-base-4b-v1'],
    ['qualityScore',1],
  ]){
    const resource=await makeResourceEvidence(runEvidence);
    resource[field]=value;
    await assert.rejects(prove(runEvidence,resource),error=>error?.code==='hsme_resource_field_unknown');
  }
  const authority=await makeResourceEvidence(runEvidence);
  authority.winnerSelectionAllowed=true;
  await assert.rejects(prove(runEvidence,authority),error=>error?.code==='hsme_resource_authority');
});

test('resource metrics remain distinct integer fields and do not create an ordering',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const resource=await makeResourceEvidence(runEvidence);
  resource.records[0].peakWorkingMemoryBytes=9_000_000_000;
  resource.records[0].coldEndToEndLatencyMicros=7_000_001;
  resource.records[0].warmEndToEndLatencyMicros=3_000_001;
  const proof=await prove(runEvidence,resource);
  const record=proof.records.find(x=>x.candidateId===resource.records[0].candidateId&&x.capability===resource.records[0].capability);
  assert.equal(record.peakWorkingMemoryBytes,9_000_000_000);
  assert.equal(record.coldEndToEndLatencyMicros,7_000_001);
  assert.equal(record.warmEndToEndLatencyMicros,3_000_001);
  assert.equal(Object.hasOwn(proof,'preferredCandidateIds'),false);
  assert.equal(Object.hasOwn(proof,'selectedCandidateId'),false);
});

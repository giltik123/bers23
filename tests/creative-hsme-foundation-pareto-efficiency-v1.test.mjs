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
  HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  hsmeFoundationEfficiencyVectorDominatesV1,
  proveHsmeFoundationParetoEfficiencyV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';

const campaign=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8'));
const trust=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8'));
const fixturePlan=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json','utf8'));
const fixturePack=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json','utf8'));
const rubric=JSON.parse(await readFile('src/platform/creative/local-ai/hsme/hsme-foundation-quality-rubric.v1.json','utf8'));

const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const caps=['TEXT_TO_IMAGE','IMAGE_EDITING'];
const seeds=fixturePack.sources.outputSetContract.requiredSeeds;
const H=value=>createHash('sha256').update(value).digest('hex');
const lexical=(a,b)=>a<b?-1:a>b?1:0;

function candidateTrust(candidateId){
  const value=trust.candidates.find(x=>x.candidateId===candidateId);
  assert.ok(value);
  return value;
}
function fixtureIds(capability){
  return fixturePlan.assets.filter(x=>x.capability===capability).map(x=>x.fixtureId).sort(lexical);
}
function outputs(candidateId,capability){
  return fixtureIds(capability).flatMap(fixtureId=>seeds.map(seed=>({
    fixtureId,
    seed,
    blindId:'blind_'+H('blind|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed).slice(0,24),
    imageSha256:H('image|'+candidateId+'|'+capability+'|'+fixtureId+'|'+seed),
  }))).sort((a,b)=>lexical(a.fixtureId,b.fixtureId)||a.seed-b.seed||lexical(a.blindId,b.blindId));
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
      .sort((a,b)=>lexical(a.relativePath,b.relativePath)),
  };
}
function inventoryDigest(inventory){
  return H(JSON.stringify(inventory,null,2)+'\n');
}
function installedBytes(candidateId){
  return runtimeInventory(candidateId).artifacts.reduce((sum,x)=>sum+x.bytes,0);
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
async function makeAssessment(runEvidence){
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hashPort);
  const records=[];
  for(const run of runEvidence.runs){
    if(run.status!=='COMPLETE')continue;
    const slice=campaign.slices.find(x=>x.capability===run.capability);
    const isReference=slice.qualityReferenceCandidateIds.includes(run.candidateId);
    for(const output of run.outputs){
      for(const dimension of slice.dimensions){
        records.push({
          blindId:output.blindId,
          capability:run.capability,
          dimensionId:dimension.dimensionId,
          reviewMode:dimension.reviewMode,
          lossMicrounits:isReference?0:10_000,
          criticalFailure:false,
          evidenceSha256:H('assessment|'+output.blindId+'|'+dimension.dimensionId),
        });
      }
    }
  }
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256,
    blindedReviewRubricSha256:campaign.fixturePack.blindedReviewRubricSha256,
    aggregationPolicy:'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy:'EVEN_ARITHMETIC_MEAN_HALF_UP',
    records,
    candidateIdentityIncluded:false,
    efficiencyMetadataIncluded:false,
    postObservationThresholdMutationAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
async function makeResourceEvidence(runEvidence){
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hashPort);
  const records=runEvidence.runs.filter(x=>x.status==='COMPLETE').map(run=>({
    candidateId:run.candidateId,
    capability:run.capability,
    immutableRevision:run.immutableRevision,
    modelContentSha256:run.modelContentSha256,
    executionProfileSha256:run.executionProfileSha256,
    runtimeInventory:runtimeInventory(run.candidateId),
    hardwareProfileSha256:H('hardware|shared'),
    measurementMethodSha256:H('method|shared'),
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:2_000_000_000,
    coldEndToEndLatencyMicros:5_000_000,
    warmEndToEndLatencyMicros:4_000_000,
    acceptedOutputCostMicrousd:0,
    costKind:'PROVEN_UNMETERED_LOCAL',
    measurementEvidenceSha256:H('resource|'+run.candidateId+'|'+run.capability),
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
function blindIds(runEvidence,candidateId,capability){
  const run=runEvidence.runs.find(x=>x.candidateId===candidateId&&x.capability===capability);
  assert.ok(run);
  return new Set(run.outputs.map(x=>x.blindId));
}
function setAllLosses(assessment,runEvidence,candidateId,capability,loss){
  const ids=blindIds(runEvidence,candidateId,capability);
  let changed=0;
  for(const record of assessment.records){
    if(ids.has(record.blindId)){
      record.lossMicrounits=loss;
      changed++;
    }
  }
  assert.ok(changed>0);
}
function resourceRecord(resource,candidateId,capability){
  const record=resource.records.find(x=>x.candidateId===candidateId&&x.capability===capability);
  assert.ok(record);
  return record;
}
function setResource(record,{memory,cold,warm,cost=0}){
  record.peakWorkingMemoryBytes=memory;
  record.coldEndToEndLatencyMicros=cold;
  record.warmEndToEndLatencyMicros=warm;
  record.acceptedOutputCostMicrousd=cost;
  record.costKind=cost===0?'PROVEN_UNMETERED_LOCAL':'MEASURED_METERED';
}
async function prove(runEvidence,assessment,resource){
  return proveHsmeFoundationParetoEfficiencyV1(
    campaign,trust,fixturePlan,fixturePack,rubric,runEvidence,assessment,resource,hashPort,
  );
}
function editPairByInstalled(){
  const ids=['flux2-klein-4b-distilled-v1','flux2-klein-base-4b-v1'];
  return ids.sort((a,b)=>installedBytes(a)-installedBytes(b));
}

test('blocked SANA keeps T2I out of efficiency while editing can compare',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const proof=await prove(runEvidence,assessment,resource);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.equal(t2i.state,'QUALITY_BLOCKED');
  assert.deepEqual(t2i.vectors,[]);
  assert.equal(edit.state,'PARETO_FRONTIER_READY');
  assert.deepEqual(edit.qualityPreferredCandidateIds,[
    'flux2-klein-4b-distilled-v1',
    'flux2-klein-base-4b-v1',
  ]);
});

test('candidate that is no worse on every resource dimension and better on at least one uniquely dominates',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const [smaller,larger]=editPairByInstalled();
  setResource(resourceRecord(resource,smaller,'IMAGE_EDITING'),{memory:1_000,cold:1_000,warm:1_000,cost:1});
  setResource(resourceRecord(resource,larger,'IMAGE_EDITING'),{memory:2_000,cold:2_000,warm:2_000,cost:2});
  const proof=await prove(runEvidence,assessment,resource);
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.deepEqual(edit.paretoNondominatedCandidateIds,[smaller]);
  assert.deepEqual(edit.dominatedCandidateIds,[larger]);
  assert.equal(edit.uniqueEfficiencyDominantCandidateId,smaller);
});

test('cross-metric tradeoff remains a Pareto set instead of inventing hidden weights',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const [smaller,larger]=editPairByInstalled();
  setResource(resourceRecord(resource,smaller,'IMAGE_EDITING'),{memory:9_000,cold:9_000,warm:9_000,cost:9});
  setResource(resourceRecord(resource,larger,'IMAGE_EDITING'),{memory:1_000,cold:1_000,warm:1_000,cost:1});
  const proof=await prove(runEvidence,assessment,resource);
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.deepEqual(edit.paretoNondominatedCandidateIds,[smaller,larger].sort(lexical));
  assert.deepEqual(edit.dominatedCandidateIds,[]);
  assert.equal(Object.hasOwn(edit,'uniqueEfficiencyDominantCandidateId'),false);
});

test('exact resource-vector tie does not dominate in either direction',()=>{
  const base={
    candidateId:'a',
    mandatoryInstalledBytes:1,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:2,
    coldEndToEndLatencyMicros:3,
    warmEndToEndLatencyMicros:4,
    acceptedOutputCostMicrousd:5,
    costKind:'MEASURED_METERED',
    hardwareProfileSha256:'1'.repeat(64),
    measurementMethodSha256:'2'.repeat(64),
    measurementEvidenceSha256:'3'.repeat(64),
  };
  const other={...base,candidateId:'b'};
  assert.equal(hsmeFoundationEfficiencyVectorDominatesV1(base,other),false);
  assert.equal(hsmeFoundationEfficiencyVectorDominatesV1(other,base),false);
});

test('Pareto dominance rejects cross-domain working-memory vectors',()=>{
  const left={
    candidateId:'a',
    mandatoryInstalledBytes:1,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:2,
    coldEndToEndLatencyMicros:3,
    warmEndToEndLatencyMicros:4,
    acceptedOutputCostMicrousd:5,
    costKind:'MEASURED_METERED',
    hardwareProfileSha256:'1'.repeat(64),
    measurementMethodSha256:'2'.repeat(64),
    measurementEvidenceSha256:'3'.repeat(64),
  };
  const right={...left,candidateId:'b',workingMemoryKind:'HOST_RSS_BYTES'};
  assert.throws(
    ()=>hsmeFoundationEfficiencyVectorDominatesV1(left,right),
    error=>error?.code==='hsme_pareto_memory_domain_mismatch',
  );
});

test('Pareto dominance rejects different hardware, measurement method or cost accounting contexts',()=>{
  const base={
    candidateId:'a',
    mandatoryInstalledBytes:1,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:2,
    coldEndToEndLatencyMicros:3,
    warmEndToEndLatencyMicros:4,
    acceptedOutputCostMicrousd:5,
    costKind:'MEASURED_METERED',
    hardwareProfileSha256:'1'.repeat(64),
    measurementMethodSha256:'2'.repeat(64),
    measurementEvidenceSha256:'3'.repeat(64),
  };
  assert.throws(
    ()=>hsmeFoundationEfficiencyVectorDominatesV1(base,{...base,candidateId:'b',hardwareProfileSha256:'4'.repeat(64)}),
    error=>error?.code==='hsme_pareto_hardware_profile_mismatch',
  );
  assert.throws(
    ()=>hsmeFoundationEfficiencyVectorDominatesV1(base,{...base,candidateId:'b',measurementMethodSha256:'5'.repeat(64)}),
    error=>error?.code==='hsme_pareto_measurement_method_mismatch',
  );
  assert.throws(
    ()=>hsmeFoundationEfficiencyVectorDominatesV1(base,{...base,candidateId:'b',costKind:'PROVEN_UNMETERED_LOCAL',acceptedOutputCostMicrousd:0}),
    error=>error?.code==='hsme_pareto_cost_kind_mismatch',
  );
});

test('single resource improvement with all other dimensions equal establishes dominance',()=>{
  const left={
    candidateId:'a',
    mandatoryInstalledBytes:1,
    workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
    peakWorkingMemoryBytes:2,
    coldEndToEndLatencyMicros:3,
    warmEndToEndLatencyMicros:4,
    acceptedOutputCostMicrousd:5,
    costKind:'MEASURED_METERED',
    hardwareProfileSha256:'1'.repeat(64),
    measurementMethodSha256:'2'.repeat(64),
    measurementEvidenceSha256:'3'.repeat(64),
  };
  const right={...left,candidateId:'b',acceptedOutputCostMicrousd:6};
  assert.equal(hsmeFoundationEfficiencyVectorDominatesV1(left,right),true);
  assert.equal(hsmeFoundationEfficiencyVectorDominatesV1(right,left),false);
});

test('lower-quality candidate cannot re-enter comparison even when much smaller and faster',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const [smaller,larger]=editPairByInstalled();
  setAllLosses(assessment,runEvidence,smaller,'IMAGE_EDITING',20_000);
  setAllLosses(assessment,runEvidence,larger,'IMAGE_EDITING',5_000);
  setResource(resourceRecord(resource,smaller,'IMAGE_EDITING'),{memory:1,cold:1,warm:1,cost:1});
  setResource(resourceRecord(resource,larger,'IMAGE_EDITING'),{memory:9_000_000,cold:9_000_000,warm:9_000_000,cost:9});
  const proof=await prove(runEvidence,assessment,resource);
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.deepEqual(edit.qualityPreferredCandidateIds,[larger]);
  assert.deepEqual(edit.vectors.map(x=>x.candidateId),[larger]);
  assert.deepEqual(edit.paretoNondominatedCandidateIds,[larger]);
});

test('control and quality-reference resource evidence cannot enter selection comparison',async()=>{
  const runEvidence=makeRunEvidence({sanaComplete:true});
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const proof=await prove(runEvidence,assessment,resource);
  const compared=new Set(proof.slices.flatMap(x=>x.vectors.map(v=>v.candidateId)));
  assert.equal(compared.has('tiny-sd-control-v1'),false);
  assert.equal(compared.has('qwen-image-t2i-reference-v1'),false);
  assert.equal(compared.has('qwen-image-edit-2511-reference-v1'),false);
});

test('resource roster corruption fails before Pareto comparison',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  resource.records.pop();
  await assert.rejects(
    prove(runEvidence,assessment,resource),
    error=>error?.code==='hsme_resource_record_roster',
  );
});

test('Pareto output carries no weighted score, deployment admission or final winner authority',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const proof=await prove(runEvidence,assessment,resource);
  assert.equal(proof.policy,'QUALITY_GATED_PARETO_NO_WEIGHTS');
  assert.equal(proof.weightedAggregateScoreAllowed,false);
  assert.equal(proof.lowerQualityCandidateAdmissionAllowed,false);
  assert.equal(proof.deploymentTierAdmissionGranted,false);
  assert.equal(proof.winnerSelectionAllowed,false);
  assert.equal(proof.productionAuthorityGranted,false);
  assert.equal(Object.hasOwn(proof,'selectedCandidateId'),false);
  assert.equal(Object.hasOwn(proof,'winnerCandidateId'),false);
});

test('quality and resource proofs remain content-addressed inputs to Pareto result',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const proof=await prove(runEvidence,assessment,resource);
  assert.match(proof.qualityFrontierSha256,/^[0-9a-f]{64}$/);
  assert.match(proof.resourceEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.notEqual(proof.qualityFrontierSha256,proof.resourceEvidenceSha256);
});

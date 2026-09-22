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
import {
  HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA,
  HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
  hsmeFoundationTierBudgetPolicyV1Digest,
  proveHsmeFoundationTierQualificationV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTierQualificationV1.ts';

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
    costEvidenceSha256:H('cost-evidence|'+run.candidateId+'|'+run.capability),
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


function budgetPolicy({
  targetTier='MOBILE_DEFAULT',
  maxInstalledBytes=Number.MAX_SAFE_INTEGER,
  maxWorkingMemoryBytes=3_000_000_000,
  maxColdEndToEndLatencyMicros=10_000_000,
  maxWarmEndToEndLatencyMicros=10_000_000,
}={}){
  return {
    schemaVersion:HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
    policyId:'synthetic-'+targetTier.toLowerCase().replaceAll('_','-')+'-budget-v1',
    targetTier,
    maxInstalledBytes,
    maxWorkingMemoryBytes,
    maxColdEndToEndLatencyMicros,
    maxWarmEndToEndLatencyMicros,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
async function targetEvidence(runEvidence,policy,candidateId,capability,{
  representationKind='IDENTICAL_REFERENCE_ARTIFACTS',
  memory=1_000_000_000,
  cold=2_000_000,
  warm=1_500_000,
  targetHardwareClass=policy.targetTier==='MOBILE_DEFAULT'?'MOBILE_TARGET_DEVICE':'DESKTOP_HIGH_END_TARGET',
  budgetDigest=null,
  mutateInventory=false,
}={}){
  const run=runEvidence.runs.find(x=>x.candidateId===candidateId&&x.capability===capability);
  assert.ok(run&&run.status==='COMPLETE');
  const inventory=structuredClone(runtimeInventory(candidateId));
  let representationContentSha256=run.modelContentSha256;
  if(representationKind==='TARGET_SPECIFIC_REPRESENTATION'){
    representationContentSha256=H('target-representation|'+candidateId+'|'+capability);
    inventory.artifacts[0].contentSha256=H('target-artifact|'+candidateId+'|'+capability);
    inventory.artifacts[0].bytes+=17;
  }else if(mutateInventory){
    inventory.artifacts[0].contentSha256=H('drifted-identical-artifact|'+candidateId+'|'+capability);
  }
  const budgetPolicySha256=budgetDigest??await hsmeFoundationTierBudgetPolicyV1Digest(policy,hashPort);
  return {
    candidateId,
    capability,
    targetTier:policy.targetTier,
    sourceModelContentSha256:run.modelContentSha256,
    sourceExecutionProfileSha256:run.executionProfileSha256,
    representationKind,
    representationContentSha256,
    representationEvidenceSha256:H('representation-evidence|'+candidateId+'|'+capability),
    runtimeInventory:inventory,
    targetRuntimeProfileSha256:H('target-runtime-profile|'+candidateId+'|'+capability),
    targetHardwareClass,
    workingMemoryKind:'TARGET_PEAK_WORKING_SET_BYTES',
    peakWorkingMemoryBytes:memory,
    coldEndToEndLatencyMicros:cold,
    warmEndToEndLatencyMicros:warm,
    hardwareProfileSha256:H('target-hardware|'+candidateId+'|'+capability),
    measurementMethodSha256:H('target-method|'+candidateId+'|'+capability),
    measurementEvidenceSha256:H('target-measurement|'+candidateId+'|'+capability),
    budgetPolicySha256,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
function targetSet(records=[]){
  return {
    schemaVersion:HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA,
    records,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
async function proveTier(runEvidence,assessment,resource,policy=null,targets=null){
  return proveHsmeFoundationTierQualificationV1(
    campaign,trust,fixturePlan,fixturePack,rubric,
    runEvidence,assessment,resource,policy,targets,hashPort,
  );
}

test('CUDA reference evidence remains reference-only and cannot satisfy MOBILE_DEFAULT by itself',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  for(const record of resource.records){
    record.peakWorkingMemoryBytes=1;
    record.coldEndToEndLatencyMicros=1;
    record.warmEndToEndLatencyMicros=1;
  }
  const proof=await proveTier(runEvidence,assessment,resource,null,null);
  const t2i=proof.slices.find(x=>x.capability==='TEXT_TO_IMAGE');
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.equal(t2i.qualityState,'QUALITY_BLOCKED');
  assert.equal(edit.qualityState,'QUALITY_READY');
  assert.ok(edit.candidates.length>=1);
  assert.ok(edit.candidates.every(x=>x.targetQualificationState==='TARGET_POLICY_AND_EVIDENCE_REQUIRED'));
  assert.ok(edit.candidates.every(x=>x.referenceHardwareBackendClass.startsWith('CUDA_')));
  assert.equal(proof.cudaReferenceEvidenceMaySatisfyMobileMemoryBudget,false);
  assert.equal(proof.paretoMayGrantDeploymentTier,false);
  assert.equal(proof.reuseAdvanceAllowed,false);
  assert.equal(proof.fullStudentEscalationAllowed,false);
  assert.equal(proof.winnerSelectionAllowed,false);
  assert.equal(Object.hasOwn(proof,'selectedCandidateId'),false);
});

test('explicit mobile budget without target-device measurement remains TARGET_EVIDENCE_REQUIRED',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  const proof=await proveTier(runEvidence,assessment,resource,policy,targetSet());
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  assert.equal(edit.targetTier,'MOBILE_DEFAULT');
  assert.ok(edit.candidates.every(x=>x.targetQualificationState==='TARGET_EVIDENCE_REQUIRED'));
  assert.match(proof.budgetPolicySha256,/^[0-9a-f]{64}$/);
});

test('identical target representation may reuse exact installed bytes only after inventory identity proof',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  const candidateId='flux2-klein-4b-distilled-v1';
  const target=await targetEvidence(runEvidence,policy,candidateId,'IMAGE_EDITING');
  const proof=await proveTier(runEvidence,assessment,resource,policy,targetSet([target]));
  const edit=proof.slices.find(x=>x.capability==='IMAGE_EDITING');
  const row=edit.candidates.find(x=>x.candidateId===candidateId);
  assert.equal(row.targetQualificationState,'MOBILE_DEFAULT_EVIDENCE_READY');
  assert.equal(row.installedBytesSource,'REUSED_EXACT_REFERENCE_ARTIFACTS');
  assert.equal(row.targetRuntimeInventorySha256,row.referenceRuntimeInventorySha256);
  assert.equal(row.targetMandatoryInstalledBytes,row.referenceMandatoryInstalledBytes);
  assert.notEqual(row.targetWorkingMemoryBytes,row.referencePeakWorkingMemoryBytes);
});

test('target-specific representation uses independently measured target artifacts instead of reference installed bytes',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  const candidateId='flux2-klein-base-4b-v1';
  const target=await targetEvidence(runEvidence,policy,candidateId,'IMAGE_EDITING',{
    representationKind:'TARGET_SPECIFIC_REPRESENTATION',
  });
  const proof=await proveTier(runEvidence,assessment,resource,policy,targetSet([target]));
  const row=proof.slices.find(x=>x.capability==='IMAGE_EDITING').candidates.find(x=>x.candidateId===candidateId);
  assert.equal(row.targetQualificationState,'MOBILE_DEFAULT_EVIDENCE_READY');
  assert.equal(row.installedBytesSource,'MEASURED_TARGET_ARTIFACTS');
  assert.notEqual(row.targetRuntimeInventorySha256,row.referenceRuntimeInventorySha256);
});

test('identical representation with altered target artifact inventory fails closed',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  const target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING',{mutateInventory:true});
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>error?.code==='hsme_tier_inventory_identity',
  );
});

test('mobile target evidence cannot use desktop hardware class or CUDA memory semantics',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  const target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING',{
    targetHardwareClass:'DESKTOP_HIGH_END_TARGET',
  });
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>error?.code==='hsme_tier_target_hardware_class',
  );
  target.targetHardwareClass='MOBILE_TARGET_DEVICE';
  target.workingMemoryKind='CUDA_PEAK_RESERVED_BYTES';
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>error?.code==='hsme_tier_literal',
  );
});

test('target evidence must bind exact budget policy digest and canonical source model/profile',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  let target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING',{budgetDigest:'0'.repeat(64)});
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>error?.code==='hsme_tier_budget_digest',
  );
  target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING');
  target.sourceExecutionProfileSha256='1'.repeat(64);
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>error?.code==='hsme_tier_target_source_identity',
  );
});

test('target measurements over any explicit mobile budget remain evidence but do not qualify',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy({maxInstalledBytes:1,maxWorkingMemoryBytes:1,maxColdEndToEndLatencyMicros:1,maxWarmEndToEndLatencyMicros:1});
  const target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING');
  const proof=await proveTier(runEvidence,assessment,resource,policy,targetSet([target]));
  const row=proof.slices.find(x=>x.capability==='IMAGE_EDITING').candidates.find(x=>x.candidateId==='flux2-klein-4b-distilled-v1');
  assert.equal(row.targetQualificationState,'TARGET_BUDGET_EXCEEDED');
  assert.match(row.targetEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(proof.reuseAdvanceAllowed,false);
});

test('lower-quality candidate target evidence cannot bypass the frozen quality frontier',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  setAllLosses(assessment,runEvidence,'flux2-klein-4b-distilled-v1','IMAGE_EDITING',20_000);
  setAllLosses(assessment,runEvidence,'flux2-klein-base-4b-v1','IMAGE_EDITING',5_000);
  const policy=budgetPolicy();
  const target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING');
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>error?.code==='hsme_tier_target_not_quality_preferred',
  );
});

test('blocked T2I slice cannot accept target evidence while SANA parity remains unresolved',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy();
  const target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','TEXT_TO_IMAGE');
  await assert.rejects(
    proveTier(runEvidence,assessment,resource,policy,targetSet([target])),
    error=>['hsme_tier_target_not_quality_preferred','hsme_tier_target_quality_blocked'].includes(error?.code),
  );
});

test('desktop qualification is separately typed and still grants no production or reuse-decision authority',async()=>{
  const runEvidence=makeRunEvidence();
  const assessment=await makeAssessment(runEvidence);
  const resource=await makeResourceEvidence(runEvidence);
  const policy=budgetPolicy({targetTier:'DESKTOP_HIGH_END'});
  const target=await targetEvidence(runEvidence,policy,'flux2-klein-4b-distilled-v1','IMAGE_EDITING');
  const proof=await proveTier(runEvidence,assessment,resource,policy,targetSet([target]));
  const row=proof.slices.find(x=>x.capability==='IMAGE_EDITING').candidates.find(x=>x.candidateId==='flux2-klein-4b-distilled-v1');
  assert.equal(row.targetQualificationState,'DESKTOP_HIGH_END_EVIDENCE_READY');
  assert.equal(proof.selectedCandidateIdAllowed,false);
  assert.equal(proof.productionAuthorityGranted,false);
  assert.equal(proof.providerAuthorityGranted,false);
  assert.equal(proof.trainingOrDistillationAllowed,false);
});

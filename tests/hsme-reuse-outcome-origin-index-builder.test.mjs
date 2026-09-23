import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
  hsmeFoundationQualityFrontierV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFrontierV1.ts';
import {
  HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';
import {
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblyV1.ts';
import {
  buildHsmeReuseOutcomeOriginIndexCandidate,
  canonicalFileBytes,
  hashPort,
  sha256Bytes,
} from '../scripts/build-hsme-reuse-outcome-origin-index.mjs';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const H=value=>createHash('sha256').update(value).digest('hex');
const DIRECT='flux2-klein-4b-distilled-v1';
const ADAPT='flux2-klein-base-4b-v1';

function sourceFor(id){
  const value=campaign.candidates.find(candidate=>candidate.candidateId===id);
  assert.ok(value);
  return {
    sourceRoot:value.sourceRoot,
    immutableRevision:value.immutableRevision,
    contentSha256:value.modelContentSha256,
  };
}

function unknownRuntime(){
  return {
    backboneBytes:'UNKNOWN',
    conditionerBytes:'UNKNOWN',
    vaeBytes:'UNKNOWN',
    adapterBytes:'UNKNOWN',
    otherRequiredBytes:'UNKNOWN',
    mandatoryInstalledBytes:'UNKNOWN',
    workingMemoryBytes:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
  };
}

function zeroTraining(){
  return {
    mode:'ZERO_TRAINING',
    trainableParameters:0,
    frozenParameters:'UNKNOWN',
    trainingExamples:0,
    gpuSeconds:0,
    trainingCostMicrousd:0,
    evidenceSha256:'UNKNOWN',
  };
}

function loraTraining(){
  return {
    mode:'LORA',
    trainableParameters:10,
    frozenParameters:1000,
    trainingExamples:40,
    gpuSeconds:120,
    trainingCostMicrousd:2500,
    evidenceSha256:'UNKNOWN',
  };
}

function sourceCandidate(id,strategy){
  return {
    candidateId:id,
    strategy,
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:sourceFor(id),
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:strategy==='DIRECT_FOUNDATION'?zeroTraining():loraTraining(),
    rejectionReasons:[],
  };
}

function decision(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['origin-index builder freeze candidate only'],
    candidates:[
      {
        candidateId:'control-origin-builder',
        strategy:'CONTROL_BASELINE',
        targetTier:'REFERENCE',
        evidenceState:'UNRESOLVED',
        source:{
          sourceRoot:'bers/control-origin-builder',
          immutableRevision:'a'.repeat(40),
          contentSha256:H('control-origin-builder-source'),
        },
        licenseConclusion:'REVIEW_REQUIRED',
        licenseEvidenceSha256:'UNKNOWN',
        quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
        runtime:unknownRuntime(),
        training:zeroTraining(),
        rejectionReasons:[],
      },
      sourceCandidate(DIRECT,'DIRECT_FOUNDATION'),
      sourceCandidate(ADAPT,'FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function authorityFalse(){
  return {
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

function frontier(){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
    campaignId:campaign.campaignId,
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    qualityFinalizationSha256:H('builder-quality-finalization'),
    slices:[{sliceId:'freeze-candidate-envelope'}],
    qualityOrderingFrozen:true,
    efficiencyMayOnlyUseQualityPreferredSet:true,
    ...authorityFalse(),
  };
}

async function pareto(frontierValue){
  const frontierSha=await hsmeFoundationQualityFrontierV1Digest(
    frontierValue,
    hashPort,
  );
  return {
    schemaVersion:HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
    campaignId:campaign.campaignId,
    qualityFrontierSha256:frontierSha,
    resourceEvidenceSha256:H('builder-resource-evidence'),
    policy:'QUALITY_GATED_PARETO_NO_WEIGHTS',
    dimensions:[
      'mandatoryInstalledBytes',
      'peakWorkingMemoryBytes',
      'coldEndToEndLatencyMicros',
      'warmEndToEndLatencyMicros',
      'acceptedOutputCostMicrousd',
    ],
    direction:'LOWER_IS_BETTER',
    slices:[{sliceId:'freeze-candidate-envelope'}],
    weightedAggregateScoreAllowed:false,
    lowerQualityCandidateAdmissionAllowed:false,
    deploymentTierAdmissionGranted:false,
    ...authorityFalse(),
  };
}

function assembly(candidateId,seed){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId,
    state:'CANDIDATE_EVIDENCE_INCOMPLETE',
    candidateEvidenceSetSha256:H('assembly-set-'+seed),
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
    candidateSelectionAllowed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
  };
}

function loaded(value,{suffix=''}={}){
  const bytes=Buffer.concat([
    canonicalFileBytes(value),
    Buffer.from(suffix,'utf8'),
  ]);
  return Object.freeze({
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

async function fixture({assemblyOrder=[DIRECT,ADAPT]}={}){
  const sourceDecision=loaded(decision());
  const campaignLoaded=loaded(campaign);
  const frontierValue=frontier();
  const paretoValue=await pareto(frontierValue);
  const assemblyMap=new Map([
    [DIRECT,loaded(assembly(DIRECT,'direct'))],
    [ADAPT,loaded(assembly(ADAPT,'adapt'))],
  ]);
  return {
    sourceDecision,
    campaign:campaignLoaded,
    assemblies:assemblyOrder.map(id=>assemblyMap.get(id)),
    frontier:loaded(frontierValue),
    pareto:loaded(paretoValue),
  };
}

test('same exact inputs produce byte-identical FREEZE_CANDIDATE index and sidecar',async()=>{
  const input=await fixture();
  const first=await buildHsmeReuseOutcomeOriginIndexCandidate(input);
  const second=await buildHsmeReuseOutcomeOriginIndexCandidate(input);

  assert.deepEqual(first.files.originIndex,second.files.originIndex);
  assert.deepEqual(first.files.digestSidecar,second.files.digestSidecar);
  assert.equal(first.digestSidecar.trustState,'FREEZE_CANDIDATE');
  assert.equal(first.digestSidecar.externalPinRequired,true);
  assert.equal(first.digestSidecar.finalizationAllowed,false);
  assert.equal(first.digestSidecar.handoffAllowed,false);
  assert.match(first.digestSidecar.originIndexSha256,/^[0-9a-f]{64}$/);
  assert.match(first.digestSidecar.originIndexFileSha256,/^[0-9a-f]{64}$/);
});

test('assembly argument order does not change canonical index bytes',async()=>{
  const left=await buildHsmeReuseOutcomeOriginIndexCandidate(
    await fixture({assemblyOrder:[DIRECT,ADAPT]}),
  );
  const right=await buildHsmeReuseOutcomeOriginIndexCandidate(
    await fixture({assemblyOrder:[ADAPT,DIRECT]}),
  );
  assert.deepEqual(left.files.originIndex,right.files.originIndex);
  assert.equal(
    left.digestSidecar.originIndexSha256,
    right.digestSidecar.originIndexSha256,
  );
});

test('one-byte raw input drift changes indexed raw SHA and origin-index digest',async()=>{
  const base=await fixture();
  const first=await buildHsmeReuseOutcomeOriginIndexCandidate(base);
  const changed={
    ...base,
    frontier:loaded(base.frontier.value,{suffix:'\n'}),
  };
  const second=await buildHsmeReuseOutcomeOriginIndexCandidate(changed);
  assert.notEqual(
    first.originIndex.qualityFrontier.fileSha256,
    second.originIndex.qualityFrontier.fileSha256,
  );
  assert.notEqual(
    first.digestSidecar.originIndexSha256,
    second.digestSidecar.originIndexSha256,
  );
});

test('duplicate candidate assembly id fails closed',async()=>{
  const input=await fixture({assemblyOrder:[DIRECT,DIRECT]});
  await assert.rejects(
    ()=>buildHsmeReuseOutcomeOriginIndexCandidate(input),
    error=>error.code==='hsme_reuse_origin_builder_assembly_duplicate',
  );
});

test('Pareto must bind exact canonical quality frontier digest',async()=>{
  const input=await fixture();
  const changed=structuredClone(input.pareto.value);
  changed.qualityFrontierSha256=H('forged-frontier-binding');
  await assert.rejects(
    ()=>buildHsmeReuseOutcomeOriginIndexCandidate({
      ...input,
      pareto:loaded(changed),
    }),
    error=>error.code==='hsme_reuse_origin_builder_pareto_frontier_binding',
  );
});

test('authority widening in evidence envelope fails closed',async()=>{
  const input=await fixture();
  const changed=structuredClone(input.frontier.value);
  changed.productionAuthorityGranted=true;
  await assert.rejects(
    ()=>buildHsmeReuseOutcomeOriginIndexCandidate({
      ...input,
      frontier:loaded(changed),
    }),
    error=>error.code==='hsme_reuse_origin_builder_authority_widening',
  );
});

test('builder output never grants execution, handoff, install or production authority',async()=>{
  const result=await buildHsmeReuseOutcomeOriginIndexCandidate(await fixture());
  for(const field of [
    'finalizationAllowed',
    'handoffAllowed',
    'trainingRunStartAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
  ]){
    assert.equal(result.digestSidecar[field],false,field);
  }
});

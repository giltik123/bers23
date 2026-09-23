import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  hsmeFoundationReuseDecisionV1Digest,
  mayEscalateToFullHsmeStudentDistillationV1,
  normalizeHsmeFoundationReuseCandidateV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';
import {
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPendingReuseRuntimeApplicationV1.ts';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
  hsmeFoundationQualityFrontierV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFrontierV1.ts';
import {
  HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
  hsmeFoundationParetoEfficiencyV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';
import {
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblyV1.ts';
import {
  finalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionFinalizationV1.ts';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8',
));
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const DIRECT='flux2-klein-4b-distilled-v1';
const ADAPT='flux2-klein-base-4b-v1';
const SANA='sana-sprint-0.6b-split-v1';
const GLOBAL=['IMAGE_EDITING','TEXT_TO_IMAGE'];
const clone=value=>structuredClone(value);

function sourceFor(id){
  const c=campaign.candidates.find(value=>value.candidateId===id);
  assert.ok(c,'campaign source required for '+id);
  return {
    sourceRoot:c.sourceRoot,
    immutableRevision:c.immutableRevision,
    contentSha256:c.modelContentSha256,
  };
}
function unknownRuntime(){
  return {
    backboneBytes:'UNKNOWN',conditionerBytes:'UNKNOWN',vaeBytes:'UNKNOWN',adapterBytes:'UNKNOWN',
    otherRequiredBytes:'UNKNOWN',mandatoryInstalledBytes:'UNKNOWN',
    workingMemoryBytes:'UNKNOWN',evidenceSha256:'UNKNOWN',
  };
}
function zeroTraining(evidenceSha256='UNKNOWN'){
  return {
    mode:'ZERO_TRAINING',trainableParameters:0,frozenParameters:'UNKNOWN',
    trainingExamples:0,gpuSeconds:0,trainingCostMicrousd:0,evidenceSha256,
  };
}
function loraTraining(evidenceSha256='UNKNOWN'){
  return {
    mode:'LORA',trainableParameters:10,frozenParameters:1000,
    trainingExamples:40,gpuSeconds:120,trainingCostMicrousd:2500,evidenceSha256,
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
function control(){
  return {
    candidateId:'control-finalization',
    strategy:'CONTROL_BASELINE',
    targetTier:'REFERENCE',
    evidenceState:'UNRESOLVED',
    source:{sourceRoot:'bers/control-finalization',immutableRevision:'a'.repeat(40),contentSha256:H('control-source')},
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:zeroTraining(),
    rejectionReasons:[],
  };
}
function sourceDecision(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['atomic decision finalization remains evidence-gated'],
    candidates:[
      control(),
      sourceCandidate(DIRECT,'DIRECT_FOUNDATION'),
      sourceCandidate(ADAPT,'FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function dims(capability){
  const slice=campaign.slices.find(value=>value.capability===capability);
  return slice.dimensions.map(value=>value.dimensionId);
}
function selectionRoster(capability){
  return campaign.slices.find(value=>value.capability===capability).selectionCandidateIds;
}
function lossVector(capability,id,preferred){
  const n=dims(capability).length;
  const base=preferred.includes(id)?1:100;
  return Array.from({length:n},(_,i)=>base+i);
}
function qualityFrontier({
  editingPreferred=[DIRECT],
  t2iPreferred=[DIRECT],
  editingState='FULL_QUALITY_FRONTIER',
  t2iState='FULL_QUALITY_FRONTIER',
}={}){
  const spec=[
    ['IMAGE_EDITING',editingPreferred,editingState],
    ['TEXT_TO_IMAGE',t2iPreferred,t2iState],
  ];
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
    campaignId:campaign.campaignId,
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    qualityFinalizationSha256:H('finalizer-quality-finalization'),
    slices:spec.map(([capability,preferred,state])=>{
      const slice=campaign.slices.find(value=>value.capability===capability);
      const ready=state==='FULL_QUALITY_FRONTIER';
      return {
        sliceId:slice.sliceId,
        capability,
        state,
        dimensionPriority:dims(capability),
        candidates:selectionRoster(capability).map(id=>({
          candidateId:id,
          qualityState:ready?'QUALITY_FLOOR_PASS':'BLOCKED_PARITY_PENDING',
          qualityLossVectorMicrounits:ready?lossVector(capability,id,preferred):'UNRESOLVED',
        })).sort((a,b)=>a.candidateId.localeCompare(b.candidateId)),
        qualityPreferredCandidateIds:ready?[...preferred].sort():[],
        efficiencyCandidateIds:ready?[...preferred].sort():[],
        efficiencyComparisonAllowed:ready,
      };
    }).sort((a,b)=>a.sliceId.localeCompare(b.sliceId)),
    qualityOrderingFrozen:true,
    efficiencyMayOnlyUseQualityPreferredSet:true,
    productionAuthorityGranted:false,providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
}
function pareto(frontier,{
  editingNondominated,
  t2iNondominated,
}={}){
  const byCap={
    IMAGE_EDITING:editingNondominated,
    TEXT_TO_IMAGE:t2iNondominated,
  };
  return {
    schemaVersion:HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
    campaignId:campaign.campaignId,
    qualityFrontierSha256:'PLACEHOLDER',
    resourceEvidenceSha256:H('finalizer-resource-evidence'),
    policy:'QUALITY_GATED_PARETO_NO_WEIGHTS',
    dimensions:[
      'mandatoryInstalledBytes','peakWorkingMemoryBytes',
      'coldEndToEndLatencyMicros','warmEndToEndLatencyMicros','acceptedOutputCostMicrousd',
    ],
    direction:'LOWER_IS_BETTER',
    slices:frontier.slices.map(slice=>{
      if(slice.state!=='FULL_QUALITY_FRONTIER'){
        return {
          sliceId:slice.sliceId,capability:slice.capability,state:'QUALITY_BLOCKED',
          qualityPreferredCandidateIds:[...slice.qualityPreferredCandidateIds],
          vectors:[],paretoNondominatedCandidateIds:[],dominatedCandidateIds:[],
        };
      }
      const preferred=[...slice.qualityPreferredCandidateIds].sort();
      const nondominated=[...(byCap[slice.capability]??preferred)].sort();
      const dominated=preferred.filter(id=>!nondominated.includes(id)).sort();
      const vectors=preferred.map((id,index)=>({
        candidateId:id,
        mandatoryInstalledBytes:100+index,
        workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
        peakWorkingMemoryBytes:200+index,
        coldEndToEndLatencyMicros:300+index,
        warmEndToEndLatencyMicros:250+index,
        acceptedOutputCostMicrousd:10+index,
        costKind:'PROVEN_UNMETERED_LOCAL',
        hardwareProfileSha256:H('shared-reference-hardware'),
        measurementMethodSha256:H('shared-reference-method'),
        measurementEvidenceSha256:H(slice.capability+'-'+id+'-resource'),
      }));
      return {
        sliceId:slice.sliceId,
        capability:slice.capability,
        state:'PARETO_FRONTIER_READY',
        qualityPreferredCandidateIds:preferred,
        vectors,
        paretoNondominatedCandidateIds:nondominated,
        dominatedCandidateIds:dominated,
        ...(nondominated.length===1?{uniqueEfficiencyDominantCandidateId:nondominated[0]}:{}),
      };
    }).sort((a,b)=>a.sliceId.localeCompare(b.sliceId)),
    weightedAggregateScoreAllowed:false,
    lowerQualityCandidateAdmissionAllowed:false,
    deploymentTierAdmissionGranted:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
}

function runtime({installed=500_000_000,working=500_000_000,evidence=H('assembled-runtime')}={}){
  return {
    backboneBytes:400_000_000,
    conditionerBytes:40_000_000,
    vaeBytes:40_000_000,
    adapterBytes:10_000_000,
    otherRequiredBytes:installed-490_000_000,
    mandatoryInstalledBytes:installed,
    workingMemoryBytes:working,
    evidenceSha256:evidence,
  };
}
function requiredCapabilities(id){
  const candidate=campaign.candidates.find(value=>value.candidateId===id);
  return campaign.slices
    .filter(slice=>
      campaign.requiredCapabilities.includes(slice.capability)
      &&slice.selectionCandidateIds.includes(id)
      &&candidate.capabilities.includes(slice.capability)
    )
    .map(slice=>slice.capability)
    .sort();
}
function authorityFalse(){
  return {
    decisionMutationAllowed:false,candidateSelectionAllowed:false,selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,fullStudentEscalationAllowed:false,modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
}
async function assembly(rawDecision,id,outcome='QUALIFIED',{
  installed=500_000_000,
  working=500_000_000,
  required=requiredCapabilities(id),
}={}){
  const source=rawDecision.candidates.find(value=>value.candidateId===id);
  assert.ok(source);
  const campaignCandidate=campaign.candidates.find(value=>value.candidateId===id);
  const sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(rawDecision,hashPort);
  const campaignDigest=await hsmeFoundationBenchmarkCampaignV1Digest(campaign,hashPort);
  const sourceCandidateSha256=H(
    HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN+JSON.stringify(
      normalizeHsmeFoundationReuseCandidateV1(source),
    ),
  );
  const qualified=outcome==='QUALIFIED';
  const candidate=normalizeHsmeFoundationReuseCandidateV1({
    ...source,
    evidenceState:qualified?'QUALIFIED':'REJECTED',
    licenseConclusion:qualified?'COMMERCIAL_ADMISSIBLE':'REVIEW_REQUIRED',
    licenseEvidenceSha256:qualified?campaignCandidate.rightsEvidenceSha256:'UNKNOWN',
    quality:qualified?{status:'PASS',evidenceSha256:H(id+'-quality-aggregate')}:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:runtime({
      installed,
      working,
      evidence:H(id+'-'+outcome+'-runtime-aggregate'),
    }),
    training:qualified
      ?{
        ...source.training,
        evidenceSha256:H(id+'-'+outcome+'-training-aggregate'),
      }
      :source.training,
    rejectionReasons:qualified?[]:['MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED'],
  });
  const assembledCandidateSha256=H(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN+JSON.stringify(candidate),
  );
  const proofEvidenceRefs=qualified
    ?required.map(capability=>({
      kind:'QUALIFICATION',
      capability,
      evidenceSetSha256:H(id+'-'+capability+'-qualification-proof'),
    })).sort((a,b)=>a.capability.localeCompare(b.capability)||a.kind.localeCompare(b.kind))
    :[{
      kind:'REJECTION',
      capability:required[0]??'IMAGE_EDITING',
      evidenceSetSha256:H(id+'-rejection-proof'),
    }];
  const state=qualified?'CANDIDATE_EVIDENCE_QUALIFIED':'CANDIDATE_EVIDENCE_REJECTED';
  const payload={
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    outcome,
    candidateId:id,
    campaignDigest,
    sourceDecisionSha256,
    sourceCandidateSha256,
    requiredCapabilities:required,
    proofRefs:proofEvidenceRefs,
    assembledCandidateSha256,
    decisionMutationAllowed:false,candidateSelectionAllowed:false,reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  const candidateEvidenceSetSha256=H(
    HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN+JSON.stringify(payload),
  );
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId:id,state,blockers:[],
    campaignDigest,sourceDecisionSha256,sourceCandidateSha256,
    requiredCapabilities:required,
    coveredQualificationCapabilities:qualified?[...required]:[],
    coveredRejectionCapabilities:qualified?[]:[required[0]??'IMAGE_EDITING'],
    missingCapabilities:qualified?[]:required.slice(1),
    proofEvidenceRefs,
    assembledCandidateSha256,candidateEvidenceSetSha256,candidate,
    ...authorityFalse(),
  };
}
function origin({assembly=true,frontier=true,pareto=true}={}){
  return {
    async verifyCandidateAssembly(){return assembly;},
    async verifyQualityFrontier(){return frontier;},
    async verifyParetoEfficiency(){return pareto;},
  };
}
async function evidence({
  editingPreferred=[DIRECT],
  t2iPreferred=[DIRECT],
  editingNondominated,
  t2iNondominated,
  editingState='FULL_QUALITY_FRONTIER',
  t2iState='FULL_QUALITY_FRONTIER',
}={}){
  const f=qualityFrontier({editingPreferred,t2iPreferred,editingState,t2iState});
  const fsha=await hsmeFoundationQualityFrontierV1Digest(f,hashPort);
  const p=pareto(f,{editingNondominated,t2iNondominated});
  p.qualityFrontierSha256=fsha;
  const psha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  return {frontier:f,frontierSha:fsha,pareto:p,paretoSha:psha};
}
async function finalize(raw,assemblies,e,verifier=origin()){
  return finalizeHsmeFoundationReuseDecisionV1(
    raw,campaign,assemblies,e.frontier,e.frontierSha,e.pareto,e.paretoSha,verifier,hashPort,
  );
}

test('quality-first singleton across all required capabilities produces DIRECT_FOUNDATION_ADVANCE',async()=>{
  const raw=sourceDecision();
  const a=await assembly(raw,DIRECT,'QUALIFIED');
  const e=await evidence();
  const before=clone(raw);
  const result=await finalize(raw,[a],e);
  assert.equal(result.state,'DIRECT_FOUNDATION_ADVANCE_READY');
  assert.equal(result.selectedCandidateId,DIRECT);
  assert.equal(result.reuseAdvanceAllowed,true);
  assert.equal(result.fullStudentEscalationAllowed,false);
  assert.equal(result.finalDecision.decisionStatus,'DIRECT_FOUNDATION_ADVANCE');
  assert.equal(result.finalDecision.selectedCandidateId,DIRECT);
  assert.equal(result.finalDecision.candidates.find(x=>x.candidateId===DIRECT).evidenceState,'QUALIFIED');
  assert.match(result.finalDecisionSha256,/^[0-9a-f]{64}$/);
  assert.match(result.finalizationEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(raw,before);
});

test('bounded adaptation may advance only when it is the common quality/Pareto candidate',async()=>{
  const raw=sourceDecision();
  const a=await assembly(raw,ADAPT,'QUALIFIED');
  const e=await evidence({
    editingPreferred:[ADAPT],
    t2iPreferred:[ADAPT],
  });
  const result=await finalize(raw,[a],e);
  assert.equal(result.state,'BOUNDED_ADAPTATION_ADVANCE_READY');
  assert.equal(result.selectedCandidateId,ADAPT);
  assert.equal(result.finalDecision.decisionStatus,'BOUNDED_ADAPTATION_ADVANCE');
  const selected=result.finalDecision.candidates.find(x=>x.candidateId===ADAPT);
  assert.equal(selected.training.mode,'LORA');
  assert.ok(selected.training.trainableParameters<selected.training.frozenParameters);
});

test('worse-quality qualified candidate cannot advance merely because it has an assembly',async()=>{
  const raw=sourceDecision();
  const worse=await assembly(raw,ADAPT,'QUALIFIED');
  const e=await evidence({
    editingPreferred:[DIRECT],
    t2iPreferred:[DIRECT],
  });
  const result=await finalize(raw,[worse],e);
  assert.equal(result.state,'DECISION_EVIDENCE_INCOMPLETE');
  assert.equal(result.selectedCandidateId,undefined);
  assert.equal(result.reuseAdvanceAllowed,false);
});

test('exact quality tie may be resolved by Pareto only inside the preferred tie set',async()=>{
  const raw=sourceDecision();
  const direct=await assembly(raw,DIRECT,'QUALIFIED');
  const adapt=await assembly(raw,ADAPT,'QUALIFIED');
  const e=await evidence({
    editingPreferred:[DIRECT,ADAPT],
    t2iPreferred:[DIRECT,ADAPT],
    editingNondominated:[DIRECT],
    t2iNondominated:[DIRECT],
  });
  const result=await finalize(raw,[adapt,direct],e);
  assert.equal(result.state,'DIRECT_FOUNDATION_ADVANCE_READY');
  assert.equal(result.selectedCandidateId,DIRECT);
});

test('Pareto nondominated tie remains ambiguous without a weighted tiebreak',async()=>{
  const raw=sourceDecision();
  const direct=await assembly(raw,DIRECT,'QUALIFIED');
  const adapt=await assembly(raw,ADAPT,'QUALIFIED');
  const e=await evidence({
    editingPreferred:[DIRECT,ADAPT],
    t2iPreferred:[DIRECT,ADAPT],
    editingNondominated:[DIRECT,ADAPT],
    t2iNondominated:[DIRECT,ADAPT],
  });
  const result=await finalize(raw,[direct,adapt],e);
  assert.equal(result.state,'SELECTION_AMBIGUOUS');
  assert.deepEqual(result.eligibleCandidateIds,[ADAPT,DIRECT].sort());
  assert.equal(result.finalDecision,null);
});

test('different per-capability winners cannot be collapsed into an arbitrary global winner',async()=>{
  const raw=sourceDecision();
  const direct=await assembly(raw,DIRECT,'QUALIFIED');
  const adapt=await assembly(raw,ADAPT,'QUALIFIED');
  const e=await evidence({
    editingPreferred:[DIRECT],
    t2iPreferred:[ADAPT],
  });
  const result=await finalize(raw,[direct,adapt],e);
  assert.equal(result.state,'SELECTION_AMBIGUOUS');
  assert.deepEqual(result.eligibleCandidateIds,[]);
  assert.equal(result.finalDecision,null);
});

test('partial global capability assembly cannot advance',async()=>{
  const raw=sourceDecision();
  const partial=await assembly(raw,DIRECT,'QUALIFIED',{required:['IMAGE_EDITING']});
  const e=await evidence();
  const result=await finalize(raw,[partial],e);
  assert.equal(result.state,'DECISION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_ASSEMBLY_CAPABILITY_SCOPE_DRIFT:'+DIRECT));
});

test('all non-control reuse candidates hard-rejected atomically proves REUSE_PATH_INSUFFICIENT',async()=>{
  const raw=sourceDecision();
  const direct=await assembly(raw,DIRECT,'REJECTED',{working:1_200_000_000});
  const adapt=await assembly(raw,ADAPT,'REJECTED',{working:1_300_000_000});
  const e=await evidence({
    editingState:'PARTIAL_BLOCKED',
    t2iState:'PARTIAL_BLOCKED',
  });
  const result=await finalize(raw,[direct,adapt],e);
  assert.equal(result.state,'REUSE_PATH_INSUFFICIENT_READY');
  assert.equal(result.reuseAdvanceAllowed,false);
  assert.equal(result.fullStudentEscalationAllowed,true);
  assert.equal(result.finalDecision.decisionStatus,'REUSE_PATH_INSUFFICIENT');
  assert.equal(result.finalDecision.selectedCandidateId,undefined);
  assert.equal(mayEscalateToFullHsmeStudentDistillationV1(result.finalDecision),true);
  assert.ok(result.finalDecision.candidates.filter(x=>x.strategy!=='CONTROL_BASELINE')
    .every(x=>x.evidenceState==='REJECTED'));
});

test('one missing hard rejection blocks full-student escalation',async()=>{
  const raw=sourceDecision();
  const direct=await assembly(raw,DIRECT,'REJECTED',{working:1_200_000_000});
  const e=await evidence();
  const result=await finalize(raw,[direct],e);
  assert.notEqual(result.state,'REUSE_PATH_INSUFFICIENT_READY');
  assert.equal(result.fullStudentEscalationAllowed,false);
});

test('forged assembly digest and unverified origin fail closed',async()=>{
  const raw=sourceDecision();
  const a=await assembly(raw,DIRECT,'QUALIFIED');
  const e=await evidence();

  const forged={...a,assembledCandidateSha256:H('forged-candidate')};
  let result=await finalize(raw,[forged],e);
  assert.equal(result.state,'DECISION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_ASSEMBLED_CANDIDATE_HASH_MISMATCH:'+DIRECT));

  result=await finalize(raw,[a],e,origin({assembly:false}));
  assert.equal(result.state,'DECISION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_ASSEMBLY_ORIGIN_UNVERIFIED:'+DIRECT));
});

test('quality/Pareto digest or origin drift fails before selection',async()=>{
  const raw=sourceDecision();
  const a=await assembly(raw,DIRECT,'QUALIFIED');
  const e=await evidence();

  let result=await finalizeHsmeFoundationReuseDecisionV1(
    raw,campaign,[a],e.frontier,H('wrong-frontier'),e.pareto,e.paretoSha,origin(),hashPort,
  );
  assert.equal(result.state,'DECISION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_QUALITY_FRONTIER_DIGEST_DRIFT'));

  result=await finalize(raw,[a],e,origin({pareto:false}));
  assert.equal(result.state,'DECISION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_PARETO_ORIGIN_UNVERIFIED'));
});

test('frontier roster and frozen dimension priority cannot drift from campaign',async()=>{
  const raw=sourceDecision();
  const a=await assembly(raw,DIRECT,'QUALIFIED');
  const e=await evidence();
  const changed=clone(e.frontier);
  const edit=changed.slices.find(x=>x.capability==='IMAGE_EDITING');
  edit.dimensionPriority=[...edit.dimensionPriority].reverse();
  const changedSha=await hsmeFoundationQualityFrontierV1Digest(changed,hashPort);
  const changedPareto=clone(e.pareto);
  changedPareto.qualityFrontierSha256=changedSha;
  const changedParetoSha=await hsmeFoundationParetoEfficiencyV1Digest(changedPareto,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    raw,campaign,[a],changed,changedSha,changedPareto,changedParetoSha,origin(),hashPort,
  );
  assert.equal(result.state,'DECISION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_QUALITY_DIMENSION_PRIORITY_DRIFT:IMAGE_EDITING'));
});

test('finalizer never grants production/provider/Billing/Project/Artifact/AEE/fleet authority',async()=>{
  const raw=sourceDecision();
  const a=await assembly(raw,DIRECT,'QUALIFIED');
  const e=await evidence();
  const result=await finalize(raw,[a],e);
  for(const field of [
    'modelFleetPromotionAllowed','installOrDownloadAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed','winnerSelectionAllowed',
  ]) assert.equal(result[field],false,field);
});

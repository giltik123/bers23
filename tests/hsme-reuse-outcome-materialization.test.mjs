import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  hsmeFoundationReuseDecisionV1Digest,
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
  HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
  HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN,
  canonicalFileBytes,
  domainDigest,
  hashPort,
  materializeHsmeReuseOutcomeEvidence,
  normalizeOriginIndex,
  sha256Bytes,
} from '../scripts/materialize-hsme-reuse-outcome-evidence.mjs';

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

function sourceDecision(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['materialization fixture stays evidence gated'],
    candidates:[
      {
        candidateId:'control-materialization',
        strategy:'CONTROL_BASELINE',
        targetTier:'REFERENCE',
        evidenceState:'UNRESOLVED',
        source:{
          sourceRoot:'bers/control-materialization',
          immutableRevision:'a'.repeat(40),
          contentSha256:H('control-materialization-source'),
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

function dimensions(capability){
  return campaign.slices.find(value=>value.capability===capability)
    .dimensions.map(value=>value.dimensionId);
}

function selectionRoster(capability){
  return campaign.slices.find(value=>value.capability===capability)
    .selectionCandidateIds;
}

function qualityFrontier(preferred=DIRECT){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
    campaignId:campaign.campaignId,
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    qualityFinalizationSha256:H('materialization-quality-finalization'),
    slices:campaign.slices.map(slice=>{
      const capability=slice.capability;
      const preferredIds=slice.selectionCandidateIds.includes(preferred)
        ?[preferred]
        :[...slice.selectionCandidateIds].slice(0,1);
      return {
        sliceId:slice.sliceId,
        capability,
        state:'FULL_QUALITY_FRONTIER',
        dimensionPriority:dimensions(capability),
        candidates:selectionRoster(capability).map((id,index)=>({
          candidateId:id,
          qualityState:'QUALITY_FLOOR_PASS',
          qualityLossVectorMicrounits:dimensions(capability).map(
            (_,dimensionIndex)=>id===preferredIds[0]
              ?1+dimensionIndex
              :100+index+dimensionIndex,
          ),
        })).sort((a,b)=>a.candidateId.localeCompare(b.candidateId)),
        qualityPreferredCandidateIds:[...preferredIds].sort(),
        efficiencyCandidateIds:[...preferredIds].sort(),
        efficiencyComparisonAllowed:true,
      };
    }).sort((a,b)=>a.sliceId.localeCompare(b.sliceId)),
    qualityOrderingFrozen:true,
    efficiencyMayOnlyUseQualityPreferredSet:true,
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

function pareto(frontier){
  return {
    schemaVersion:HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
    campaignId:campaign.campaignId,
    qualityFrontierSha256:'PLACEHOLDER',
    resourceEvidenceSha256:H('materialization-resource-evidence'),
    policy:'QUALITY_GATED_PARETO_NO_WEIGHTS',
    dimensions:[
      'mandatoryInstalledBytes',
      'peakWorkingMemoryBytes',
      'coldEndToEndLatencyMicros',
      'warmEndToEndLatencyMicros',
      'acceptedOutputCostMicrousd',
    ],
    direction:'LOWER_IS_BETTER',
    slices:frontier.slices.map(slice=>{
      const preferred=[...slice.qualityPreferredCandidateIds].sort();
      return {
        sliceId:slice.sliceId,
        capability:slice.capability,
        state:'PARETO_FRONTIER_READY',
        qualityPreferredCandidateIds:preferred,
        vectors:preferred.map(id=>({
          candidateId:id,
          mandatoryInstalledBytes:500_000_000,
          workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES',
          peakWorkingMemoryBytes:500_000_000,
          coldEndToEndLatencyMicros:300,
          warmEndToEndLatencyMicros:250,
          acceptedOutputCostMicrousd:0,
          costKind:'PROVEN_UNMETERED_LOCAL',
          hardwareProfileSha256:H('materialization-hardware'),
          measurementMethodSha256:H('materialization-method'),
          measurementEvidenceSha256:H(slice.capability+'-'+id+'-resource'),
        })),
        paretoNondominatedCandidateIds:preferred,
        dominatedCandidateIds:[],
        ...(preferred.length===1
          ?{uniqueEfficiencyDominantCandidateId:preferred[0]}
          :{}),
      };
    }).sort((a,b)=>a.sliceId.localeCompare(b.sliceId)),
    weightedAggregateScoreAllowed:false,
    lowerQualityCandidateAdmissionAllowed:false,
    deploymentTierAdmissionGranted:false,
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

function runtime(){
  return {
    backboneBytes:400_000_000,
    conditionerBytes:40_000_000,
    vaeBytes:40_000_000,
    adapterBytes:10_000_000,
    otherRequiredBytes:10_000_000,
    mandatoryInstalledBytes:500_000_000,
    workingMemoryBytes:500_000_000,
    evidenceSha256:H('materialization-runtime'),
  };
}

function authorityFalse(){
  return {
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
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

async function qualifiedAssembly(rawDecision,id=DIRECT){
  const source=rawDecision.candidates.find(value=>value.candidateId===id);
  const campaignCandidate=campaign.candidates.find(value=>value.candidateId===id);
  const sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(
    rawDecision,
    hashPort,
  );
  const campaignDigest=await hsmeFoundationBenchmarkCampaignV1Digest(
    campaign,
    hashPort,
  );
  const sourceCandidateSha256=H(
    HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN
    +JSON.stringify(normalizeHsmeFoundationReuseCandidateV1(source)),
  );
  const required=requiredCapabilities(id);
  const candidate=normalizeHsmeFoundationReuseCandidateV1({
    ...source,
    evidenceState:'QUALIFIED',
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256:campaignCandidate.rightsEvidenceSha256,
    quality:{status:'PASS',evidenceSha256:H(id+'-quality-aggregate')},
    runtime:runtime(),
    training:{
      ...source.training,
      evidenceSha256:H(id+'-training-aggregate'),
    },
    rejectionReasons:[],
  });
  const assembledCandidateSha256=H(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN
    +JSON.stringify(candidate),
  );
  const proofEvidenceRefs=required.map(capability=>({
    kind:'QUALIFICATION',
    capability,
    evidenceSetSha256:H(id+'-'+capability+'-qualification-proof'),
  })).sort(
    (a,b)=>a.capability.localeCompare(b.capability)||a.kind.localeCompare(b.kind),
  );
  const payload={
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    outcome:'QUALIFIED',
    candidateId:id,
    campaignDigest,
    sourceDecisionSha256,
    sourceCandidateSha256,
    requiredCapabilities:required,
    proofRefs:proofEvidenceRefs,
    assembledCandidateSha256,
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
  const candidateEvidenceSetSha256=H(
    HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN
    +JSON.stringify(payload),
  );
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId:id,
    state:'CANDIDATE_EVIDENCE_QUALIFIED',
    blockers:[],
    campaignDigest,
    sourceDecisionSha256,
    sourceCandidateSha256,
    requiredCapabilities:required,
    coveredQualificationCapabilities:[...required],
    coveredRejectionCapabilities:[],
    missingCapabilities:[],
    proofEvidenceRefs,
    assembledCandidateSha256,
    candidateEvidenceSetSha256,
    candidate,
    ...authorityFalse(),
  };
}

function loaded(value){
  const bytes=canonicalFileBytes(value);
  return Object.freeze({
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

async function fixture({withAssembly=true}={}){
  const decision=sourceDecision();
  const frontierValue=qualityFrontier(DIRECT);
  const frontierSha=await hsmeFoundationQualityFrontierV1Digest(
    frontierValue,
    hashPort,
  );
  const paretoValue=pareto(frontierValue);
  paretoValue.qualityFrontierSha256=frontierSha;
  const paretoSha=await hsmeFoundationParetoEfficiencyV1Digest(
    paretoValue,
    hashPort,
  );
  const assemblies=withAssembly?[await qualifiedAssembly(decision,DIRECT)]:[];

  const sourceLoaded=loaded(decision);
  const campaignLoaded=loaded(campaign);
  const frontierLoaded=loaded(frontierValue);
  const paretoLoaded=loaded(paretoValue);
  const assemblyLoaded=assemblies.map(loaded);

  const index={
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
    sourceDecisionFileSha256:sourceLoaded.fileSha256,
    campaignFileSha256:campaignLoaded.fileSha256,
    candidateAssemblies:assemblyLoaded.map(item=>({
      candidateId:item.value.candidateId,
      fileSha256:item.fileSha256,
      candidateEvidenceSetSha256:item.value.candidateEvidenceSetSha256,
    })),
    qualityFrontier:{
      fileSha256:frontierLoaded.fileSha256,
      qualityFrontierSha256:frontierSha,
    },
    paretoEfficiency:{
      fileSha256:paretoLoaded.fileSha256,
      paretoEvidenceSha256:paretoSha,
    },
    trainingRunStartAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
  };
  const normalizedIndex=normalizeOriginIndex(index);
  const expectedOriginIndexSha256=domainDigest(
    HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN,
    normalizedIndex,
  );
  return {
    sourceDecision:sourceLoaded,
    campaign:campaignLoaded,
    assemblies:assemblyLoaded,
    frontier:frontierLoaded,
    pareto:paretoLoaded,
    originIndex:loaded(index),
    expectedOriginIndexSha256,
    index,
  };
}

test('trusted indexed evidence materializes canonical direct-reuse finalization and handoff',async()=>{
  const input=await fixture();
  const result=await materializeHsmeReuseOutcomeEvidence(input);

  assert.equal(result.finalization.state,'DIRECT_FOUNDATION_ADVANCE_READY');
  assert.equal(result.finalization.selectedCandidateId,DIRECT);
  assert.equal(result.handoff.state,'DIRECT_REUSE_HANDOFF_READY');
  assert.equal(result.handoff.selectedCandidateId,DIRECT);
  assert.equal(result.handoff.reusePhasePermitted,true);
  assert.equal(result.handoff.fullStudentDistillationPhasePermitted,false);

  const evidence=result.materializationEvidence;
  assert.match(evidence.originIndexSha256,/^[0-9a-f]{64}$/);
  assert.match(evidence.materializationEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(evidence.finalizationFileSha256,/^[0-9a-f]{64}$/);
  assert.match(evidence.handoffFileSha256,/^[0-9a-f]{64}$/);
  assert.ok(evidence.finalizerOriginVerifierCallCount>=3);
  assert.equal(evidence.handoffOriginVerifierCallCount,1);

  for(const field of [
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
    assert.equal(evidence[field],false,field);
  }
});

test('same trusted inputs produce byte-identical output package',async()=>{
  const input=await fixture();
  const first=await materializeHsmeReuseOutcomeEvidence(input);
  const second=await materializeHsmeReuseOutcomeEvidence(input);
  assert.deepEqual(first.files.finalization,second.files.finalization);
  assert.deepEqual(first.files.handoff,second.files.handoff);
  assert.deepEqual(
    first.files.materializationEvidence,
    second.files.materializationEvidence,
  );
});

test('external origin-index digest mismatch fails before canonical finalization',async()=>{
  const input=await fixture();
  await assert.rejects(
    ()=>materializeHsmeReuseOutcomeEvidence({
      ...input,
      expectedOriginIndexSha256:H('wrong-origin-index'),
    }),
    error=>error.code==='hsme_reuse_materialization_origin_digest_mismatch',
  );
});

test('raw source decision byte digest drift fails before finalization',async()=>{
  const input=await fixture();
  await assert.rejects(
    ()=>materializeHsmeReuseOutcomeEvidence({
      ...input,
      sourceDecision:{
        ...input.sourceDecision,
        fileSha256:H('drifted-source-file'),
      },
    }),
    error=>error.code==='hsme_reuse_materialization_file_digest_mismatch',
  );
});

test('assembly semantic digest must exactly match trusted origin index',async()=>{
  const input=await fixture();
  const index=structuredClone(input.index);
  index.candidateAssemblies[0].candidateEvidenceSetSha256=H('wrong-assembly-set');
  const expectedOriginIndexSha256=domainDigest(
    HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN,
    normalizeOriginIndex(index),
  );
  await assert.rejects(
    ()=>materializeHsmeReuseOutcomeEvidence({
      ...input,
      originIndex:loaded(index),
      expectedOriginIndexSha256,
    }),
    error=>
      error.code==='hsme_reuse_materialization_assembly_semantic_digest_mismatch',
  );
});

test('origin index cannot carry execution or production authority',async()=>{
  const input=await fixture();
  const index=structuredClone(input.index);
  index.trainingRunStartAllowed=true;
  const raw=loaded(index);
  await assert.rejects(
    ()=>materializeHsmeReuseOutcomeEvidence({
      ...input,
      originIndex:raw,
      expectedOriginIndexSha256:H('irrelevant'),
    }),
    error=>error.code==='hsme_reuse_materialization_authority_invalid',
  );
});

test('missing candidate evidence remains HANDOFF_PENDING and grants no phase permission',async()=>{
  const input=await fixture({withAssembly:false});
  const result=await materializeHsmeReuseOutcomeEvidence(input);
  assert.equal(result.finalization.state,'DECISION_EVIDENCE_INCOMPLETE');
  assert.equal(result.handoff.state,'HANDOFF_PENDING');
  assert.equal(result.handoff.reusePhasePermitted,false);
  assert.equal(result.handoff.fullStudentDistillationPhasePermitted,false);
  assert.equal(result.handoff.trainingRunStartAllowed,false);
  assert.equal(result.materializationEvidence.handoffOriginVerifierCallCount,0);
});

test('frontier raw bytes are independently bound even when semantic digest string is unchanged',async()=>{
  const input=await fixture();
  await assert.rejects(
    ()=>materializeHsmeReuseOutcomeEvidence({
      ...input,
      frontier:{
        ...input.frontier,
        fileSha256:H('other-frontier-file'),
      },
    }),
    error=>error.code==='hsme_reuse_materialization_file_digest_mismatch',
  );
});

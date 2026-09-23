import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseCandidateV1,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseCandidateV1,
  type HsmeFoundationReuseRuntimeV1,
} from './HsmeFoundationReuseDecisionV1';
import {
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
} from './HsmeFoundationPendingReuseRuntimeApplicationV1';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN,
  type HsmeFoundationReuseEvidenceQualificationV1,
} from './HsmeFoundationReuseEvidenceQualificationV1';
import {
  HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN,
  type HsmeFoundationReuseEvidenceRejectionV1,
} from './HsmeFoundationReuseEvidenceRejectionV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1' as const;
export const HSME_FOUNDATION_REUSE_CANDIDATE_RUNTIME_AGGREGATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-runtime-aggregate:v1\0' as const;
export const HSME_FOUNDATION_REUSE_CANDIDATE_QUALITY_AGGREGATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-quality-aggregate:v1\0' as const;
export const HSME_FOUNDATION_REUSE_CANDIDATE_TRAINING_AGGREGATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-training-aggregate:v1\0' as const;
export const HSME_FOUNDATION_REUSE_CANDIDATE_REJECTED_QUALITY_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-rejected-quality:v1\0' as const;
export const HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-assembled-candidate:v1\0' as const;
export const HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN =
  'bers:hsme:reuse-candidate-evidence-set:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const SUPPORTED_CAPABILITIES=Object.freeze(['IMAGE_EDITING','TEXT_TO_IMAGE'] as const);
const HARD_BLOCKERS=Object.freeze([
  'LICENSE_NON_COMMERCIAL',
  'QUALITY_FLOOR_FAILED',
  'MOBILE_INSTALLED_BUDGET_EXCEEDED',
  'MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED',
] as const);
type Capability=typeof SUPPORTED_CAPABILITIES[number];
type HardBlocker=typeof HARD_BLOCKERS[number];

type ResolvedRuntime=Readonly<{
  backboneBytes:number;
  conditionerBytes:number;
  vaeBytes:number;
  adapterBytes:number;
  otherRequiredBytes:number;
  mandatoryInstalledBytes:number;
  workingMemoryBytes:number;
  evidenceSha256:string;
}>;

export interface HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1{
  verifyQualificationEvidence(
    proof:HsmeFoundationReuseEvidenceQualificationV1,
    expectedEvidenceSetSha256:string,
  ):Promise<boolean>;
  verifyRejectionEvidence(
    proof:HsmeFoundationReuseEvidenceRejectionV1,
    expectedEvidenceSetSha256:string,
  ):Promise<boolean>;
}

export type HsmeFoundationReuseCandidateEvidenceAssemblyStateV1=
  | 'CANDIDATE_EVIDENCE_INVALID'
  | 'CANDIDATE_EVIDENCE_INCOMPLETE'
  | 'CANDIDATE_EVIDENCE_QUALIFIED'
  | 'CANDIDATE_EVIDENCE_REJECTED';

export type HsmeFoundationReuseCandidateProofEvidenceRefV1=Readonly<{
  kind:'QUALIFICATION'|'REJECTION';
  capability:Capability;
  evidenceSetSha256:string;
}>;

export type HsmeFoundationReuseCandidateEvidenceAssemblyV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA;
  candidateId:string;
  state:HsmeFoundationReuseCandidateEvidenceAssemblyStateV1;
  blockers:readonly string[];
  campaignDigest:string|'UNKNOWN';
  sourceDecisionSha256:string|'UNKNOWN';
  sourceCandidateSha256:string|'UNKNOWN';
  requiredCapabilities:readonly Capability[];
  coveredQualificationCapabilities:readonly Capability[];
  coveredRejectionCapabilities:readonly Capability[];
  missingCapabilities:readonly Capability[];
  proofEvidenceRefs:readonly HsmeFoundationReuseCandidateProofEvidenceRefV1[];
  assembledCandidateSha256:string|'UNKNOWN';
  candidateEvidenceSetSha256:string|'UNKNOWN';
  candidate:HsmeFoundationReuseCandidateV1|null;
  decisionMutationAllowed:false;
  candidateSelectionAllowed:false;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  modelFleetPromotionAllowed:false;
  installOrDownloadAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function assembleHsmeFoundationReuseCandidateEvidenceV1(
  rawSourceDecision:unknown,
  rawCampaign:unknown,
  candidateId:string,
  qualificationProofs:readonly HsmeFoundationReuseEvidenceQualificationV1[],
  rejectionProofs:readonly HsmeFoundationReuseEvidenceRejectionV1[],
  origin:HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseCandidateEvidenceAssemblyV1>{
  const blockers:string[]=[];
  if(!validIdentifier(candidateId,120))blockers.push('ASSEMBLY_CANDIDATE_ID_INVALID');
  if(!Array.isArray(qualificationProofs)||qualificationProofs.length>16){
    blockers.push('ASSEMBLY_QUALIFICATION_PROOF_COUNT_INVALID');
  }
  if(!Array.isArray(rejectionProofs)||rejectionProofs.length>16){
    blockers.push('ASSEMBLY_REJECTION_PROOF_COUNT_INVALID');
  }

  let decision;
  let campaign;
  try{
    decision=normalizeHsmeFoundationReuseDecisionV1(rawSourceDecision);
    campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  }catch{
    return invalid(candidateId,['ASSEMBLY_SOURCE_OR_CAMPAIGN_INVALID']);
  }

  if(decision.decisionStatus!=='EVALUATION_PENDING'||decision.selectedCandidateId!==undefined){
    blockers.push('ASSEMBLY_SOURCE_DECISION_NOT_PENDING');
  }
  if(campaign.status!=='FIXTURES_PINNED'){
    blockers.push('ASSEMBLY_CAMPAIGN_NOT_PINNED');
  }

  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  let campaignDigest:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(decision,hash);
    campaignDigest=await hsmeFoundationBenchmarkCampaignV1Digest(campaign,hash);
  }catch{
    blockers.push('ASSEMBLY_SOURCE_DIGEST_INVALID');
  }

  const sourceMatches=decision.candidates.filter(value=>value.candidateId===candidateId);
  if(sourceMatches.length!==1){
    blockers.push(sourceMatches.length===0?'ASSEMBLY_SOURCE_CANDIDATE_MISSING':'ASSEMBLY_SOURCE_CANDIDATE_DUPLICATE');
    return invalid(candidateId,blockers,{campaignDigest,sourceDecisionSha256});
  }
  const sourceCandidate=sourceMatches[0];
  validateSourceCandidate(sourceCandidate,blockers);

  let sourceCandidateSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceCandidateSha256=await digest(
      HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
      sourceCandidate,
      hash,
      'ASSEMBLY_SOURCE_CANDIDATE_DIGEST_INVALID',
    );
  }catch{
    blockers.push('ASSEMBLY_SOURCE_CANDIDATE_DIGEST_INVALID');
  }

  const campaignMatches=campaign.candidates.filter(value=>value.candidateId===candidateId);
  if(campaignMatches.length!==1){
    blockers.push(campaignMatches.length===0?'ASSEMBLY_CAMPAIGN_CANDIDATE_MISSING':'ASSEMBLY_CAMPAIGN_CANDIDATE_DUPLICATE');
    return invalid(candidateId,blockers,{campaignDigest,sourceDecisionSha256,sourceCandidateSha256});
  }
  const campaignCandidate=campaignMatches[0];
  if(campaignCandidate.sourceRoot!==sourceCandidate.source.sourceRoot
    ||campaignCandidate.immutableRevision!==sourceCandidate.source.immutableRevision
    ||campaignCandidate.modelContentSha256!==sourceCandidate.source.contentSha256){
    blockers.push('ASSEMBLY_CAMPAIGN_SOURCE_DRIFT');
  }
  if(campaignCandidate.executionProfileSha256==='UNKNOWN'||!HEX64.test(campaignCandidate.executionProfileSha256)){
    blockers.push('ASSEMBLY_CAMPAIGN_EXECUTION_PROFILE_UNRESOLVED');
  }

  const requiredCapabilities=deriveRequiredCapabilities(campaign,campaignCandidate,candidateId,blockers);
  const requiredSet=new Set(requiredCapabilities);

  const qByCapability=new Map<Capability,HsmeFoundationReuseEvidenceQualificationV1>();
  const rByCapability=new Map<Capability,HsmeFoundationReuseEvidenceRejectionV1>();

  for(const proof of qualificationProofs){
    const capability=proof.capability;
    if(qByCapability.has(capability))blockers.push('ASSEMBLY_QUALIFICATION_PROOF_DUPLICATE:'+capability);
    qByCapability.set(capability,proof);
    await validateQualificationProof(
      proof,candidateId,requiredSet,sourceDecisionSha256,sourceCandidateSha256,
      campaignCandidate.executionProfileSha256,campaignCandidate.rightsEvidenceSha256,
      origin,hash,blockers,
    );
  }
  for(const proof of rejectionProofs){
    const capability=proof.capability;
    if(rByCapability.has(capability))blockers.push('ASSEMBLY_REJECTION_PROOF_DUPLICATE:'+capability);
    rByCapability.set(capability,proof);
    await validateRejectionProof(
      proof,candidateId,requiredSet,sourceDecisionSha256,sourceCandidateSha256,
      campaignCandidate.executionProfileSha256,origin,hash,blockers,
    );
  }

  for(const capability of requiredCapabilities){
    const q=qByCapability.get(capability);
    const r=rByCapability.get(capability);
    if(q&&r&&!compatibleQualificationAndResourceRejection(q,r)){
      blockers.push('ASSEMBLY_CAPABILITY_PROOF_CONFLICT:'+capability);
    }
  }

  const coveredQualificationCapabilities=Object.freeze(
    [...qByCapability.keys()].filter(value=>requiredSet.has(value)).sort(lexical),
  );
  const coveredRejectionCapabilities=Object.freeze(
    [...rByCapability.keys()].filter(value=>requiredSet.has(value)).sort(lexical),
  );
  const missingCapabilities=Object.freeze(
    requiredCapabilities.filter(value=>!qByCapability.has(value)),
  );

  if(blockers.length>0){
    return invalid(candidateId,blockers,{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
      coveredQualificationCapabilities,coveredRejectionCapabilities,missingCapabilities,
    });
  }

  const rejectionProofList=[...rByCapability.values()].sort(compareCapabilityProofs);
  if(rejectionProofList.length>0){
    return assembleRejected(
      sourceCandidate,decision,campaignDigest,sourceDecisionSha256,sourceCandidateSha256,
      requiredCapabilities,coveredQualificationCapabilities,coveredRejectionCapabilities,
      qualificationProofs,rejectionProofList,hash,
    );
  }

  if(missingCapabilities.length>0){
    return incomplete(candidateId,{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
      coveredQualificationCapabilities,coveredRejectionCapabilities,missingCapabilities,
      proofEvidenceRefs:Object.freeze([
        ...qualificationProofs.map(value=>({
          kind:'QUALIFICATION' as const,
          capability:value.capability,
          evidenceSetSha256:value.evidenceSetSha256,
        })),
        ...rejectionProofs.map(value=>({
          kind:'REJECTION' as const,
          capability:value.capability,
          evidenceSetSha256:value.evidenceSetSha256,
        })),
      ].sort(compareProofRefs)),
    });
  }

  return assembleQualified(
    sourceCandidate,campaignCandidate,campaignDigest,sourceDecisionSha256,sourceCandidateSha256,
    requiredCapabilities,[...qByCapability.values()].sort(compareCapabilityProofs),hash,
  );
}

async function validateQualificationProof(
  proof:HsmeFoundationReuseEvidenceQualificationV1,
  candidateId:string,
  requiredSet:ReadonlySet<Capability>,
  sourceDecisionSha256:string|'UNKNOWN',
  sourceCandidateSha256:string|'UNKNOWN',
  expectedExecutionProfileSha256:string|'UNKNOWN',
  expectedRightsSha256:string|'UNKNOWN',
  origin:HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<void>{
  if(proof.schemaVersion!==HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA
    ||proof.state!=='QUALIFICATION_EVIDENCE_READY'
    ||!Array.isArray(proof.blockers)||proof.blockers.length!==0){
    blockers.push('ASSEMBLY_QUALIFICATION_PROOF_NOT_READY');
    return;
  }
  if(proof.candidateId!==candidateId)blockers.push('ASSEMBLY_QUALIFICATION_CANDIDATE_DRIFT');
  if(!requiredSet.has(proof.capability))blockers.push('ASSEMBLY_QUALIFICATION_CAPABILITY_OUT_OF_SCOPE:'+proof.capability);
  if(proof.sourceDecisionSha256!==sourceDecisionSha256
    ||proof.sourceCandidateSha256!==sourceCandidateSha256){
    blockers.push('ASSEMBLY_QUALIFICATION_SOURCE_BINDING_DRIFT:'+proof.capability);
  }
  if(proof.sourceExecutionProfileSha256!==expectedExecutionProfileSha256){
    blockers.push('ASSEMBLY_QUALIFICATION_PROFILE_DRIFT:'+proof.capability);
  }
  if(proof.resolvedLicenseConclusion!=='COMMERCIAL_ADMISSIBLE'
    ||proof.licenseEvidenceSha256!==expectedRightsSha256){
    blockers.push('ASSEMBLY_QUALIFICATION_LICENSE_DRIFT:'+proof.capability);
  }
  if(!qualificationProofFieldsResolved(proof)){
    blockers.push('ASSEMBLY_QUALIFICATION_EVIDENCE_UNRESOLVED:'+proof.capability);
  }
  if(!proofAuthorityFalse(proof)){
    blockers.push('ASSEMBLY_QUALIFICATION_AUTHORITY_WIDENING:'+proof.capability);
  }

  let expected:string|null=null;
  try{
    expected=await digest(
      HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN,
      qualificationEvidencePayload(proof),
      hash,
      'ASSEMBLY_QUALIFICATION_REHASH_INVALID',
    );
  }catch{
    blockers.push('ASSEMBLY_QUALIFICATION_REHASH_INVALID:'+proof.capability);
  }
  if(expected!==null&&expected!==proof.evidenceSetSha256){
    blockers.push('ASSEMBLY_QUALIFICATION_REHASH_MISMATCH:'+proof.capability);
  }

  if(expected!==null&&expected===proof.evidenceSetSha256){
    let verified=false;
    try{verified=await origin.verifyQualificationEvidence(proof,expected);}catch{verified=false;}
    if(!verified)blockers.push('ASSEMBLY_QUALIFICATION_ORIGIN_UNVERIFIED:'+proof.capability);
  }
}

async function validateRejectionProof(
  proof:HsmeFoundationReuseEvidenceRejectionV1,
  candidateId:string,
  requiredSet:ReadonlySet<Capability>,
  sourceDecisionSha256:string|'UNKNOWN',
  sourceCandidateSha256:string|'UNKNOWN',
  expectedExecutionProfileSha256:string|'UNKNOWN',
  origin:HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<void>{
  if(proof.schemaVersion!==HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA
    ||proof.state!=='REJECTION_EVIDENCE_READY'
    ||!Array.isArray(proof.blockers)||proof.blockers.length!==0){
    blockers.push('ASSEMBLY_REJECTION_PROOF_NOT_READY');
    return;
  }
  if(proof.candidateId!==candidateId)blockers.push('ASSEMBLY_REJECTION_CANDIDATE_DRIFT');
  if(!requiredSet.has(proof.capability))blockers.push('ASSEMBLY_REJECTION_CAPABILITY_OUT_OF_SCOPE:'+proof.capability);
  if(proof.sourceDecisionSha256!==sourceDecisionSha256
    ||proof.sourceCandidateSha256!==sourceCandidateSha256){
    blockers.push('ASSEMBLY_REJECTION_SOURCE_BINDING_DRIFT:'+proof.capability);
  }
  if(proof.sourceExecutionProfileSha256!==expectedExecutionProfileSha256){
    blockers.push('ASSEMBLY_REJECTION_PROFILE_DRIFT:'+proof.capability);
  }
  if(!rejectionProofFieldsResolved(proof)){
    blockers.push('ASSEMBLY_REJECTION_EVIDENCE_UNRESOLVED:'+proof.capability);
  }
  if(!proofAuthorityFalse(proof)){
    blockers.push('ASSEMBLY_REJECTION_AUTHORITY_WIDENING:'+proof.capability);
  }
  if(proof.derivedRejectionReasons.length<1
    ||proof.derivedRejectionReasons.some(value=>!(HARD_BLOCKERS as readonly string[]).includes(value))){
    blockers.push('ASSEMBLY_REJECTION_REASON_INVALID:'+proof.capability);
  }
  validateRejectionReasonEvidence(proof,blockers);

  let expected:string|null=null;
  try{
    expected=await digest(
      HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN,
      rejectionEvidencePayload(proof),
      hash,
      'ASSEMBLY_REJECTION_REHASH_INVALID',
    );
  }catch{
    blockers.push('ASSEMBLY_REJECTION_REHASH_INVALID:'+proof.capability);
  }
  if(expected!==null&&expected!==proof.evidenceSetSha256){
    blockers.push('ASSEMBLY_REJECTION_REHASH_MISMATCH:'+proof.capability);
  }

  if(expected!==null&&expected===proof.evidenceSetSha256){
    let verified=false;
    try{verified=await origin.verifyRejectionEvidence(proof,expected);}catch{verified=false;}
    if(!verified)blockers.push('ASSEMBLY_REJECTION_ORIGIN_UNVERIFIED:'+proof.capability);
  }
}

async function assembleQualified(
  sourceCandidate:HsmeFoundationReuseCandidateV1,
  campaignCandidate:{executionProfileSha256:string|'UNKNOWN';rightsEvidenceSha256:string|'UNKNOWN'},
  campaignDigest:string|'UNKNOWN',
  sourceDecisionSha256:string|'UNKNOWN',
  sourceCandidateSha256:string|'UNKNOWN',
  requiredCapabilities:readonly Capability[],
  proofs:readonly HsmeFoundationReuseEvidenceQualificationV1[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseCandidateEvidenceAssemblyV1>{
  const blockers:string[]=[];
  const first=proofs[0];
  if(!first||first.runtime===null){
    return invalid(sourceCandidate.candidateId,['ASSEMBLY_QUALIFICATION_RUNTIME_MISSING'],{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
    });
  }
  const firstRuntime=asResolvedRuntime(first.runtime);
  if(firstRuntime===null){
    return invalid(sourceCandidate.candidateId,['ASSEMBLY_QUALIFICATION_RUNTIME_INVALID'],{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
    });
  }

  const componentMapSha256=first.runtimeComponentMapSha256;
  const installedShape=installedRuntimeShape(firstRuntime);
  let maxWorkingMemoryBytes=firstRuntime.workingMemoryBytes;
  for(const proof of proofs){
    if(proof.runtime===null){
      blockers.push('ASSEMBLY_QUALIFICATION_RUNTIME_MISSING:'+proof.capability);
      continue;
    }
    const runtime=asResolvedRuntime(proof.runtime);
    if(runtime===null){
      blockers.push('ASSEMBLY_QUALIFICATION_RUNTIME_INVALID:'+proof.capability);
      continue;
    }
    if(proof.runtimeComponentMapSha256!==componentMapSha256){
      blockers.push('ASSEMBLY_QUALIFICATION_COMPONENT_MAP_DRIFT:'+proof.capability);
    }
    if(JSON.stringify(installedRuntimeShape(runtime))!==JSON.stringify(installedShape)){
      blockers.push('ASSEMBLY_QUALIFICATION_INSTALLED_RUNTIME_DRIFT:'+proof.capability);
    }
    maxWorkingMemoryBytes=Math.max(maxWorkingMemoryBytes,runtime.workingMemoryBytes);
  }

  const licenseDigests=[...new Set(proofs.map(value=>value.licenseEvidenceSha256))];
  if(licenseDigests.length!==1
    ||licenseDigests[0]!==campaignCandidate.rightsEvidenceSha256
    ||licenseDigests[0]==='UNKNOWN'){
    blockers.push('ASSEMBLY_QUALIFICATION_LICENSE_SET_DRIFT');
  }

  if(blockers.length>0){
    return invalid(sourceCandidate.candidateId,blockers,{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
      coveredQualificationCapabilities:Object.freeze(proofs.map(value=>value.capability).sort(lexical)),
      missingCapabilities:Object.freeze([]),
    });
  }

  const runtimeEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_CANDIDATE_RUNTIME_AGGREGATE_DIGEST_DOMAIN,
    {
      candidateId:sourceCandidate.candidateId,
      requiredCapabilities,
      runtimeComponentMapSha256:componentMapSha256,
      sourceExecutionProfileSha256:campaignCandidate.executionProfileSha256,
      ...installedShape,
      workingMemoryBytes:maxWorkingMemoryBytes,
      capabilityEvidence:proofs.map(value=>({
        capability:value.capability,
        runtimeEvidenceSha256:value.runtimeEvidenceSha256,
      })),
    },
    hash,'ASSEMBLY_RUNTIME_AGGREGATE_HASH_INVALID',
  );
  const qualityEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_CANDIDATE_QUALITY_AGGREGATE_DIGEST_DOMAIN,
    {
      candidateId:sourceCandidate.candidateId,
      requiredCapabilities,
      capabilityEvidence:proofs.map(value=>({
        capability:value.capability,
        qualityEvidenceSha256:value.qualityEvidenceSha256,
      })),
    },
    hash,'ASSEMBLY_QUALITY_AGGREGATE_HASH_INVALID',
  );
  const sourceTraining={
    mode:sourceCandidate.training.mode,
    trainableParameters:sourceCandidate.training.trainableParameters,
    frozenParameters:sourceCandidate.training.frozenParameters,
    trainingExamples:sourceCandidate.training.trainingExamples,
    gpuSeconds:sourceCandidate.training.gpuSeconds,
    trainingCostMicrousd:sourceCandidate.training.trainingCostMicrousd,
  };
  const trainingEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_CANDIDATE_TRAINING_AGGREGATE_DIGEST_DOMAIN,
    {
      candidateId:sourceCandidate.candidateId,
      requiredCapabilities,
      sourceTraining,
      capabilityEvidence:proofs.map(value=>({
        capability:value.capability,
        trainingEvidenceSha256:value.trainingEvidenceSha256,
      })),
    },
    hash,'ASSEMBLY_TRAINING_AGGREGATE_HASH_INVALID',
  );

  let candidate:HsmeFoundationReuseCandidateV1;
  try{
    candidate=normalizeHsmeFoundationReuseCandidateV1({
      ...sourceCandidate,
      evidenceState:'QUALIFIED',
      licenseConclusion:'COMMERCIAL_ADMISSIBLE',
      licenseEvidenceSha256:licenseDigests[0],
      quality:{status:'PASS',evidenceSha256:qualityEvidenceSha256},
      runtime:{
        ...installedShape,
        workingMemoryBytes:maxWorkingMemoryBytes,
        evidenceSha256:runtimeEvidenceSha256,
      },
      training:{
        ...sourceTraining,
        evidenceSha256:trainingEvidenceSha256,
      },
      rejectionReasons:[],
    });
  }catch{
    return invalid(sourceCandidate.candidateId,['ASSEMBLY_QUALIFIED_CANDIDATE_INVALID'],{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
      coveredQualificationCapabilities:Object.freeze(proofs.map(value=>value.capability).sort(lexical)),
      missingCapabilities:Object.freeze([]),
    });
  }

  const assembledCandidateSha256=await digest(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
    candidate,hash,'ASSEMBLY_CANDIDATE_HASH_INVALID',
  );
  const proofRefs=proofs.map(value=>({
    kind:'QUALIFICATION' as const,
    capability:value.capability,
    evidenceSetSha256:value.evidenceSetSha256,
  }));
  const candidateEvidenceSetSha256=await digest(
    HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
      outcome:'QUALIFIED',
      candidateId:sourceCandidate.candidateId,
      campaignDigest,
      sourceDecisionSha256,
      sourceCandidateSha256,
      requiredCapabilities,
      proofRefs,
      assembledCandidateSha256,
      decisionMutationAllowed:false,
      candidateSelectionAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      trainingOrDistillationAllowed:false,
      winnerSelectionAllowed:false,
    },
    hash,'ASSEMBLY_EVIDENCE_SET_HASH_INVALID',
  );

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId:sourceCandidate.candidateId,
    state:'CANDIDATE_EVIDENCE_QUALIFIED',
    blockers:Object.freeze([]),
    campaignDigest,
    sourceDecisionSha256,
    sourceCandidateSha256,
    requiredCapabilities:Object.freeze([...requiredCapabilities]),
    coveredQualificationCapabilities:Object.freeze(proofs.map(value=>value.capability).sort(lexical)),
    coveredRejectionCapabilities:Object.freeze([]),
    missingCapabilities:Object.freeze([]),
    proofEvidenceRefs:Object.freeze(proofRefs),
    assembledCandidateSha256,
    candidateEvidenceSetSha256,
    candidate,
    ...authorityBoundary(),
  });
}

async function assembleRejected(
  sourceCandidate:HsmeFoundationReuseCandidateV1,
  sourceDecision:ReturnType<typeof normalizeHsmeFoundationReuseDecisionV1>,
  campaignDigest:string|'UNKNOWN',
  sourceDecisionSha256:string|'UNKNOWN',
  sourceCandidateSha256:string|'UNKNOWN',
  requiredCapabilities:readonly Capability[],
  coveredQualificationCapabilities:readonly Capability[],
  coveredRejectionCapabilities:readonly Capability[],
  qualificationProofs:readonly HsmeFoundationReuseEvidenceQualificationV1[],
  rejectionProofs:readonly HsmeFoundationReuseEvidenceRejectionV1[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseCandidateEvidenceAssemblyV1>{
  const blockers:string[]=[];
  const reasons=Object.freeze(
    [...new Set(rejectionProofs.flatMap(value=>value.derivedRejectionReasons as readonly string[]))]
      .sort(lexical),
  );
  if(reasons.length<1||reasons.some(value=>!(HARD_BLOCKERS as readonly string[]).includes(value))){
    blockers.push('ASSEMBLY_REJECTED_REASON_SET_INVALID');
  }

  let licenseConclusion=sourceCandidate.licenseConclusion;
  let licenseEvidenceSha256=sourceCandidate.licenseEvidenceSha256;
  if(reasons.includes('LICENSE_NON_COMMERCIAL')){
    const licenseProofs=rejectionProofs.filter(value=>
      value.derivedRejectionReasons.includes('LICENSE_NON_COMMERCIAL')
    );
    const digests=[...new Set(licenseProofs.map(value=>value.licenseEvidenceSha256))];
    if(digests.length!==1||digests[0]==='UNKNOWN'
      ||licenseProofs.some(value=>value.resolvedLicenseConclusion!=='NON_COMMERCIAL')){
      blockers.push('ASSEMBLY_REJECTED_LICENSE_EVIDENCE_DRIFT');
    }else{
      licenseConclusion='NON_COMMERCIAL';
      licenseEvidenceSha256=digests[0];
    }
  }

  let quality=sourceCandidate.quality;
  if(reasons.includes('QUALITY_FLOOR_FAILED')){
    const failed=rejectionProofs
      .filter(value=>value.derivedRejectionReasons.includes('QUALITY_FLOOR_FAILED'))
      .sort(compareCapabilityProofs);
    if(failed.some(value=>value.qualityOutcome!=='FAIL'||value.qualityEvidenceSha256==='UNKNOWN')){
      blockers.push('ASSEMBLY_REJECTED_QUALITY_EVIDENCE_DRIFT');
    }else{
      const evidenceSha256=await digest(
        HSME_FOUNDATION_REUSE_CANDIDATE_REJECTED_QUALITY_DIGEST_DOMAIN,
        {
          candidateId:sourceCandidate.candidateId,
          failures:failed.map(value=>({
            capability:value.capability,
            qualityEvidenceSha256:value.qualityEvidenceSha256,
          })),
        },
        hash,'ASSEMBLY_REJECTED_QUALITY_HASH_INVALID',
      );
      quality=Object.freeze({status:'FAIL' as const,evidenceSha256});
    }
  }

  let runtime=sourceCandidate.runtime;
  const resourceProofs=rejectionProofs.filter(value=>
    value.derivedRejectionReasons.includes('MOBILE_INSTALLED_BUDGET_EXCEEDED')
    ||value.derivedRejectionReasons.includes('MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED')
  );
  for(const proof of resourceProofs){
    if(proof.runtime===null){
      blockers.push('ASSEMBLY_REJECTED_RESOURCE_RUNTIME_MISSING:'+proof.capability);
      continue;
    }
    const resolved=asResolvedRuntime(proof.runtime);
    if(resolved===null){
      blockers.push('ASSEMBLY_REJECTED_RESOURCE_RUNTIME_INVALID:'+proof.capability);
      continue;
    }
    if(proof.derivedRejectionReasons.includes('MOBILE_INSTALLED_BUDGET_EXCEEDED')
      &&resolved.mandatoryInstalledBytes<=sourceDecision.mobileInstalledBudgetBytes){
      blockers.push('ASSEMBLY_REJECTED_INSTALLED_BLOCKER_UNPROVEN:'+proof.capability);
    }
    if(proof.derivedRejectionReasons.includes('MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED')
      &&resolved.workingMemoryBytes<=sourceDecision.mobileWorkingMemoryBudgetBytes){
      blockers.push('ASSEMBLY_REJECTED_MEMORY_BLOCKER_UNPROVEN:'+proof.capability);
    }
  }
  if(resourceProofs.length>0&&blockers.length===0){
    const chosen=[...resourceProofs].sort((left,right)=>{
      const l=asResolvedRuntime(left.runtime!)!;
      const r=asResolvedRuntime(right.runtime!)!;
      const le=Math.max(
        Math.max(0,l.mandatoryInstalledBytes-sourceDecision.mobileInstalledBudgetBytes),
        Math.max(0,l.workingMemoryBytes-sourceDecision.mobileWorkingMemoryBudgetBytes),
      );
      const re=Math.max(
        Math.max(0,r.mandatoryInstalledBytes-sourceDecision.mobileInstalledBudgetBytes),
        Math.max(0,r.workingMemoryBytes-sourceDecision.mobileWorkingMemoryBudgetBytes),
      );
      return re-le||lexical(left.capability,right.capability);
    })[0];
    runtime=chosen.runtime!;
  }

  if(blockers.length>0){
    return invalid(sourceCandidate.candidateId,blockers,{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
      coveredQualificationCapabilities,coveredRejectionCapabilities,
      missingCapabilities:Object.freeze(requiredCapabilities.filter(value=>
        !qualificationProofs.some(proof=>proof.capability===value)
      )),
    });
  }

  let candidate:HsmeFoundationReuseCandidateV1;
  try{
    candidate=normalizeHsmeFoundationReuseCandidateV1({
      ...sourceCandidate,
      evidenceState:'REJECTED',
      licenseConclusion,
      licenseEvidenceSha256,
      quality,
      runtime,
      rejectionReasons:reasons,
    });
  }catch{
    return invalid(sourceCandidate.candidateId,['ASSEMBLY_REJECTED_CANDIDATE_INVALID'],{
      campaignDigest,sourceDecisionSha256,sourceCandidateSha256,requiredCapabilities,
      coveredQualificationCapabilities,coveredRejectionCapabilities,
    });
  }

  const assembledCandidateSha256=await digest(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
    candidate,hash,'ASSEMBLY_CANDIDATE_HASH_INVALID',
  );
  const proofRefs=[
    ...qualificationProofs.map(value=>({
      kind:'QUALIFICATION' as const,capability:value.capability,evidenceSetSha256:value.evidenceSetSha256,
    })),
    ...rejectionProofs.map(value=>({
      kind:'REJECTION' as const,capability:value.capability,evidenceSetSha256:value.evidenceSetSha256,
    })),
  ].sort(compareProofRefs);
  const candidateEvidenceSetSha256=await digest(
    HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_SET_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
      outcome:'REJECTED',
      candidateId:sourceCandidate.candidateId,
      campaignDigest,
      sourceDecisionSha256,
      sourceCandidateSha256,
      requiredCapabilities,
      proofRefs,
      assembledCandidateSha256,
      decisionMutationAllowed:false,
      candidateSelectionAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      trainingOrDistillationAllowed:false,
      winnerSelectionAllowed:false,
    },
    hash,'ASSEMBLY_EVIDENCE_SET_HASH_INVALID',
  );

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId:sourceCandidate.candidateId,
    state:'CANDIDATE_EVIDENCE_REJECTED',
    blockers:Object.freeze([]),
    campaignDigest,
    sourceDecisionSha256,
    sourceCandidateSha256,
    requiredCapabilities:Object.freeze([...requiredCapabilities]),
    coveredQualificationCapabilities:Object.freeze([...coveredQualificationCapabilities]),
    coveredRejectionCapabilities:Object.freeze([...coveredRejectionCapabilities]),
    missingCapabilities:Object.freeze(requiredCapabilities.filter(value=>
      !qualificationProofs.some(proof=>proof.capability===value)
    )),
    proofEvidenceRefs:Object.freeze(proofRefs),
    assembledCandidateSha256,
    candidateEvidenceSetSha256,
    candidate,
    ...authorityBoundary(),
  });
}

function deriveRequiredCapabilities(
  campaign:ReturnType<typeof normalizeHsmeFoundationBenchmarkCampaignV1>,
  candidate:{capabilities:readonly string[]},
  candidateId:string,
  blockers:string[],
):readonly Capability[]{
  const seen=new Map<string,number>();
  const required:string[]=[];
  for(const slice of campaign.slices){
    if(!campaign.requiredCapabilities.includes(slice.capability))continue;
    if(!slice.selectionCandidateIds.includes(candidateId))continue;
    if(!candidate.capabilities.includes(slice.capability)){
      blockers.push('ASSEMBLY_CAMPAIGN_CAPABILITY_BINDING_DRIFT:'+slice.capability);
      continue;
    }
    seen.set(slice.capability,(seen.get(slice.capability)??0)+1);
    required.push(slice.capability);
  }
  for(const [capability,count] of seen){
    if(count!==1)blockers.push('ASSEMBLY_CAPABILITY_SLICE_DUPLICATE:'+capability);
  }
  const unique=[...new Set(required)].sort(lexical);
  if(unique.length<1)blockers.push('ASSEMBLY_REQUIRED_CAPABILITY_SET_EMPTY');
  if(unique.some(value=>!(SUPPORTED_CAPABILITIES as readonly string[]).includes(value))){
    blockers.push('ASSEMBLY_REQUIRED_CAPABILITY_UNSUPPORTED');
  }
  return Object.freeze(unique.filter(
    (value):value is Capability=>(SUPPORTED_CAPABILITIES as readonly string[]).includes(value),
  ));
}

function validateSourceCandidate(candidate:HsmeFoundationReuseCandidateV1,blockers:string[]):void{
  if(candidate.strategy==='CONTROL_BASELINE')blockers.push('ASSEMBLY_CONTROL_CANDIDATE_FORBIDDEN');
  if(candidate.targetTier!=='MOBILE_DEFAULT')blockers.push('ASSEMBLY_MOBILE_DEFAULT_REQUIRED');
  if(candidate.evidenceState!=='UNRESOLVED'||candidate.rejectionReasons.length!==0){
    blockers.push('ASSEMBLY_SOURCE_CANDIDATE_NOT_UNRESOLVED');
  }
  if(candidate.licenseConclusion!=='REVIEW_REQUIRED'||candidate.licenseEvidenceSha256!=='UNKNOWN'){
    blockers.push('ASSEMBLY_SOURCE_LICENSE_NOT_UNRESOLVED');
  }
  if(candidate.quality.status!=='UNKNOWN'||candidate.quality.evidenceSha256!=='UNKNOWN'){
    blockers.push('ASSEMBLY_SOURCE_QUALITY_NOT_UNRESOLVED');
  }
  if(candidate.training.evidenceSha256!=='UNKNOWN'){
    blockers.push('ASSEMBLY_SOURCE_TRAINING_NOT_UNRESOLVED');
  }
  if(!runtimeFullyUnresolved(candidate.runtime)){
    blockers.push('ASSEMBLY_SOURCE_RUNTIME_NOT_UNRESOLVED');
  }
}

function qualificationProofFieldsResolved(proof:HsmeFoundationReuseEvidenceQualificationV1):boolean{
  return allHex([
    proof.sourceDecisionSha256,proof.sourceCandidateSha256,proof.pendingDecisionSha256,
    proof.appliedCandidateSha256,proof.runtimeEvidenceSha256,proof.runtimeComponentMapSha256,
    proof.sourceExecutionProfileSha256,proof.licenseEvidenceSha256,proof.qualityEvidenceSha256,
    proof.trainingEvidenceSha256,proof.evidenceSetSha256,
  ])&&proof.runtime!==null&&asResolvedRuntime(proof.runtime)!==null;
}

function rejectionProofFieldsResolved(proof:HsmeFoundationReuseEvidenceRejectionV1):boolean{
  return allHex([
    proof.sourceDecisionSha256,proof.sourceCandidateSha256,proof.pendingDecisionSha256,
    proof.appliedCandidateSha256,proof.runtimeEvidenceSha256,proof.runtimeComponentMapSha256,
    proof.sourceExecutionProfileSha256,proof.licenseEvidenceSha256,proof.qualityFinalizationSha256,
    proof.qualityEvidenceSha256,proof.evidenceSetSha256,
  ])&&proof.runtime!==null&&asResolvedRuntime(proof.runtime)!==null
    &&proof.qualityOutcome!=='UNKNOWN'&&proof.resolvedLicenseConclusion!=='UNKNOWN';
}

function validateRejectionReasonEvidence(
  proof:HsmeFoundationReuseEvidenceRejectionV1,
  blockers:string[],
):void{
  if(proof.derivedRejectionReasons.includes('LICENSE_NON_COMMERCIAL')
    &&proof.resolvedLicenseConclusion!=='NON_COMMERCIAL'){
    blockers.push('ASSEMBLY_REJECTION_LICENSE_REASON_UNBOUND:'+proof.capability);
  }
  if(proof.derivedRejectionReasons.includes('QUALITY_FLOOR_FAILED')
    &&proof.qualityOutcome!=='FAIL'){
    blockers.push('ASSEMBLY_REJECTION_QUALITY_REASON_UNBOUND:'+proof.capability);
  }
}

function compatibleQualificationAndResourceRejection(
  q:HsmeFoundationReuseEvidenceQualificationV1,
  r:HsmeFoundationReuseEvidenceRejectionV1,
):boolean{
  if(r.derivedRejectionReasons.some(value=>
    value==='LICENSE_NON_COMMERCIAL'||value==='QUALITY_FLOOR_FAILED'
  ))return false;
  return q.sourceDecisionSha256===r.sourceDecisionSha256
    &&q.sourceCandidateSha256===r.sourceCandidateSha256
    &&q.runtimeEvidenceSha256===r.runtimeEvidenceSha256
    &&q.runtimeComponentMapSha256===r.runtimeComponentMapSha256
    &&q.sourceExecutionProfileSha256===r.sourceExecutionProfileSha256
    &&q.licenseEvidenceSha256===r.licenseEvidenceSha256
    &&q.qualityEvidenceSha256===r.qualityEvidenceSha256
    &&r.resolvedLicenseConclusion==='COMMERCIAL_ADMISSIBLE'
    &&r.qualityOutcome==='PASS';
}

function qualificationEvidencePayload(proof:HsmeFoundationReuseEvidenceQualificationV1){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
    candidateId:proof.candidateId,
    capability:proof.capability,
    sourceDecisionSha256:proof.sourceDecisionSha256,
    sourceCandidateSha256:proof.sourceCandidateSha256,
    pendingDecisionSha256:proof.pendingDecisionSha256,
    appliedCandidateSha256:proof.appliedCandidateSha256,
    runtimeEvidenceSha256:proof.runtimeEvidenceSha256,
    runtimeComponentMapSha256:proof.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:proof.sourceExecutionProfileSha256,
    runtime:proof.runtime,
    licenseEvidenceSha256:proof.licenseEvidenceSha256,
    qualityEvidenceSha256:proof.qualityEvidenceSha256,
    trainingEvidenceSha256:proof.trainingEvidenceSha256,
    resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE' as const,
    decisionMutationAllowed:false as const,
    candidateSelectionAllowed:false as const,
    reuseAdvanceAllowed:false as const,
    fullStudentEscalationAllowed:false as const,
    productionAuthorityGranted:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  };
}

function rejectionEvidencePayload(proof:HsmeFoundationReuseEvidenceRejectionV1){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
    candidateId:proof.candidateId,
    capability:proof.capability,
    sourceDecisionSha256:proof.sourceDecisionSha256,
    sourceCandidateSha256:proof.sourceCandidateSha256,
    pendingDecisionSha256:proof.pendingDecisionSha256,
    appliedCandidateSha256:proof.appliedCandidateSha256,
    runtimeEvidenceSha256:proof.runtimeEvidenceSha256,
    runtimeComponentMapSha256:proof.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:proof.sourceExecutionProfileSha256,
    runtime:proof.runtime,
    licenseEvidenceSha256:proof.licenseEvidenceSha256,
    resolvedLicenseConclusion:proof.resolvedLicenseConclusion,
    qualityFinalizationSha256:proof.qualityFinalizationSha256,
    qualityEvidenceSha256:proof.qualityEvidenceSha256,
    qualityOutcome:proof.qualityOutcome,
    derivedRejectionReasons:proof.derivedRejectionReasons,
    decisionMutationAllowed:false as const,
    candidateSelectionAllowed:false as const,
    reuseAdvanceAllowed:false as const,
    fullStudentEscalationAllowed:false as const,
    productionAuthorityGranted:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  };
}

function proofAuthorityFalse(
  proof:HsmeFoundationReuseEvidenceQualificationV1|HsmeFoundationReuseEvidenceRejectionV1,
):boolean{
  return proof.decisionMutationAllowed===false
    &&proof.candidateSelectionAllowed===false
    &&proof.selectedCandidateIdAllowed===false
    &&proof.reuseAdvanceAllowed===false
    &&proof.fullStudentEscalationAllowed===false
    &&proof.modelFleetPromotionAllowed===false
    &&proof.installOrDownloadAllowed===false
    &&proof.productionAuthorityGranted===false
    &&proof.providerAuthorityGranted===false
    &&proof.billingAuthorityGranted===false
    &&proof.projectArtifactMutationAllowed===false
    &&proof.aeeExecutionAuthorityGranted===false
    &&proof.durableModelFleetPromotionAllowed===false
    &&proof.trainingOrDistillationAllowed===false
    &&proof.winnerSelectionAllowed===false;
}

function asResolvedRuntime(runtime:HsmeFoundationReuseRuntimeV1):ResolvedRuntime|null{
  const values=[
    runtime.backboneBytes,runtime.conditionerBytes,runtime.vaeBytes,runtime.adapterBytes,
    runtime.otherRequiredBytes,runtime.mandatoryInstalledBytes,runtime.workingMemoryBytes,
  ];
  if(values.some(value=>value==='UNKNOWN'||!Number.isSafeInteger(value)||Number(value)<0))return null;
  if(runtime.mandatoryInstalledBytes==='UNKNOWN'||Number(runtime.mandatoryInstalledBytes)<1)return null;
  if(runtime.workingMemoryBytes==='UNKNOWN'||Number(runtime.workingMemoryBytes)<1)return null;
  if(runtime.evidenceSha256==='UNKNOWN'||!HEX64.test(runtime.evidenceSha256))return null;
  return Object.freeze({
    backboneBytes:Number(runtime.backboneBytes),
    conditionerBytes:Number(runtime.conditionerBytes),
    vaeBytes:Number(runtime.vaeBytes),
    adapterBytes:Number(runtime.adapterBytes),
    otherRequiredBytes:Number(runtime.otherRequiredBytes),
    mandatoryInstalledBytes:Number(runtime.mandatoryInstalledBytes),
    workingMemoryBytes:Number(runtime.workingMemoryBytes),
    evidenceSha256:runtime.evidenceSha256,
  });
}

function installedRuntimeShape(runtime:ResolvedRuntime){
  return Object.freeze({
    backboneBytes:runtime.backboneBytes,
    conditionerBytes:runtime.conditionerBytes,
    vaeBytes:runtime.vaeBytes,
    adapterBytes:runtime.adapterBytes,
    otherRequiredBytes:runtime.otherRequiredBytes,
    mandatoryInstalledBytes:runtime.mandatoryInstalledBytes,
  });
}

function runtimeFullyUnresolved(runtime:HsmeFoundationReuseRuntimeV1):boolean{
  return runtime.backboneBytes==='UNKNOWN'
    &&runtime.conditionerBytes==='UNKNOWN'
    &&runtime.vaeBytes==='UNKNOWN'
    &&runtime.adapterBytes==='UNKNOWN'
    &&runtime.otherRequiredBytes==='UNKNOWN'
    &&runtime.mandatoryInstalledBytes==='UNKNOWN'
    &&runtime.workingMemoryBytes==='UNKNOWN'
    &&runtime.evidenceSha256==='UNKNOWN';
}

function allHex(values:readonly (string|'UNKNOWN')[]):boolean{
  return values.every(value=>value!=='UNKNOWN'&&HEX64.test(value));
}

function compareCapabilityProofs(
  left:{capability:string},
  right:{capability:string},
):number{
  return lexical(left.capability,right.capability);
}

function compareProofRefs(
  left:{kind:string;capability:string},
  right:{kind:string;capability:string},
):number{
  return lexical(left.capability,right.capability)||lexical(left.kind,right.kind);
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  code:string,
):Promise<string>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
    if(!HEX64.test(result))throw new Error('invalid hash');
    return result;
  }catch{
    const error=new Error(code);
    (error as Error&{code?:string}).code=code;
    throw error;
  }
}

function validIdentifier(value:string,max:number):boolean{
  return value.length>0&&value.length<=max&&/^[a-z0-9][a-z0-9._:@/-]*$/.test(value);
}
function lexical(left:string,right:string):number{return left<right?-1:left>right?1:0;}

function authorityBoundary(){
  return Object.freeze({
    decisionMutationAllowed:false as const,
    candidateSelectionAllowed:false as const,
    selectedCandidateIdAllowed:false as const,
    reuseAdvanceAllowed:false as const,
    fullStudentEscalationAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    installOrDownloadAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function invalid(
  candidateId:string,
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationReuseCandidateEvidenceAssemblyV1,
    'campaignDigest'|'sourceDecisionSha256'|'sourceCandidateSha256'|'requiredCapabilities'|
    'coveredQualificationCapabilities'|'coveredRejectionCapabilities'|'missingCapabilities'|'proofEvidenceRefs'
  >>={},
):HsmeFoundationReuseCandidateEvidenceAssemblyV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId,
    state:'CANDIDATE_EVIDENCE_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    campaignDigest:values.campaignDigest??'UNKNOWN',
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    sourceCandidateSha256:values.sourceCandidateSha256??'UNKNOWN',
    requiredCapabilities:Object.freeze([...(values.requiredCapabilities??[])]),
    coveredQualificationCapabilities:Object.freeze([...(values.coveredQualificationCapabilities??[])]),
    coveredRejectionCapabilities:Object.freeze([...(values.coveredRejectionCapabilities??[])]),
    missingCapabilities:Object.freeze([...(values.missingCapabilities??[])]),
    proofEvidenceRefs:Object.freeze([...(values.proofEvidenceRefs??[])]),
    assembledCandidateSha256:'UNKNOWN',
    candidateEvidenceSetSha256:'UNKNOWN',
    candidate:null,
    ...authorityBoundary(),
  });
}

function incomplete(
  candidateId:string,
  values:Pick<
    HsmeFoundationReuseCandidateEvidenceAssemblyV1,
    'campaignDigest'|'sourceDecisionSha256'|'sourceCandidateSha256'|'requiredCapabilities'|
    'coveredQualificationCapabilities'|'coveredRejectionCapabilities'|'missingCapabilities'|'proofEvidenceRefs'
  >,
):HsmeFoundationReuseCandidateEvidenceAssemblyV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId,
    state:'CANDIDATE_EVIDENCE_INCOMPLETE',
    blockers:Object.freeze([]),
    campaignDigest:values.campaignDigest,
    sourceDecisionSha256:values.sourceDecisionSha256,
    sourceCandidateSha256:values.sourceCandidateSha256,
    requiredCapabilities:Object.freeze([...values.requiredCapabilities]),
    coveredQualificationCapabilities:Object.freeze([...values.coveredQualificationCapabilities]),
    coveredRejectionCapabilities:Object.freeze([...values.coveredRejectionCapabilities]),
    missingCapabilities:Object.freeze([...values.missingCapabilities]),
    proofEvidenceRefs:Object.freeze([...values.proofEvidenceRefs]),
    assembledCandidateSha256:'UNKNOWN',
    candidateEvidenceSetSha256:'UNKNOWN',
    candidate:null,
    ...authorityBoundary(),
  });
}

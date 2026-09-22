import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseCandidateV1,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseCandidateV1,
  type HsmeFoundationReuseTrainingV1,
} from './HsmeFoundationReuseDecisionV1';
import {
  HSME_FOUNDATION_PENDING_REUSE_APPLIED_CANDIDATE_DIGEST_DOMAIN,
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
  HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA,
  type HsmeFoundationPendingReuseRuntimeApplicationV1,
} from './HsmeFoundationPendingReuseRuntimeApplicationV1';
import {
  HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN,
  HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA,
  type HsmeFoundationPhysicalReuseRuntimeOverlayV1,
} from './HsmeFoundationPhysicalReuseRuntimeOverlayV1';
import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  proveHsmeFoundationBenchmarkCandidateTrustV1,
} from './HsmeFoundationBenchmarkCandidateTrustV1';
import {
  HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
  hsmeFoundationQualityFinalizationV1Digest,
  type HsmeFoundationQualityFinalizationV1,
} from './HsmeFoundationQualityFinalizationV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1' as const;
export const HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1' as const;
export const HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-training-attestation:v1\0' as const;
export const HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:reuse-quality-evidence:v1\0' as const;
export const HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:reuse-qualification-evidence:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const REVISION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
type Capability=typeof CAPABILITIES[number];

export type HsmeFoundationReuseTrainingAttestationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  sourceRoot:string;
  immutableRevision:string;
  sourceContentSha256:string;
  runtimeEvidenceSha256:string;
  targetEvidenceSha256:string;
  mode:HsmeFoundationReuseTrainingV1['mode'];
  trainableParameters:number|'UNKNOWN';
  frozenParameters:number|'UNKNOWN';
  trainingExamples:number|'UNKNOWN';
  gpuSeconds:number|'UNKNOWN';
  trainingCostMicrousd:number|'UNKNOWN';
  productionAuthorityGranted:false;
  trainingAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeFoundationReuseQualityOriginVerifierV1{
  verifyQualityFinalization(
    finalization:HsmeFoundationQualityFinalizationV1,
    expectedFinalizationSha256:string,
  ):Promise<boolean>;
}

export type HsmeFoundationReuseEvidenceQualificationStateV1=
  | 'QUALIFICATION_EVIDENCE_INVALID'
  | 'QUALIFICATION_EVIDENCE_READY';

export type HsmeFoundationReuseEvidenceQualificationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  state:HsmeFoundationReuseEvidenceQualificationStateV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  sourceCandidateSha256:string|'UNKNOWN';
  pendingDecisionSha256:string|'UNKNOWN';
  appliedCandidateSha256:string|'UNKNOWN';
  runtimeEvidenceSha256:string|'UNKNOWN';
  licenseEvidenceSha256:string|'UNKNOWN';
  qualityEvidenceSha256:string|'UNKNOWN';
  trainingEvidenceSha256:string|'UNKNOWN';
  resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE'|'UNKNOWN';
  evidenceSetSha256:string|'UNKNOWN';
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

export class HsmeFoundationReuseEvidenceQualificationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationReuseEvidenceQualificationV1Error';
    this.code=code;
  }
}

export async function hsmeFoundationReuseTrainingAttestationV1Digest(
  raw:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const attestation=normalizeTrainingAttestation(raw);
  return digest(
    HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_DIGEST_DOMAIN,
    attestation,
    hash,
    'QUALIFICATION_TRAINING_HASH_INVALID',
  );
}

export async function qualifyHsmeFoundationReuseEvidenceV1(
  application:HsmeFoundationPendingReuseRuntimeApplicationV1,
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  candidateId:string,
  capability:Capability,
  rawCampaign:unknown,
  rawTrust:unknown,
  qualityFinalization:HsmeFoundationQualityFinalizationV1,
  expectedQualityFinalizationSha256:string,
  qualityOrigin:HsmeFoundationReuseQualityOriginVerifierV1,
  rawTrainingAttestation:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseEvidenceQualificationV1>{
  const blockers:string[]=[];
  if(!validIdentifier(candidateId,120))blockers.push('QUALIFICATION_CANDIDATE_ID_INVALID');
  if(!CAPABILITIES.includes(capability))blockers.push('QUALIFICATION_CAPABILITY_INVALID');
  if(!HEX64.test(expectedQualityFinalizationSha256)){
    blockers.push('QUALITY_FINALIZATION_EXPECTED_DIGEST_INVALID');
  }

  validateApplicationAuthority(application,blockers);
  if(application.schemaVersion!==HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA){
    blockers.push('PENDING_RUNTIME_APPLICATION_SCHEMA_INVALID');
  }
  if(application.state!=='RUNTIME_OVERLAY_APPLIED_PENDING'){
    blockers.push('PENDING_RUNTIME_APPLICATION_NOT_READY');
  }
  if(!Array.isArray(application.blockers)||application.blockers.length!==0){
    blockers.push('PENDING_RUNTIME_APPLICATION_BLOCKERS_PRESENT');
  }
  if(application.candidateId!==candidateId)blockers.push('PENDING_RUNTIME_CANDIDATE_DRIFT');
  if(application.capability!==capability)blockers.push('PENDING_RUNTIME_CAPABILITY_DRIFT');
  if(application.candidate===null||application.pendingDecision===null){
    blockers.push('PENDING_RUNTIME_APPLICATION_PAYLOAD_REQUIRED');
    return invalid(candidateId,capability,blockers);
  }

  const candidate=application.candidate;
  if(candidate.evidenceState!=='UNRESOLVED')blockers.push('QUALIFICATION_SOURCE_MUST_BE_UNRESOLVED');
  if(candidate.rejectionReasons.length!==0)blockers.push('QUALIFICATION_SOURCE_REJECTION_FORBIDDEN');
  if(candidate.candidateId!==candidateId)blockers.push('QUALIFICATION_SOURCE_CANDIDATE_DRIFT');
  if(candidate.licenseConclusion!=='REVIEW_REQUIRED'||candidate.licenseEvidenceSha256!=='UNKNOWN'){
    blockers.push('QUALIFICATION_SOURCE_LICENSE_MUST_BE_UNRESOLVED');
  }
  if(candidate.quality.status!=='UNKNOWN'||candidate.quality.evidenceSha256!=='UNKNOWN'){
    blockers.push('QUALIFICATION_SOURCE_QUALITY_MUST_BE_UNRESOLVED');
  }
  if(candidate.training.evidenceSha256!=='UNKNOWN'){
    blockers.push('QUALIFICATION_SOURCE_TRAINING_EVIDENCE_MUST_BE_UNRESOLVED');
  }

  let pendingDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    pendingDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(application.pendingDecision,hash);
    if(pendingDecisionSha256!==application.pendingDecisionSha256){
      blockers.push('PENDING_DECISION_DIGEST_MISMATCH');
    }
  }catch{
    blockers.push('PENDING_DECISION_DIGEST_INVALID');
  }

  const pendingRows=application.pendingDecision.candidates.filter(value=>value.candidateId===candidateId);
  if(pendingRows.length!==1||JSON.stringify(pendingRows[0])!==JSON.stringify(candidate)){
    blockers.push('PENDING_DECISION_CANDIDATE_BINDING_MISMATCH');
  }

  const appliedCandidateSha256=await digest(
    HSME_FOUNDATION_PENDING_REUSE_APPLIED_CANDIDATE_DIGEST_DOMAIN,
    candidate,
    hash,
    'APPLIED_CANDIDATE_REHASH_INVALID',
  );
  if(appliedCandidateSha256!==application.appliedCandidateSha256){
    blockers.push('APPLIED_CANDIDATE_REHASH_MISMATCH');
  }

  let sourceCandidateSha256:string|'UNKNOWN'='UNKNOWN';
  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    const sourceCandidate=normalizeHsmeFoundationReuseCandidateV1({
      ...candidate,
      runtime:unresolvedRuntime(),
    });
    sourceCandidateSha256=await digest(
      HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
      sourceCandidate,
      hash,
      'SOURCE_CANDIDATE_REHASH_INVALID',
    );
    if(sourceCandidateSha256!==application.sourceCandidateSha256){
      blockers.push('SOURCE_CANDIDATE_REHASH_MISMATCH');
    }
    const sourceDecisionRaw={
      ...application.pendingDecision,
      decisionStatus:'EVALUATION_PENDING' as const,
      candidates:application.pendingDecision.candidates.map(value=>
        value.candidateId===candidateId?sourceCandidate:value
      ),
    };
    delete (sourceDecisionRaw as {selectedCandidateId?:string}).selectedCandidateId;
    const sourceDecision=normalizeHsmeFoundationReuseDecisionV1(sourceDecisionRaw);
    sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(sourceDecision,hash);
    if(sourceDecisionSha256!==application.sourceDecisionSha256){
      blockers.push('SOURCE_DECISION_REHASH_MISMATCH');
    }
  }catch{
    blockers.push('SOURCE_PROVENANCE_REHASH_INVALID');
  }

  validateOverlay(overlay,candidateId,capability,application.runtimeEvidenceSha256,blockers);
  const runtimeEvidenceSha256=await rehashRuntimeOverlay(overlay,hash,blockers);
  if(runtimeEvidenceSha256!==null&&runtimeEvidenceSha256!==overlay.runtimeEvidenceSha256){
    blockers.push('QUALIFICATION_RUNTIME_REHASH_MISMATCH');
  }
  if(candidate.runtime.evidenceSha256!==overlay.runtimeEvidenceSha256){
    blockers.push('QUALIFICATION_CANDIDATE_RUNTIME_DIGEST_DRIFT');
  }
  if(candidate.runtime.backboneBytes!==overlay.backboneBytes
    ||candidate.runtime.conditionerBytes!==overlay.conditionerBytes
    ||candidate.runtime.vaeBytes!==overlay.vaeBytes
    ||candidate.runtime.adapterBytes!==overlay.adapterBytes
    ||candidate.runtime.otherRequiredBytes!==overlay.otherRequiredBytes
    ||candidate.runtime.mandatoryInstalledBytes!==overlay.mandatoryInstalledBytes
    ||candidate.runtime.workingMemoryBytes!==overlay.workingMemoryBytes){
    blockers.push('QUALIFICATION_CANDIDATE_RUNTIME_DRIFT');
  }

  let campaign;
  let trustBundle;
  let trustProof;
  try{
    campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
    trustBundle=normalizeHsmeFoundationBenchmarkCandidateTrustV1(rawTrust);
    trustProof=await proveHsmeFoundationBenchmarkCandidateTrustV1(rawCampaign,rawTrust,hash);
  }catch{
    blockers.push('QUALIFICATION_TRUST_PROOF_INVALID');
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256,
      pendingDecisionSha256,
      appliedCandidateSha256,
      runtimeEvidenceSha256:valueOrUnknown(overlay.runtimeEvidenceSha256),
    });
  }

  if(trustProof.state!=='PINNED')blockers.push('QUALIFICATION_TRUST_NOT_PINNED');
  if(trustProof.productionAuthorityGranted!==false||trustProof.winnerSelectionAllowed!==false){
    blockers.push('QUALIFICATION_TRUST_AUTHORITY_WIDENING');
  }

  const campaignCandidates=campaign.candidates.filter(value=>value.candidateId===candidateId);
  const trustEntries=trustBundle.candidates.filter(value=>value.candidateId===candidateId);
  const proofEntries=trustProof.entries.filter(value=>value.candidateId===candidateId);
  if(campaignCandidates.length!==1)blockers.push('QUALIFICATION_CAMPAIGN_CANDIDATE_LOOKUP_INVALID');
  if(trustEntries.length!==1)blockers.push('QUALIFICATION_TRUST_ENTRY_LOOKUP_INVALID');
  if(proofEntries.length!==1)blockers.push('QUALIFICATION_TRUST_PROOF_ENTRY_LOOKUP_INVALID');

  const campaignCandidate=campaignCandidates[0];
  const trustEntry=trustEntries[0];
  const proofEntry=proofEntries[0];
  if(campaignCandidate&&trustEntry&&proofEntry){
    if(!campaignCandidate.capabilities.includes(capability)){
      blockers.push('QUALIFICATION_CAPABILITY_NOT_PROVEN');
    }
    if(campaignCandidate.sourceRoot!==candidate.source.sourceRoot
      ||campaignCandidate.immutableRevision!==candidate.source.immutableRevision
      ||campaignCandidate.modelContentSha256!==candidate.source.contentSha256){
      blockers.push('QUALIFICATION_SOURCE_TRUST_DRIFT');
    }
    if(proofEntry.modelContentSha256!==candidate.source.contentSha256){
      blockers.push('QUALIFICATION_MODEL_CONTENT_DRIFT');
    }
    if(proofEntry.executionProfileSha256!==overlay.sourceExecutionProfileSha256
      ||campaignCandidate.executionProfileSha256!==overlay.sourceExecutionProfileSha256){
      blockers.push('QUALIFICATION_EXECUTION_PROFILE_DRIFT');
    }
    if(proofEntry.rightsEvidenceSha256==='UNKNOWN'
      ||campaignCandidate.rightsEvidenceSha256!==proofEntry.rightsEvidenceSha256){
      blockers.push('QUALIFICATION_LICENSE_EVIDENCE_DRIFT');
    }
    if(proofEntry.benchmarkRunnable!==true)blockers.push('QUALIFICATION_TRUST_NOT_RUNNABLE');
    if(trustEntry.rightsReview.reviewState!=='REVIEWED'
      ||trustEntry.rightsReview.commercialUseConclusion!=='COMMERCIAL_ADMISSIBLE'
      ||campaignCandidate.rightsState!=='REVIEWED_COMMERCIAL'){
      blockers.push('QUALIFICATION_LICENSE_NOT_COMMERCIAL');
    }
  }

  const qualityEvidenceSha256=await validateQuality(
    candidate,capability,campaign.campaignId,qualityFinalization,
    expectedQualityFinalizationSha256,qualityOrigin,hash,blockers,
  );

  let trainingEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let trainingAttestation:HsmeFoundationReuseTrainingAttestationV1|null=null;
  try{
    trainingAttestation=normalizeTrainingAttestation(rawTrainingAttestation);
    validateTrainingAttestation(candidate,capability,overlay,trainingAttestation,blockers);
    trainingEvidenceSha256=await digest(
      HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_DIGEST_DOMAIN,
      trainingAttestation,
      hash,
      'QUALIFICATION_TRAINING_HASH_INVALID',
    );
    if(trainingEvidenceSha256==='UNKNOWN'){
      blockers.push('QUALIFICATION_TRAINING_EVIDENCE_INVALID');
    }
  }catch{
    blockers.push('QUALIFICATION_TRAINING_ATTESTATION_INVALID');
  }

  if(blockers.length>0||qualityEvidenceSha256===null||trainingAttestation===null){
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256,
      runtimeEvidenceSha256:valueOrUnknown(overlay.runtimeEvidenceSha256),
      licenseEvidenceSha256:valueOrUnknown(proofEntries[0]?.rightsEvidenceSha256??'UNKNOWN'),
      qualityEvidenceSha256:qualityEvidenceSha256??'UNKNOWN',
      trainingEvidenceSha256,
    });
  }

  const licenseEvidenceSha256=proofEntries[0]?.rightsEvidenceSha256??'UNKNOWN';
  const evidenceSetSha256=await digest(
    HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
      candidateId,
      capability,
      sourceDecisionSha256,
      sourceCandidateSha256,
      runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
      licenseEvidenceSha256,
      qualityEvidenceSha256,
      trainingEvidenceSha256,
      resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE',
      decisionMutationAllowed:false,
      candidateSelectionAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      trainingOrDistillationAllowed:false,
      winnerSelectionAllowed:false,
    },
    hash,
    'QUALIFICATION_EVIDENCE_SET_HASH_INVALID',
  );

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
    candidateId,
    capability,
    state:'QUALIFICATION_EVIDENCE_READY',
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    sourceCandidateSha256,
    runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
    licenseEvidenceSha256,
    qualityEvidenceSha256,
    trainingEvidenceSha256,
    resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE',
    evidenceSetSha256,
    ...authorityBoundary(),
  });
}

async function validateQuality(
  candidate:HsmeFoundationReuseCandidateV1,
  capability:Capability,
  campaignId:string,
  finalization:HsmeFoundationQualityFinalizationV1,
  expectedSha256:string,
  origin:HsmeFoundationReuseQualityOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<string|null>{
  if(finalization.schemaVersion!==HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA){
    blockers.push('QUALITY_FINALIZATION_SCHEMA_INVALID');
  }
  if(finalization.campaignId!==campaignId)blockers.push('QUALITY_FINALIZATION_CAMPAIGN_DRIFT');
  if(finalization.qualityEvidenceFrozen!==true
    ||finalization.efficiencyUsedInQualitySelection!==false
    ||finalization.productionAuthorityGranted!==false
    ||finalization.providerAuthorityGranted!==false
    ||finalization.billingAuthorityGranted!==false
    ||finalization.projectArtifactMutationAllowed!==false
    ||finalization.aeeExecutionAuthorityGranted!==false
    ||finalization.durableModelFleetPromotionAllowed!==false
    ||finalization.trainingOrDistillationAllowed!==false
    ||finalization.winnerSelectionAllowed!==false){
    blockers.push('QUALITY_FINALIZATION_AUTHORITY_OR_FREEZE_INVALID');
  }
  if(finalization.finalizationState==='FAILED_EVIDENCE'){
    blockers.push('QUALITY_FINALIZATION_FAILED');
  }

  let actualSha256:string|null=null;
  try{
    actualSha256=await hsmeFoundationQualityFinalizationV1Digest(finalization,hash);
    if(actualSha256!==expectedSha256)blockers.push('QUALITY_FINALIZATION_DIGEST_DRIFT');
  }catch{
    blockers.push('QUALITY_FINALIZATION_DIGEST_INVALID');
  }

  let trusted=false;
  if(actualSha256!==null&&actualSha256===expectedSha256){
    try{
      trusted=await origin.verifyQualityFinalization(finalization,expectedSha256);
    }catch{
      trusted=false;
    }
  }
  if(!trusted)blockers.push('QUALITY_FINALIZATION_ORIGIN_UNVERIFIED');

  const rows=Array.isArray(finalization.rows)
    ?finalization.rows.filter(row=>row.candidateId===candidate.candidateId&&row.capability===capability)
    :[];
  if(rows.length!==1){
    blockers.push(rows.length===0?'QUALITY_FINALIZATION_ROW_MISSING':'QUALITY_FINALIZATION_ROW_DUPLICATE');
    return null;
  }
  const row=rows[0];
  if(row.qualityState!=='QUALITY_FLOOR_PASS')blockers.push('QUALITY_FLOOR_NOT_PROVEN');
  if(row.outputSetSha256==='UNKNOWN'||!HEX64.test(row.outputSetSha256)){
    blockers.push('QUALITY_OUTPUT_SET_DIGEST_INVALID');
  }
  if(!Array.isArray(row.dimensionResults)||row.dimensionResults.length<1
    ||row.dimensionResults.some(value=>value.passesFloor!==true||!HEX64.test(value.evidenceSha256))){
    blockers.push('QUALITY_DIMENSION_EVIDENCE_INVALID');
  }
  if(actualSha256===null)return null;
  const qualityEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN,
    {
      candidateId:candidate.candidateId,
      capability,
      qualityFinalizationSha256:actualSha256,
      row,
    },
    hash,
    'QUALIFICATION_QUALITY_HASH_INVALID',
  );
  return qualityEvidenceSha256;
}

function normalizeTrainingAttestation(raw:unknown):HsmeFoundationReuseTrainingAttestationV1{
  const record=exactRecord(raw,[
    'schemaVersion','candidateId','capability','sourceRoot','immutableRevision','sourceContentSha256',
    'runtimeEvidenceSha256','targetEvidenceSha256',
    'mode','trainableParameters','frozenParameters','trainingExamples','gpuSeconds','trainingCostMicrousd',
    'productionAuthorityGranted','trainingAuthorityGranted','winnerSelectionAllowed',
  ]);
  if(record.schemaVersion!==HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA){
    fail('training_attestation_schema','training attestation schema invalid');
  }
  const capability=record.capability as Capability;
  if(!CAPABILITIES.includes(capability))fail('training_attestation_capability','capability invalid');
  const mode=record.mode as HsmeFoundationReuseTrainingV1['mode'];
  if(!['ZERO_TRAINING','LORA','PROJECTOR_BRIDGE','REPRESENTATION_DISTILLATION','PARTIAL_UNFREEZE'].includes(mode)){
    fail('training_attestation_mode','training mode invalid');
  }
  if(record.productionAuthorityGranted!==false
    ||record.trainingAuthorityGranted!==false
    ||record.winnerSelectionAllowed!==false){
    fail('training_attestation_authority','training attestation authority must remain false');
  }
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA,
    candidateId:text(record.candidateId,120),
    capability,
    sourceRoot:text(record.sourceRoot,240),
    immutableRevision:revision(record.immutableRevision),
    sourceContentSha256:sha256(record.sourceContentSha256),
    runtimeEvidenceSha256:sha256(record.runtimeEvidenceSha256),
    targetEvidenceSha256:sha256(record.targetEvidenceSha256),
    mode,
    trainableParameters:unknownOrInteger(record.trainableParameters),
    frozenParameters:unknownOrInteger(record.frozenParameters),
    trainingExamples:unknownOrInteger(record.trainingExamples),
    gpuSeconds:unknownOrInteger(record.gpuSeconds),
    trainingCostMicrousd:unknownOrInteger(record.trainingCostMicrousd),
    productionAuthorityGranted:false,
    trainingAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function validateTrainingAttestation(
  candidate:HsmeFoundationReuseCandidateV1,
  capability:Capability,
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  attestation:HsmeFoundationReuseTrainingAttestationV1,
  blockers:string[],
):void{
  if(attestation.candidateId!==candidate.candidateId||attestation.capability!==capability){
    blockers.push('QUALIFICATION_TRAINING_IDENTITY_DRIFT');
  }
  if(attestation.sourceRoot!==candidate.source.sourceRoot
    ||attestation.immutableRevision!==candidate.source.immutableRevision
    ||attestation.sourceContentSha256!==candidate.source.contentSha256){
    blockers.push('QUALIFICATION_TRAINING_SOURCE_DRIFT');
  }
  if(attestation.runtimeEvidenceSha256!==overlay.runtimeEvidenceSha256
    ||attestation.targetEvidenceSha256!==overlay.targetEvidenceSha256){
    blockers.push('QUALIFICATION_TRAINING_TARGET_DRIFT');
  }
  const training=candidate.training;
  if(attestation.mode!==training.mode
    ||attestation.trainableParameters!==training.trainableParameters
    ||attestation.frozenParameters!==training.frozenParameters
    ||attestation.trainingExamples!==training.trainingExamples
    ||attestation.gpuSeconds!==training.gpuSeconds
    ||attestation.trainingCostMicrousd!==training.trainingCostMicrousd){
    blockers.push('QUALIFICATION_TRAINING_BLOCK_DRIFT');
  }
  if(candidate.strategy==='DIRECT_FOUNDATION'){
    if(training.mode!=='ZERO_TRAINING'
      ||training.trainableParameters!==0
      ||training.trainingExamples!==0
      ||training.gpuSeconds!==0
      ||training.trainingCostMicrousd!==0){
      blockers.push('QUALIFICATION_DIRECT_ZERO_TRAINING_REQUIRED');
    }
  }else if(candidate.strategy==='FROZEN_FOUNDATION_ADAPTATION'){
    if(training.mode==='ZERO_TRAINING'
      ||training.trainableParameters==='UNKNOWN'
      ||training.frozenParameters==='UNKNOWN'
      ||training.trainableParameters<1
      ||training.frozenParameters<1
      ||training.trainableParameters>=training.frozenParameters){
      blockers.push('QUALIFICATION_BOUNDED_ADAPTATION_TRAINING_REQUIRED');
    }
  }else{
    blockers.push('QUALIFICATION_REUSE_STRATEGY_INVALID');
  }
}

function unresolvedRuntime(){
  return Object.freeze({
    backboneBytes:'UNKNOWN' as const,
    conditionerBytes:'UNKNOWN' as const,
    vaeBytes:'UNKNOWN' as const,
    adapterBytes:'UNKNOWN' as const,
    otherRequiredBytes:'UNKNOWN' as const,
    mandatoryInstalledBytes:'UNKNOWN' as const,
    workingMemoryBytes:'UNKNOWN' as const,
    evidenceSha256:'UNKNOWN' as const,
  });
}

function validateApplicationAuthority(
  application:HsmeFoundationPendingReuseRuntimeApplicationV1,
  blockers:string[],
):void{
  if(application.candidateQualificationAllowed!==false
    ||application.selectedCandidateIdAllowed!==false
    ||application.decisionStatusMutationAllowed!==false
    ||application.strategyMutationAllowed!==false
    ||application.licenseMutationAllowed!==false
    ||application.qualityMutationAllowed!==false
    ||application.trainingMutationAllowed!==false
    ||application.reuseAdvanceAllowed!==false
    ||application.fullStudentEscalationAllowed!==false
    ||application.modelFleetPromotionAllowed!==false
    ||application.installOrDownloadAllowed!==false
    ||application.productionAuthorityGranted!==false
    ||application.providerAuthorityGranted!==false
    ||application.billingAuthorityGranted!==false
    ||application.projectArtifactMutationAllowed!==false
    ||application.aeeExecutionAuthorityGranted!==false
    ||application.durableModelFleetPromotionAllowed!==false
    ||application.trainingOrDistillationAllowed!==false
    ||application.winnerSelectionAllowed!==false){
    blockers.push('PENDING_RUNTIME_APPLICATION_AUTHORITY_WIDENING');
  }
}

function validateOverlay(
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  candidateId:string,
  capability:Capability,
  applicationRuntimeSha256:string|'UNKNOWN',
  blockers:string[],
):void{
  if(overlay.schemaVersion!==HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA){
    blockers.push('QUALIFICATION_RUNTIME_OVERLAY_SCHEMA_INVALID');
  }
  if(overlay.state!=='PHYSICAL_RUNTIME_EVIDENCE_READY'
    ||!Array.isArray(overlay.blockers)||overlay.blockers.length!==0){
    blockers.push('QUALIFICATION_RUNTIME_OVERLAY_NOT_READY');
  }
  if(overlay.candidateId!==candidateId||overlay.capability!==capability){
    blockers.push('QUALIFICATION_RUNTIME_OVERLAY_IDENTITY_DRIFT');
  }
  if(overlay.targetTier!=='MOBILE_DEFAULT')blockers.push('QUALIFICATION_RUNTIME_MOBILE_REQUIRED');
  if(overlay.runtimeEvidenceSha256==='UNKNOWN'||!HEX64.test(overlay.runtimeEvidenceSha256)
    ||overlay.runtimeEvidenceSha256!==applicationRuntimeSha256){
    blockers.push('QUALIFICATION_RUNTIME_APPLICATION_DIGEST_DRIFT');
  }
  for(const digestValue of [
    overlay.componentMapSha256,overlay.physicalTargetBindingSha256,
    overlay.targetEvidenceSha256,overlay.sourceExecutionProfileSha256,
  ]){
    if(digestValue==='UNKNOWN'||!HEX64.test(digestValue)){
      blockers.push('QUALIFICATION_RUNTIME_BINDING_DIGEST_INVALID');
    }
  }
  if(overlay.selectedCandidateIdAllowed!==false
    ||overlay.reuseAdvanceAllowed!==false
    ||overlay.fullStudentEscalationAllowed!==false
    ||overlay.modelFleetPromotionAllowed!==false
    ||overlay.installOrDownloadAllowed!==false
    ||overlay.productionAuthorityGranted!==false
    ||overlay.providerAuthorityGranted!==false
    ||overlay.billingAuthorityGranted!==false
    ||overlay.projectArtifactMutationAllowed!==false
    ||overlay.aeeExecutionAuthorityGranted!==false
    ||overlay.durableModelFleetPromotionAllowed!==false
    ||overlay.trainingOrDistillationAllowed!==false
    ||overlay.winnerSelectionAllowed!==false
    ||overlay.licenseMutationAllowed!==false
    ||overlay.qualityMutationAllowed!==false
    ||overlay.trainingEvidenceMutationAllowed!==false
    ||overlay.decisionMutationAllowed!==false){
    blockers.push('QUALIFICATION_RUNTIME_AUTHORITY_WIDENING');
  }
}

async function rehashRuntimeOverlay(
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<string|null>{
  try{
    return await digest(
      HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN,
      {
        schemaVersion:HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA,
        candidateId:overlay.candidateId,
        capability:overlay.capability,
        targetTier:overlay.targetTier,
        backboneBytes:overlay.backboneBytes,
        conditionerBytes:overlay.conditionerBytes,
        vaeBytes:overlay.vaeBytes,
        adapterBytes:overlay.adapterBytes,
        otherRequiredBytes:overlay.otherRequiredBytes,
        mandatoryInstalledBytes:overlay.mandatoryInstalledBytes,
        workingMemoryBytes:overlay.workingMemoryBytes,
        componentMapSha256:overlay.componentMapSha256,
        physicalTargetBindingSha256:overlay.physicalTargetBindingSha256,
        targetEvidenceSha256:overlay.targetEvidenceSha256,
        sourceExecutionProfileSha256:overlay.sourceExecutionProfileSha256,
        selectedCandidateIdAllowed:false,
        reuseAdvanceAllowed:false,
        fullStudentEscalationAllowed:false,
        productionAuthorityGranted:false,
        trainingOrDistillationAllowed:false,
        winnerSelectionAllowed:false,
      },
      hash,
      'QUALIFICATION_RUNTIME_REHASH_INVALID',
    );
  }catch{
    blockers.push('QUALIFICATION_RUNTIME_REHASH_INVALID');
    return null;
  }
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  code:string,
):Promise<string>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
    if(!HEX64.test(result))throw new Error('hash invalid');
    return result;
  }catch{
    fail(code,'hash port returned invalid digest');
  }
}

function exactRecord(raw:unknown,keys:readonly string[]):Record<string,unknown>{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))fail('record_invalid','record invalid');
  const record=raw as Record<string,unknown>;
  const actual=Object.keys(record).sort();
  const expected=[...keys].sort();
  if(actual.length!==expected.length||!actual.every((key,index)=>key===expected[index])){
    fail('record_shape_invalid','record shape invalid');
  }
  return record;
}

function unknownOrInteger(value:unknown):number|'UNKNOWN'{
  if(value==='UNKNOWN')return 'UNKNOWN';
  if(!Number.isSafeInteger(value)||Number(value)<0)fail('integer_invalid','integer invalid');
  return Number(value);
}

function sha256(value:unknown):string{
  if(typeof value!=='string'||!HEX64.test(value))fail('sha_invalid','sha invalid');
  return value;
}

function revision(value:unknown):string{
  if(typeof value!=='string'||!REVISION.test(value))fail('revision_invalid','revision invalid');
  return value;
}

function text(value:unknown,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value)){
    fail('text_invalid','text invalid');
  }
  return value;
}

function validIdentifier(value:string,max:number):boolean{
  return value.length>0&&value.length<=max&&/^[a-z0-9][a-z0-9._:@/-]*$/.test(value);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return value!=='UNKNOWN'&&HEX64.test(value)?value:'UNKNOWN';
}

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
  capability:Capability,
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationReuseEvidenceQualificationV1,
    'sourceDecisionSha256'|'sourceCandidateSha256'|'pendingDecisionSha256'|'appliedCandidateSha256'|'runtimeEvidenceSha256'|
    'licenseEvidenceSha256'|'qualityEvidenceSha256'|'trainingEvidenceSha256'|
    'resolvedLicenseConclusion'|'evidenceSetSha256'
  >>={},
):HsmeFoundationReuseEvidenceQualificationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
    candidateId,
    capability,
    state:'QUALIFICATION_EVIDENCE_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    sourceCandidateSha256:values.sourceCandidateSha256??'UNKNOWN',
    pendingDecisionSha256:values.pendingDecisionSha256??'UNKNOWN',
    appliedCandidateSha256:values.appliedCandidateSha256??'UNKNOWN',
    runtimeEvidenceSha256:values.runtimeEvidenceSha256??'UNKNOWN',
    licenseEvidenceSha256:values.licenseEvidenceSha256??'UNKNOWN',
    qualityEvidenceSha256:values.qualityEvidenceSha256??'UNKNOWN',
    trainingEvidenceSha256:values.trainingEvidenceSha256??'UNKNOWN',
    resolvedLicenseConclusion:values.resolvedLicenseConclusion??'UNKNOWN',
    evidenceSetSha256:values.evidenceSetSha256??'UNKNOWN',
    ...authorityBoundary(),
  });
}

function fail(code:string,message:string):never{
  throw new HsmeFoundationReuseEvidenceQualificationV1Error(code,message);
}

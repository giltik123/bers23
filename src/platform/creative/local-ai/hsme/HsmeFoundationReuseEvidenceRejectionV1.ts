import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseCandidateV1,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseRuntimeV1,
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
  hsmeFoundationBenchmarkCampaignV1Digest,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  hsmeFoundationBenchmarkArtifactManifestDigestV1,
  hsmeFoundationBenchmarkExecutionProfileDigestV1,
  hsmeFoundationBenchmarkRightsReviewDigestV1,
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
} from './HsmeFoundationBenchmarkCandidateTrustV1';
import {
  HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
  hsmeFoundationQualityFinalizationV1Digest,
  type HsmeFoundationQualityFinalizationV1,
} from './HsmeFoundationQualityFinalizationV1';
import {
  HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN,
  type HsmeFoundationReuseQualityOriginVerifierV1,
} from './HsmeFoundationReuseEvidenceQualificationV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1' as const;
export const HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:reuse-rejection-evidence:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
type Capability=typeof CAPABILITIES[number];

export type HsmeFoundationReuseEvidenceRejectionStateV1=
  | 'REJECTION_EVIDENCE_INVALID'
  | 'REJECTION_EVIDENCE_READY';

export type HsmeFoundationReuseEvidenceRejectionV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  state:HsmeFoundationReuseEvidenceRejectionStateV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  sourceCandidateSha256:string|'UNKNOWN';
  pendingDecisionSha256:string|'UNKNOWN';
  appliedCandidateSha256:string|'UNKNOWN';
  runtimeEvidenceSha256:string|'UNKNOWN';
  runtimeComponentMapSha256:string|'UNKNOWN';
  sourceExecutionProfileSha256:string|'UNKNOWN';
  runtime:HsmeFoundationReuseRuntimeV1|null;
  licenseEvidenceSha256:string|'UNKNOWN';
  qualityFinalizationSha256:string|'UNKNOWN';
  qualityEvidenceSha256:string|'UNKNOWN';
  qualityOutcome:'PASS'|'FAIL'|'UNKNOWN';
  resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE'|'NON_COMMERCIAL'|'UNKNOWN';
  derivedRejectionReasons:readonly string[];
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

export async function proveHsmeFoundationReuseEvidenceRejectionV1(
  application:HsmeFoundationPendingReuseRuntimeApplicationV1,
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  candidateId:string,
  capability:Capability,
  rawCampaign:unknown,
  rawTrust:unknown,
  qualityFinalization:HsmeFoundationQualityFinalizationV1,
  expectedQualityFinalizationSha256:string,
  qualityOrigin:HsmeFoundationReuseQualityOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseEvidenceRejectionV1>{
  const blockers:string[]=[];
  const hard:string[]=[];
  if(!validIdentifier(candidateId,120))blockers.push('REJECTION_CANDIDATE_ID_INVALID');
  if(!CAPABILITIES.includes(capability))blockers.push('REJECTION_CAPABILITY_INVALID');
  if(!HEX64.test(expectedQualityFinalizationSha256)){
    blockers.push('REJECTION_QUALITY_EXPECTED_DIGEST_INVALID');
  }

  validateApplication(application,candidateId,capability,blockers);
  if(application.candidate===null||application.pendingDecision===null){
    return invalid(candidateId,capability,[...blockers,'REJECTION_APPLICATION_PAYLOAD_REQUIRED']);
  }
  const candidate=application.candidate;
  if(candidate.evidenceState!=='UNRESOLVED'||candidate.rejectionReasons.length!==0){
    blockers.push('REJECTION_SOURCE_CANDIDATE_NOT_UNRESOLVED');
  }
  if(candidate.licenseConclusion!=='REVIEW_REQUIRED'||candidate.licenseEvidenceSha256!=='UNKNOWN'){
    blockers.push('REJECTION_SOURCE_LICENSE_MUST_BE_UNRESOLVED');
  }
  if(candidate.quality.status!=='UNKNOWN'||candidate.quality.evidenceSha256!=='UNKNOWN'){
    blockers.push('REJECTION_SOURCE_QUALITY_MUST_BE_UNRESOLVED');
  }

  let pendingDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    pendingDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(application.pendingDecision,hash);
    if(pendingDecisionSha256!==application.pendingDecisionSha256){
      blockers.push('REJECTION_PENDING_DECISION_DIGEST_MISMATCH');
    }
  }catch{
    blockers.push('REJECTION_PENDING_DECISION_DIGEST_INVALID');
  }
  const pendingCandidate=application.pendingDecision.candidates.filter(value=>value.candidateId===candidateId);
  if(pendingCandidate.length!==1||JSON.stringify(pendingCandidate[0])!==JSON.stringify(candidate)){
    blockers.push('REJECTION_PENDING_CANDIDATE_BINDING_MISMATCH');
  }
  const appliedCandidateSha256=await digest(
    HSME_FOUNDATION_PENDING_REUSE_APPLIED_CANDIDATE_DIGEST_DOMAIN,
    candidate,hash,'REJECTION_APPLIED_CANDIDATE_HASH_INVALID',
  );
  if(appliedCandidateSha256!==application.appliedCandidateSha256){
    blockers.push('REJECTION_APPLIED_CANDIDATE_HASH_MISMATCH');
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
      sourceCandidate,hash,'REJECTION_SOURCE_CANDIDATE_HASH_INVALID',
    );
    if(sourceCandidateSha256!==application.sourceCandidateSha256){
      blockers.push('REJECTION_SOURCE_CANDIDATE_HASH_MISMATCH');
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
      blockers.push('REJECTION_SOURCE_DECISION_HASH_MISMATCH');
    }
  }catch{
    blockers.push('REJECTION_SOURCE_PROVENANCE_REHASH_INVALID');
  }

  validateOverlay(overlay,candidateId,capability,application.runtimeEvidenceSha256,blockers);
  const runtimeEvidenceSha256=await rehashRuntimeOverlay(overlay,hash,blockers);
  if(runtimeEvidenceSha256!==null&&runtimeEvidenceSha256!==overlay.runtimeEvidenceSha256){
    blockers.push('REJECTION_RUNTIME_REHASH_MISMATCH');
  }
  if(candidate.runtime.evidenceSha256!==overlay.runtimeEvidenceSha256
    ||candidate.runtime.mandatoryInstalledBytes!==overlay.mandatoryInstalledBytes
    ||candidate.runtime.workingMemoryBytes!==overlay.workingMemoryBytes){
    blockers.push('REJECTION_CANDIDATE_RUNTIME_DRIFT');
  }

  if(overlay.mandatoryInstalledBytes!=='UNKNOWN'
    &&overlay.mandatoryInstalledBytes>application.pendingDecision.mobileInstalledBudgetBytes){
    hard.push('MOBILE_INSTALLED_BUDGET_EXCEEDED');
  }
  if(overlay.workingMemoryBytes!=='UNKNOWN'
    &&overlay.workingMemoryBytes>application.pendingDecision.mobileWorkingMemoryBudgetBytes){
    hard.push('MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED');
  }

  let licenseEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE'|'NON_COMMERCIAL'|'UNKNOWN'='UNKNOWN';
  let campaignId:string|null=null;
  try{
    const campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
    campaignId=campaign.campaignId;
    const trust=normalizeHsmeFoundationBenchmarkCandidateTrustV1(rawTrust);
    const campaignSha=await hsmeFoundationBenchmarkCampaignV1Digest(campaign,hash);
    if(trust.campaignId!==campaign.campaignId||trust.campaignDigest!==campaignSha){
      blockers.push('REJECTION_TRUST_CAMPAIGN_BINDING_INVALID');
    }
    const campaignRows=campaign.candidates.filter(value=>value.candidateId===candidateId);
    const trustRows=trust.candidates.filter(value=>value.candidateId===candidateId);
    if(campaignRows.length!==1)blockers.push('REJECTION_CAMPAIGN_CANDIDATE_LOOKUP_INVALID');
    if(trustRows.length!==1)blockers.push('REJECTION_TRUST_CANDIDATE_LOOKUP_INVALID');
    const campaignRow=campaignRows[0];
    const trustRow=trustRows[0];
    if(campaignRow&&trustRow){
      if(!campaignRow.capabilities.includes(capability))blockers.push('REJECTION_CAPABILITY_NOT_BOUND');
      if(campaignRow.sourceRoot!==candidate.source.sourceRoot
        ||campaignRow.immutableRevision!==candidate.source.immutableRevision
        ||trustRow.artifactManifest.primarySource.sourceRoot!==candidate.source.sourceRoot
        ||trustRow.artifactManifest.primarySource.immutableRevision!==candidate.source.immutableRevision){
        blockers.push('REJECTION_SOURCE_TRUST_DRIFT');
      }

      if(trustRow.artifactManifest.state==='PINNED'){
        const modelSha=await hsmeFoundationBenchmarkArtifactManifestDigestV1(trustRow.artifactManifest,hash);
        if(modelSha!==candidate.source.contentSha256
          ||campaignRow.modelContentSha256!=='UNKNOWN'&&campaignRow.modelContentSha256!==modelSha){
          blockers.push('REJECTION_MODEL_CONTENT_DRIFT');
        }
        if(trustRow.executionProfile.state!=='PINNED'){
          blockers.push('REJECTION_EXECUTION_PROFILE_NOT_PINNED');
        }else{
          const profileSha=await hsmeFoundationBenchmarkExecutionProfileDigestV1(trustRow.executionProfile,hash);
          if(profileSha!==overlay.sourceExecutionProfileSha256
            ||campaignRow.executionProfileSha256!=='UNKNOWN'&&campaignRow.executionProfileSha256!==profileSha){
            blockers.push('REJECTION_EXECUTION_PROFILE_DRIFT');
          }
        }
      }else{
        blockers.push('REJECTION_ARTIFACT_MANIFEST_NOT_PINNED');
      }

      if(trustRow.rightsReview.reviewState==='REVIEWED'){
        const rightsSha=await hsmeFoundationBenchmarkRightsReviewDigestV1(trustRow.rightsReview,hash);
        licenseEvidenceSha256=rightsSha;
        if(campaignRow.rightsEvidenceSha256!=='UNKNOWN'
          &&campaignRow.rightsEvidenceSha256!==rightsSha){
          blockers.push('REJECTION_CAMPAIGN_RIGHTS_DIGEST_DRIFT');
        }
        if(trustRow.rightsReview.artifactManifestDigest!==candidate.source.contentSha256){
          blockers.push('REJECTION_RIGHTS_MODEL_BINDING_DRIFT');
        }
        if(trustRow.rightsReview.commercialUseConclusion==='REJECTED'){
          resolvedLicenseConclusion='NON_COMMERCIAL';
          hard.push('LICENSE_NON_COMMERCIAL');
        }else if(trustRow.rightsReview.commercialUseConclusion==='COMMERCIAL_ADMISSIBLE'){
          resolvedLicenseConclusion='COMMERCIAL_ADMISSIBLE';
        }else if(trustRow.rightsReview.commercialUseConclusion==='COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS'){
          blockers.push('REJECTION_LICENSE_OBLIGATIONS_UNRESOLVED');
        }else{
          blockers.push('REJECTION_LICENSE_REVIEW_UNRESOLVED');
        }
      }else{
        blockers.push('REJECTION_LICENSE_REVIEW_UNRESOLVED');
      }
    }
  }catch{
    blockers.push('REJECTION_TRUST_EVIDENCE_INVALID');
  }

  let qualityFinalizationSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    qualityFinalizationSha256=await hsmeFoundationQualityFinalizationV1Digest(qualityFinalization,hash);
    if(qualityFinalizationSha256!==expectedQualityFinalizationSha256){
      blockers.push('REJECTION_QUALITY_DIGEST_DRIFT');
    }
  }catch{
    blockers.push('REJECTION_QUALITY_DIGEST_INVALID');
  }

  let qualityTrusted=false;
  if(qualityFinalizationSha256!=='UNKNOWN'
    &&qualityFinalizationSha256===expectedQualityFinalizationSha256){
    try{
      qualityTrusted=await qualityOrigin.verifyQualityFinalization(
        qualityFinalization,expectedQualityFinalizationSha256,
      );
    }catch{
      qualityTrusted=false;
    }
  }
  if(!qualityTrusted)blockers.push('REJECTION_QUALITY_ORIGIN_UNVERIFIED');

  if(qualityFinalization.schemaVersion!==HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA
    ||campaignId===null
    ||qualityFinalization.campaignId!==campaignId
    ||qualityFinalization.qualityEvidenceFrozen!==true
    ||qualityFinalization.efficiencyUsedInQualitySelection!==false
    ||qualityFinalization.productionAuthorityGranted!==false
    ||qualityFinalization.providerAuthorityGranted!==false
    ||qualityFinalization.billingAuthorityGranted!==false
    ||qualityFinalization.projectArtifactMutationAllowed!==false
    ||qualityFinalization.aeeExecutionAuthorityGranted!==false
    ||qualityFinalization.durableModelFleetPromotionAllowed!==false
    ||qualityFinalization.trainingOrDistillationAllowed!==false
    ||qualityFinalization.winnerSelectionAllowed!==false){
    blockers.push('REJECTION_QUALITY_FINALIZATION_INVALID');
  }

  let qualityEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let qualityOutcome:'PASS'|'FAIL'|'UNKNOWN'='UNKNOWN';
  const qualityRows=Array.isArray(qualityFinalization.rows)
    ?qualityFinalization.rows.filter(row=>row.candidateId===candidateId&&row.capability===capability)
    :[];
  if(qualityRows.length!==1){
    blockers.push(qualityRows.length===0?'REJECTION_QUALITY_ROW_MISSING':'REJECTION_QUALITY_ROW_DUPLICATE');
  }else if(qualityFinalizationSha256!=='UNKNOWN'){
    const row=qualityRows[0];
    const derived=await digest(
      HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN,
      {candidateId,capability,qualityFinalizationSha256,row},
      hash,'REJECTION_QUALITY_ROW_HASH_INVALID',
    );
    qualityEvidenceSha256=derived;
    if(row.qualityState==='QUALITY_FLOOR_FAIL'){
      qualityOutcome='FAIL';
      hard.push('QUALITY_FLOOR_FAILED');
    }else if(row.qualityState==='QUALITY_FLOOR_PASS'){
      qualityOutcome='PASS';
    }else{
      blockers.push('REJECTION_QUALITY_OUTCOME_UNRESOLVED');
    }
  }

  const derivedRejectionReasons=Object.freeze([...new Set(hard)].sort(lexical));
  if(derivedRejectionReasons.length===0){
    blockers.push('REJECTION_HARD_BLOCKER_REQUIRED');
  }
  if(blockers.length>0){
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256,
      pendingDecisionSha256,
      appliedCandidateSha256,
      runtimeEvidenceSha256:valueOrUnknown(overlay.runtimeEvidenceSha256),
      runtimeComponentMapSha256:valueOrUnknown(overlay.componentMapSha256),
      sourceExecutionProfileSha256:valueOrUnknown(overlay.sourceExecutionProfileSha256),
      runtime:candidate.runtime,
      licenseEvidenceSha256:valueOrUnknown(licenseEvidenceSha256),
      qualityFinalizationSha256:valueOrUnknown(qualityFinalizationSha256),
      qualityEvidenceSha256:valueOrUnknown(qualityEvidenceSha256),
      qualityOutcome,
      resolvedLicenseConclusion,
      derivedRejectionReasons,
    });
  }

  const evidenceSetSha256=await digest(
    HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
      candidateId,
      capability,
      sourceDecisionSha256,
      sourceCandidateSha256,
      pendingDecisionSha256,
      appliedCandidateSha256,
      runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
      runtimeComponentMapSha256:overlay.componentMapSha256,
      sourceExecutionProfileSha256:overlay.sourceExecutionProfileSha256,
      runtime:candidate.runtime,
      licenseEvidenceSha256,
      resolvedLicenseConclusion,
      qualityFinalizationSha256,
      qualityEvidenceSha256,
      qualityOutcome,
      derivedRejectionReasons,
      decisionMutationAllowed:false,
      candidateSelectionAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      trainingOrDistillationAllowed:false,
      winnerSelectionAllowed:false,
    },
    hash,'REJECTION_EVIDENCE_SET_HASH_INVALID',
  );

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
    candidateId,
    capability,
    state:'REJECTION_EVIDENCE_READY',
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    sourceCandidateSha256,
    pendingDecisionSha256,
    appliedCandidateSha256,
    runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
    runtimeComponentMapSha256:overlay.componentMapSha256,
    sourceExecutionProfileSha256:overlay.sourceExecutionProfileSha256,
    runtime:candidate.runtime,
    licenseEvidenceSha256,
    qualityFinalizationSha256,
    qualityEvidenceSha256,
    qualityOutcome,
    resolvedLicenseConclusion,
    derivedRejectionReasons,
    evidenceSetSha256,
    ...authorityBoundary(),
  });
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

function validateApplication(
  application:HsmeFoundationPendingReuseRuntimeApplicationV1,
  candidateId:string,
  capability:Capability,
  blockers:string[],
):void{
  if(application.schemaVersion!==HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA){
    blockers.push('REJECTION_APPLICATION_SCHEMA_INVALID');
  }
  if(application.state!=='RUNTIME_OVERLAY_APPLIED_PENDING'
    ||!Array.isArray(application.blockers)||application.blockers.length!==0){
    blockers.push('REJECTION_APPLICATION_NOT_READY');
  }
  if(application.candidateId!==candidateId||application.capability!==capability){
    blockers.push('REJECTION_APPLICATION_IDENTITY_DRIFT');
  }
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
    blockers.push('REJECTION_APPLICATION_AUTHORITY_WIDENING');
  }
}

function validateOverlay(
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  candidateId:string,
  capability:Capability,
  expectedRuntimeSha:string|'UNKNOWN',
  blockers:string[],
):void{
  if(overlay.schemaVersion!==HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA
    ||overlay.state!=='PHYSICAL_RUNTIME_EVIDENCE_READY'
    ||!Array.isArray(overlay.blockers)||overlay.blockers.length!==0){
    blockers.push('REJECTION_RUNTIME_OVERLAY_NOT_READY');
  }
  if(overlay.candidateId!==candidateId||overlay.capability!==capability||overlay.targetTier!=='MOBILE_DEFAULT'){
    blockers.push('REJECTION_RUNTIME_OVERLAY_IDENTITY_DRIFT');
  }
  if(overlay.runtimeEvidenceSha256==='UNKNOWN'||!HEX64.test(overlay.runtimeEvidenceSha256)
    ||overlay.runtimeEvidenceSha256!==expectedRuntimeSha){
    blockers.push('REJECTION_RUNTIME_DIGEST_DRIFT');
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
    blockers.push('REJECTION_RUNTIME_AUTHORITY_WIDENING');
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
      hash,'REJECTION_RUNTIME_REHASH_INVALID',
    );
  }catch{
    blockers.push('REJECTION_RUNTIME_REHASH_INVALID');
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
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}
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
    HsmeFoundationReuseEvidenceRejectionV1,
    'sourceDecisionSha256'|'sourceCandidateSha256'|'pendingDecisionSha256'|'appliedCandidateSha256'|'runtimeEvidenceSha256'|
    'runtimeComponentMapSha256'|'sourceExecutionProfileSha256'|'runtime'|
    'licenseEvidenceSha256'|'qualityFinalizationSha256'|'qualityEvidenceSha256'|
    'qualityOutcome'|'resolvedLicenseConclusion'|'derivedRejectionReasons'|'evidenceSetSha256'
  >>={},
):HsmeFoundationReuseEvidenceRejectionV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
    candidateId,
    capability,
    state:'REJECTION_EVIDENCE_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    sourceCandidateSha256:values.sourceCandidateSha256??'UNKNOWN',
    pendingDecisionSha256:values.pendingDecisionSha256??'UNKNOWN',
    appliedCandidateSha256:values.appliedCandidateSha256??'UNKNOWN',
    runtimeEvidenceSha256:values.runtimeEvidenceSha256??'UNKNOWN',
    runtimeComponentMapSha256:values.runtimeComponentMapSha256??'UNKNOWN',
    sourceExecutionProfileSha256:values.sourceExecutionProfileSha256??'UNKNOWN',
    runtime:values.runtime??null,
    licenseEvidenceSha256:values.licenseEvidenceSha256??'UNKNOWN',
    qualityFinalizationSha256:values.qualityFinalizationSha256??'UNKNOWN',
    qualityEvidenceSha256:values.qualityEvidenceSha256??'UNKNOWN',
    qualityOutcome:values.qualityOutcome??'UNKNOWN',
    resolvedLicenseConclusion:values.resolvedLicenseConclusion??'UNKNOWN',
    derivedRejectionReasons:Object.freeze([...(values.derivedRejectionReasons??[])]),
    evidenceSetSha256:values.evidenceSetSha256??'UNKNOWN',
    ...authorityBoundary(),
  });
}

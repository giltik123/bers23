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
  HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN,
  type HsmeFoundationReuseEvidenceQualificationV1,
} from './HsmeFoundationReuseEvidenceQualificationV1';
import {
  HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN,
  type HsmeFoundationReuseEvidenceRejectionV1,
} from './HsmeFoundationReuseEvidenceRejectionV1';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1' as const;
export const HSME_FOUNDATION_REUSE_CAPABILITY_QUALITY_AGGREGATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-capability-quality-aggregate:v1\0' as const;
export const HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-assembled-candidate:v1\0' as const;
export const HSME_FOUNDATION_REUSE_CAPABILITY_EVIDENCE_SET_DIGEST_DOMAIN =
  'bers:hsme:reuse-capability-evidence-set:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const SUPPORTED_CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
type SupportedCapability=typeof SUPPORTED_CAPABILITIES[number];

export type HsmeFoundationReuseCandidateEvidenceAssemblyStateV1=
  | 'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID'
  | 'CANDIDATE_EVIDENCE_QUALIFIED'
  | 'CANDIDATE_EVIDENCE_REJECTED';

export type HsmeFoundationReuseCandidateEvidenceAssemblyV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA;
  candidateId:string;
  state:HsmeFoundationReuseCandidateEvidenceAssemblyStateV1;
  blockers:readonly string[];
  requiredCapabilities:readonly string[];
  campaignId:string|'UNKNOWN';
  campaignSha256:string|'UNKNOWN';
  sourceDecisionSha256:string|'UNKNOWN';
  sourceCandidateSha256:string|'UNKNOWN';
  capabilityEvidenceSetSha256:string|'UNKNOWN';
  assembledCandidateSha256:string|'UNKNOWN';
  structuralCoverageBlockers:readonly string[];
  assembledCandidate:HsmeFoundationReuseCandidateV1|null;
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

type AnyProof=
  | HsmeFoundationReuseEvidenceQualificationV1
  | HsmeFoundationReuseEvidenceRejectionV1;

type ProofKind='QUALIFICATION'|'REJECTION';

export interface HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1{
  verifyQualificationProof(
    proof:HsmeFoundationReuseEvidenceQualificationV1,
    evidenceSetSha256:string,
  ):Promise<boolean>;
  verifyRejectionProof(
    proof:HsmeFoundationReuseEvidenceRejectionV1,
    evidenceSetSha256:string,
  ):Promise<boolean>;
}

type ValidatedProof=Readonly<{
  kind:ProofKind;
  capability:SupportedCapability;
  sourceDecisionSha256:string;
  sourceCandidateSha256:string;
  runtimeEvidenceSha256:string;
  runtimeComponentMapSha256:string;
  sourceExecutionProfileSha256:string;
  runtime:HsmeFoundationReuseRuntimeV1;
  licenseEvidenceSha256:string;
  qualityEvidenceSha256:string;
  trainingEvidenceSha256:string|'UNKNOWN';
  resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE'|'NON_COMMERCIAL'|'UNKNOWN';
  qualityOutcome:'PASS'|'FAIL'|'UNKNOWN';
  rejectionReasons:readonly string[];
  evidenceSetSha256:string;
}>;

export async function assembleHsmeFoundationReuseCandidateEvidenceV1(
  rawSourceDecision:unknown,
  candidateId:string,
  rawCampaign:unknown,
  qualificationProofs:readonly HsmeFoundationReuseEvidenceQualificationV1[],
  rejectionProofs:readonly HsmeFoundationReuseEvidenceRejectionV1[],
  origin:HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationReuseCandidateEvidenceAssemblyV1>{
  const blockers:string[]=[];
  if(!validIdentifier(candidateId,120))blockers.push('ASSEMBLY_CANDIDATE_ID_INVALID');

  let sourceDecision;
  try{
    sourceDecision=normalizeHsmeFoundationReuseDecisionV1(rawSourceDecision);
  }catch{
    return invalid(candidateId,['ASSEMBLY_SOURCE_DECISION_INVALID']);
  }
  if(sourceDecision.decisionStatus!=='EVALUATION_PENDING'
    ||sourceDecision.selectedCandidateId!==undefined){
    blockers.push('ASSEMBLY_SOURCE_DECISION_NOT_PENDING');
  }
  const sourceMatches=sourceDecision.candidates.filter(value=>value.candidateId===candidateId);
  if(sourceMatches.length!==1){
    blockers.push(sourceMatches.length===0?'ASSEMBLY_SOURCE_CANDIDATE_MISSING':'ASSEMBLY_SOURCE_CANDIDATE_DUPLICATE');
    return invalid(candidateId,blockers);
  }
  const sourceCandidate=sourceMatches[0];
  if(sourceCandidate.strategy==='CONTROL_BASELINE'){
    blockers.push('ASSEMBLY_CONTROL_CANDIDATE_FORBIDDEN');
  }
  if(sourceCandidate.evidenceState!=='UNRESOLVED'
    ||sourceCandidate.rejectionReasons.length!==0){
    blockers.push('ASSEMBLY_SOURCE_CANDIDATE_NOT_UNRESOLVED');
  }
  if(sourceCandidate.licenseConclusion!=='REVIEW_REQUIRED'
    ||sourceCandidate.licenseEvidenceSha256!=='UNKNOWN'
    ||sourceCandidate.quality.status!=='UNKNOWN'
    ||sourceCandidate.quality.evidenceSha256!=='UNKNOWN'
    ||sourceCandidate.training.evidenceSha256!=='UNKNOWN'
    ||!runtimeUnresolved(sourceCandidate.runtime)){
    blockers.push('ASSEMBLY_SOURCE_EVIDENCE_MUST_BE_UNRESOLVED');
  }

  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  let sourceCandidateSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(sourceDecision,hash);
    sourceCandidateSha256=await digest(
      HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
      sourceCandidate,
      hash,
      'ASSEMBLY_SOURCE_CANDIDATE_HASH_INVALID',
    );
  }catch{
    blockers.push('ASSEMBLY_SOURCE_DIGEST_INVALID');
  }

  let campaign;
  try{
    campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  }catch{
    return invalid(candidateId,[...blockers,'ASSEMBLY_CAMPAIGN_INVALID'],{
      sourceDecisionSha256,
      sourceCandidateSha256,
    });
  }
  if(campaign.status!=='FIXTURES_PINNED')blockers.push('ASSEMBLY_CAMPAIGN_NOT_FROZEN');
  let campaignSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    campaignSha256=await hsmeFoundationBenchmarkCampaignV1Digest(campaign,hash);
  }catch{
    blockers.push('ASSEMBLY_CAMPAIGN_DIGEST_INVALID');
  }
  const campaignMatches=campaign.candidates.filter(value=>value.candidateId===candidateId);
  if(campaignMatches.length!==1){
    blockers.push(campaignMatches.length===0?'ASSEMBLY_CAMPAIGN_CANDIDATE_MISSING':'ASSEMBLY_CAMPAIGN_CANDIDATE_DUPLICATE');
    return invalid(candidateId,blockers,{campaignId:campaign.campaignId,campaignSha256,sourceDecisionSha256,sourceCandidateSha256});
  }
  const campaignCandidate=campaignMatches[0];
  if(campaignCandidate.sourceRoot!==sourceCandidate.source.sourceRoot
    ||campaignCandidate.immutableRevision!==sourceCandidate.source.immutableRevision
    ||campaignCandidate.modelContentSha256!==sourceCandidate.source.contentSha256){
    blockers.push('ASSEMBLY_CAMPAIGN_SOURCE_DRIFT');
  }

  const requiredCapabilities=Object.freeze(
    [...new Set(campaign.requiredCapabilities)].sort(lexical),
  );
  if(requiredCapabilities.length!==campaign.requiredCapabilities.length){
    blockers.push('ASSEMBLY_REQUIRED_CAPABILITY_DUPLICATE');
  }
  if(requiredCapabilities.some(value=>!SUPPORTED_CAPABILITIES.includes(value as SupportedCapability))){
    blockers.push('ASSEMBLY_REQUIRED_CAPABILITY_UNSUPPORTED_BY_PROOF_SCHEMA');
  }

  const slicesByCapability=new Map<string,typeof campaign.slices[number]>();
  for(const capability of requiredCapabilities){
    const matches=campaign.slices.filter(value=>value.capability===capability);
    if(matches.length!==1){
      blockers.push(matches.length===0
        ?'ASSEMBLY_REQUIRED_CAPABILITY_SLICE_MISSING'
        :'ASSEMBLY_REQUIRED_CAPABILITY_SLICE_DUPLICATE');
    }else{
      slicesByCapability.set(capability,matches[0]);
    }
  }

  const structuralCoverageBlockers:string[]=[];
  for(const capability of requiredCapabilities){
    const slice=slicesByCapability.get(capability);
    if(slice&&!slice.selectionCandidateIds.includes(candidateId)){
      structuralCoverageBlockers.push('REQUIRED_CAPABILITY_UNSUPPORTED');
    }
  }

  if(!digestKnown(sourceDecisionSha256)||!digestKnown(sourceCandidateSha256)){
    blockers.push('ASSEMBLY_SOURCE_PROVENANCE_DIGEST_MISSING');
    return invalid(candidateId,blockers,{
      requiredCapabilities,
      campaignId:campaign.campaignId,
      campaignSha256,
      sourceDecisionSha256,
      sourceCandidateSha256,
      structuralCoverageBlockers,
    });
  }
  if(!digestKnown(campaignSha256)){
    blockers.push('ASSEMBLY_CAMPAIGN_DIGEST_MISSING');
    return invalid(candidateId,blockers,{
      requiredCapabilities,
      campaignId:campaign.campaignId,
      campaignSha256,
      sourceDecisionSha256,
      sourceCandidateSha256,
      structuralCoverageBlockers,
    });
  }
  const trustedSourceDecisionSha256=sourceDecisionSha256;
  const trustedSourceCandidateSha256=sourceCandidateSha256;
  const trustedCampaignSha256=campaignSha256;

  const validated:ValidatedProof[]=[];
  const seen=new Set<string>();
  for(const [kind,proofs] of [
    ['QUALIFICATION',qualificationProofs] as const,
    ['REJECTION',rejectionProofs] as const,
  ]){
    for(const proof of proofs){
      const key=kind+':'+proof.capability;
      if(seen.has(key)){
        blockers.push(kind==='QUALIFICATION'
          ?'ASSEMBLY_DUPLICATE_QUALIFICATION_CAPABILITY'
          :'ASSEMBLY_DUPLICATE_REJECTION_CAPABILITY');
        continue;
      }
      seen.add(key);
      const validatedProof=await validateProof(
        kind,proof,candidateId,requiredCapabilities,
        slicesByCapability,trustedSourceDecisionSha256,trustedSourceCandidateSha256,
        campaignCandidate.executionProfileSha256,origin,hash,blockers,
      );
      if(validatedProof)validated.push(validatedProof);
    }
  }

  for(const capability of requiredCapabilities){
    if(seen.has('QUALIFICATION:'+capability)&&seen.has('REJECTION:'+capability)){
      blockers.push('ASSEMBLY_CAPABILITY_PROOF_CONFLICT');
    }
  }

  const qualificationRows=validated.filter(value=>value.kind==='QUALIFICATION');
  const rejectionRows=validated.filter(value=>value.kind==='REJECTION');

  if(blockers.length>0){
    return invalid(candidateId,blockers,{
      requiredCapabilities,
      campaignId:campaign.campaignId,
      campaignSha256,
      sourceDecisionSha256,
      sourceCandidateSha256,
      structuralCoverageBlockers,
    });
  }

  if(structuralCoverageBlockers.length>0){
    blockers.push('ASSEMBLY_CANDIDATE_REQUIRED_CAPABILITY_UNSUPPORTED');
    return invalid(candidateId,blockers,{
      requiredCapabilities,
      campaignId:campaign.campaignId,
      campaignSha256,
      sourceDecisionSha256,
      sourceCandidateSha256,
      structuralCoverageBlockers,
    });
  }

  const candidateWideReasons=new Set<string>();
  for(const row of rejectionRows){
    for(const reason of row.rejectionReasons){
      if(reason==='LICENSE_NON_COMMERCIAL'
        ||reason==='MOBILE_INSTALLED_BUDGET_EXCEEDED'
        ||reason==='MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED'){
        candidateWideReasons.add(reason);
      }
    }
  }
  const allQualityFailed=requiredCapabilities.length>0
    &&requiredCapabilities.every(capability=>
      rejectionRows.some(row=>
        row.capability===capability
        &&row.rejectionReasons.includes('QUALITY_FLOOR_FAILED')
        &&row.qualityOutcome==='FAIL'
      )
    );
  if(allQualityFailed)candidateWideReasons.add('QUALITY_FLOOR_FAILED');

  const mayReject=candidateWideReasons.size>0;
  if(mayReject){
    const assembled=await assembleRejectedCandidate(
      sourceCandidate,
      requiredCapabilities,
      qualificationRows,
      rejectionRows,
      [...candidateWideReasons].sort(lexical),
      hash,
      blockers,
    );
    if(blockers.length>0||assembled===null){
      return invalid(candidateId,blockers,{
        requiredCapabilities,sourceDecisionSha256,sourceCandidateSha256,
        structuralCoverageBlockers,
      });
    }
    const capabilityEvidenceSetSha256=await evidenceSetDigest(
      candidateId,campaign.campaignId,trustedCampaignSha256,requiredCapabilities,qualificationRows,rejectionRows,
      trustedSourceDecisionSha256,trustedSourceCandidateSha256,
      structuralCoverageBlockers,hash,
    );
    const assembledCandidateSha256=await digest(
      HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
      assembled,hash,'ASSEMBLY_CANDIDATE_HASH_INVALID',
    );
    return Object.freeze({
      schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
      candidateId,
      state:'CANDIDATE_EVIDENCE_REJECTED',
      blockers:Object.freeze([]),
      requiredCapabilities,
      campaignId:campaign.campaignId,
      campaignSha256,
      sourceDecisionSha256,
      sourceCandidateSha256,
      capabilityEvidenceSetSha256,
      assembledCandidateSha256,
      structuralCoverageBlockers:Object.freeze([...new Set(structuralCoverageBlockers)].sort(lexical)),
      assembledCandidate:assembled,
      ...authorityBoundary(),
    });
  }

  if(rejectionRows.length>0){
    blockers.push('ASSEMBLY_PARTIAL_QUALITY_REJECTION_INSUFFICIENT');
  }
  const qualByCapability=new Map(
    qualificationRows.map(row=>[row.capability,row] as const),
  );
  for(const capability of requiredCapabilities){
    if(!qualByCapability.has(capability)){
      blockers.push('ASSEMBLY_REQUIRED_QUALIFICATION_MISSING');
    }
  }
  if(blockers.length>0){
    return invalid(candidateId,blockers,{
      requiredCapabilities,sourceDecisionSha256,sourceCandidateSha256,
      structuralCoverageBlockers,
    });
  }

  const qualified=await assembleQualifiedCandidate(
    sourceCandidate,requiredCapabilities,qualificationRows,hash,blockers,
  );
  if(blockers.length>0||qualified===null){
    return invalid(candidateId,blockers,{
      requiredCapabilities,sourceDecisionSha256,sourceCandidateSha256,
      structuralCoverageBlockers,
    });
  }
  const capabilityEvidenceSetSha256=await evidenceSetDigest(
    candidateId,campaign.campaignId,trustedCampaignSha256,requiredCapabilities,qualificationRows,rejectionRows,
    trustedSourceDecisionSha256,trustedSourceCandidateSha256,
    structuralCoverageBlockers,hash,
  );
  const assembledCandidateSha256=await digest(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
    qualified,hash,'ASSEMBLY_CANDIDATE_HASH_INVALID',
  );
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId,
    state:'CANDIDATE_EVIDENCE_QUALIFIED',
    blockers:Object.freeze([]),
    requiredCapabilities,
    campaignId:campaign.campaignId,
    campaignSha256,
    sourceDecisionSha256,
    sourceCandidateSha256,
    capabilityEvidenceSetSha256,
    assembledCandidateSha256,
    structuralCoverageBlockers:Object.freeze([]),
    assembledCandidate:qualified,
    ...authorityBoundary(),
  });
}

async function validateProof(
  kind:ProofKind,
  proof:AnyProof,
  candidateId:string,
  requiredCapabilities:readonly string[],
  slicesByCapability:ReadonlyMap<string,{selectionCandidateIds:readonly string[]}>,
  sourceDecisionSha256:string|'UNKNOWN',
  sourceCandidateSha256:string|'UNKNOWN',
  campaignExecutionProfileSha256:string|'UNKNOWN',
  origin:HsmeFoundationReuseCapabilityEvidenceOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<ValidatedProof|null>{
  const capability=proof.capability as SupportedCapability;
  if(proof.candidateId!==candidateId)blockers.push('ASSEMBLY_PROOF_CANDIDATE_DRIFT');
  if(!requiredCapabilities.includes(capability))blockers.push('ASSEMBLY_PROOF_CAPABILITY_NOT_REQUIRED');
  const slice=slicesByCapability.get(capability);
  if(!slice||!slice.selectionCandidateIds.includes(candidateId)){
    blockers.push('ASSEMBLY_PROOF_CANDIDATE_NOT_IN_FROZEN_SELECTION_SET');
  }
  if(proof.sourceDecisionSha256!==sourceDecisionSha256
    ||proof.sourceCandidateSha256!==sourceCandidateSha256){
    blockers.push('ASSEMBLY_PROOF_SOURCE_PROVENANCE_DRIFT');
  }
  if(campaignExecutionProfileSha256==='UNKNOWN'
    ||proof.sourceExecutionProfileSha256!==campaignExecutionProfileSha256){
    blockers.push('ASSEMBLY_PROOF_EXECUTION_PROFILE_DRIFT');
  }
  if(authorityWidened(proof))blockers.push('ASSEMBLY_PROOF_AUTHORITY_WIDENING');

  if(kind==='QUALIFICATION'){
    const row=proof as HsmeFoundationReuseEvidenceQualificationV1;
    if(row.schemaVersion!==HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA
      ||row.state!=='QUALIFICATION_EVIDENCE_READY'
      ||row.blockers.length!==0){
      blockers.push('ASSEMBLY_QUALIFICATION_PROOF_NOT_READY');
      return null;
    }
    if(row.runtime===null
      ||!digestKnown(row.runtimeEvidenceSha256)
      ||!digestKnown(row.runtimeComponentMapSha256)
      ||!digestKnown(row.sourceExecutionProfileSha256)
      ||!digestKnown(row.licenseEvidenceSha256)
      ||!digestKnown(row.qualityEvidenceSha256)
      ||!digestKnown(row.trainingEvidenceSha256)
      ||row.resolvedLicenseConclusion!=='COMMERCIAL_ADMISSIBLE'){
      blockers.push('ASSEMBLY_QUALIFICATION_PROOF_INCOMPLETE');
      return null;
    }
    const recomputed=await digest(
      HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN,
      qualificationPayload(row),hash,'ASSEMBLY_QUALIFICATION_REHASH_INVALID',
    );
    if(recomputed!==row.evidenceSetSha256){
      blockers.push('ASSEMBLY_QUALIFICATION_REHASH_MISMATCH');
      return null;
    }
    let trusted=false;
    try{
      trusted=await origin.verifyQualificationProof(row,row.evidenceSetSha256 as string);
    }catch{
      trusted=false;
    }
    if(!trusted){
      blockers.push('ASSEMBLY_QUALIFICATION_ORIGIN_UNVERIFIED');
      return null;
    }
    return Object.freeze({
      kind,
      capability,
      sourceDecisionSha256:row.sourceDecisionSha256 as string,
      sourceCandidateSha256:row.sourceCandidateSha256 as string,
      runtimeEvidenceSha256:row.runtimeEvidenceSha256 as string,
      runtimeComponentMapSha256:row.runtimeComponentMapSha256 as string,
      sourceExecutionProfileSha256:row.sourceExecutionProfileSha256 as string,
      runtime:row.runtime,
      licenseEvidenceSha256:row.licenseEvidenceSha256 as string,
      qualityEvidenceSha256:row.qualityEvidenceSha256 as string,
      trainingEvidenceSha256:row.trainingEvidenceSha256 as string,
      resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE',
      qualityOutcome:'PASS',
      rejectionReasons:Object.freeze([]),
      evidenceSetSha256:row.evidenceSetSha256 as string,
    });
  }

  const row=proof as HsmeFoundationReuseEvidenceRejectionV1;
  if(row.schemaVersion!==HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA
    ||row.state!=='REJECTION_EVIDENCE_READY'
    ||row.blockers.length!==0){
    blockers.push('ASSEMBLY_REJECTION_PROOF_NOT_READY');
    return null;
  }
  if(row.runtime===null
    ||!digestKnown(row.runtimeEvidenceSha256)
    ||!digestKnown(row.runtimeComponentMapSha256)
    ||!digestKnown(row.sourceExecutionProfileSha256)
    ||!digestKnown(row.licenseEvidenceSha256)
    ||!digestKnown(row.qualityEvidenceSha256)
    ||!digestKnown(row.evidenceSetSha256)
    ||row.derivedRejectionReasons.length<1){
    blockers.push('ASSEMBLY_REJECTION_PROOF_INCOMPLETE');
    return null;
  }
  const recomputed=await digest(
    HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN,
    rejectionPayload(row),hash,'ASSEMBLY_REJECTION_REHASH_INVALID',
  );
  if(recomputed!==row.evidenceSetSha256){
    blockers.push('ASSEMBLY_REJECTION_REHASH_MISMATCH');
    return null;
  }
  let trusted=false;
  try{
    trusted=await origin.verifyRejectionProof(row,row.evidenceSetSha256 as string);
  }catch{
    trusted=false;
  }
  if(!trusted){
    blockers.push('ASSEMBLY_REJECTION_ORIGIN_UNVERIFIED');
    return null;
  }
  return Object.freeze({
    kind,
    capability,
    sourceDecisionSha256:row.sourceDecisionSha256 as string,
    sourceCandidateSha256:row.sourceCandidateSha256 as string,
    runtimeEvidenceSha256:row.runtimeEvidenceSha256 as string,
    runtimeComponentMapSha256:row.runtimeComponentMapSha256 as string,
    sourceExecutionProfileSha256:row.sourceExecutionProfileSha256 as string,
    runtime:row.runtime,
    licenseEvidenceSha256:row.licenseEvidenceSha256 as string,
    qualityEvidenceSha256:row.qualityEvidenceSha256 as string,
    trainingEvidenceSha256:'UNKNOWN',
    resolvedLicenseConclusion:row.resolvedLicenseConclusion,
    qualityOutcome:row.qualityOutcome,
    rejectionReasons:Object.freeze([...row.derivedRejectionReasons].sort(lexical)),
    evidenceSetSha256:row.evidenceSetSha256 as string,
  });
}

async function assembleQualifiedCandidate(
  source:HsmeFoundationReuseCandidateV1,
  requiredCapabilities:readonly string[],
  rows:readonly ValidatedProof[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<HsmeFoundationReuseCandidateV1|null>{
  const license=unique(rows.map(value=>value.licenseEvidenceSha256));
  const runtimeSha=unique(rows.map(value=>value.runtimeEvidenceSha256));
  const componentMap=unique(rows.map(value=>value.runtimeComponentMapSha256));
  const runtimeJson=unique(rows.map(value=>JSON.stringify(value.runtime)));
  const training=unique(rows.map(value=>value.trainingEvidenceSha256));
  const profile=unique(rows.map(value=>value.sourceExecutionProfileSha256));
  if(!license||!runtimeSha||!componentMap||!runtimeJson||!training||!profile){
    blockers.push('ASSEMBLY_QUALIFICATION_CROSS_CAPABILITY_INCONSISTENT');
    return null;
  }
  if(training==='UNKNOWN'){
    blockers.push('ASSEMBLY_QUALIFICATION_TRAINING_EVIDENCE_MISSING');
    return null;
  }
  const runtime=JSON.parse(runtimeJson) as HsmeFoundationReuseRuntimeV1;
  const qualityRows=requiredCapabilities.map(capability=>{
    const row=rows.find(value=>value.capability===capability);
    if(!row)throw new Error('qualification row missing after coverage check');
    return {capability,qualityEvidenceSha256:row.qualityEvidenceSha256};
  }).sort((a,b)=>lexical(a.capability,b.capability));
  const qualityEvidenceSha256=await digest(
    HSME_FOUNDATION_REUSE_CAPABILITY_QUALITY_AGGREGATE_DIGEST_DOMAIN,
    {candidateId:source.candidateId,qualityRows},
    hash,'ASSEMBLY_QUALITY_AGGREGATE_HASH_INVALID',
  );
  try{
    return normalizeHsmeFoundationReuseCandidateV1({
      ...source,
      evidenceState:'QUALIFIED',
      licenseConclusion:'COMMERCIAL_ADMISSIBLE',
      licenseEvidenceSha256:license,
      quality:{status:'PASS',evidenceSha256:qualityEvidenceSha256},
      runtime,
      training:{...source.training,evidenceSha256:training},
      rejectionReasons:[],
    });
  }catch{
    blockers.push('ASSEMBLY_QUALIFIED_CANDIDATE_INVALID');
    return null;
  }
}

async function assembleRejectedCandidate(
  source:HsmeFoundationReuseCandidateV1,
  requiredCapabilities:readonly string[],
  qualificationRows:readonly ValidatedProof[],
  rejectionRows:readonly ValidatedProof[],
  reasons:readonly string[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<HsmeFoundationReuseCandidateV1|null>{
  let licenseConclusion:HsmeFoundationReuseCandidateV1['licenseConclusion']=source.licenseConclusion;
  let licenseEvidenceSha256=source.licenseEvidenceSha256;
  if(reasons.includes('LICENSE_NON_COMMERCIAL')){
    const licenseRows=rejectionRows.filter(value=>
      value.rejectionReasons.includes('LICENSE_NON_COMMERCIAL')
      &&value.resolvedLicenseConclusion==='NON_COMMERCIAL'
    );
    const license=unique(licenseRows.map(value=>value.licenseEvidenceSha256));
    if(!license){
      blockers.push('ASSEMBLY_REJECTED_LICENSE_INCONSISTENT');
      return null;
    }
    licenseConclusion='NON_COMMERCIAL';
    licenseEvidenceSha256=license;
  }

  let quality=source.quality;
  if(reasons.includes('QUALITY_FLOOR_FAILED')){
    const qualityRows=requiredCapabilities.map(capability=>{
      const row=rejectionRows.find(value=>
        value.capability===capability
        &&value.qualityOutcome==='FAIL'
        &&value.rejectionReasons.includes('QUALITY_FLOOR_FAILED')
      );
      if(!row)return null;
      return {capability,qualityEvidenceSha256:row.qualityEvidenceSha256};
    });
    if(qualityRows.some(value=>value===null)){
      blockers.push('ASSEMBLY_REJECTED_QUALITY_COVERAGE_INCOMPLETE');
      return null;
    }
    const qualityEvidenceSha256=await digest(
      HSME_FOUNDATION_REUSE_CAPABILITY_QUALITY_AGGREGATE_DIGEST_DOMAIN,
      {candidateId:source.candidateId,qualityRows:(qualityRows as {capability:string;qualityEvidenceSha256:string}[]).sort((a,b)=>lexical(a.capability,b.capability))},
      hash,'ASSEMBLY_REJECTED_QUALITY_HASH_INVALID',
    );
    quality={status:'FAIL',evidenceSha256:qualityEvidenceSha256};
  }

  try{
    return normalizeHsmeFoundationReuseCandidateV1({
      ...source,
      evidenceState:'REJECTED',
      licenseConclusion,
      licenseEvidenceSha256,
      quality,
      rejectionReasons:[...new Set(reasons)].sort(lexical),
    });
  }catch{
    blockers.push('ASSEMBLY_REJECTED_CANDIDATE_INVALID');
    return null;
  }
}

async function evidenceSetDigest(
  candidateId:string,
  campaignId:string,
  campaignSha256:string,
  requiredCapabilities:readonly string[],
  qualificationRows:readonly ValidatedProof[],
  rejectionRows:readonly ValidatedProof[],
  sourceDecisionSha256:string,
  sourceCandidateSha256:string,
  structuralCoverageBlockers:readonly string[],
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const rows=[
    ...qualificationRows.map(value=>({
      kind:value.kind,
      capability:value.capability,
      evidenceSetSha256:value.evidenceSetSha256,
    })),
    ...rejectionRows.map(value=>({
      kind:value.kind,
      capability:value.capability,
      evidenceSetSha256:value.evidenceSetSha256,
    })),
  ].sort((a,b)=>lexical(a.capability,b.capability)||lexical(a.kind,b.kind));
  return digest(
    HSME_FOUNDATION_REUSE_CAPABILITY_EVIDENCE_SET_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
      candidateId,
      requiredCapabilities,
      campaignId:campaign.campaignId,
      campaignSha256,
      sourceDecisionSha256,
      sourceCandidateSha256,
      rows,
      structuralCoverageBlockers:[...new Set(structuralCoverageBlockers)].sort(lexical),
      decisionMutationAllowed:false,
      candidateSelectionAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    },
    hash,'ASSEMBLY_EVIDENCE_SET_HASH_INVALID',
  );
}

function qualificationPayload(row:HsmeFoundationReuseEvidenceQualificationV1){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
    candidateId:row.candidateId,
    capability:row.capability,
    sourceDecisionSha256:row.sourceDecisionSha256,
    sourceCandidateSha256:row.sourceCandidateSha256,
    pendingDecisionSha256:row.pendingDecisionSha256,
    appliedCandidateSha256:row.appliedCandidateSha256,
    runtimeEvidenceSha256:row.runtimeEvidenceSha256,
    runtimeComponentMapSha256:row.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:row.sourceExecutionProfileSha256,
    runtime:row.runtime,
    licenseEvidenceSha256:row.licenseEvidenceSha256,
    qualityEvidenceSha256:row.qualityEvidenceSha256,
    trainingEvidenceSha256:row.trainingEvidenceSha256,
    resolvedLicenseConclusion:row.resolvedLicenseConclusion,
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
}

function rejectionPayload(row:HsmeFoundationReuseEvidenceRejectionV1){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
    candidateId:row.candidateId,
    capability:row.capability,
    sourceDecisionSha256:row.sourceDecisionSha256,
    sourceCandidateSha256:row.sourceCandidateSha256,
    pendingDecisionSha256:row.pendingDecisionSha256,
    appliedCandidateSha256:row.appliedCandidateSha256,
    runtimeEvidenceSha256:row.runtimeEvidenceSha256,
    runtimeComponentMapSha256:row.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:row.sourceExecutionProfileSha256,
    runtime:row.runtime,
    licenseEvidenceSha256:row.licenseEvidenceSha256,
    resolvedLicenseConclusion:row.resolvedLicenseConclusion,
    qualityFinalizationSha256:row.qualityFinalizationSha256,
    qualityEvidenceSha256:row.qualityEvidenceSha256,
    qualityOutcome:row.qualityOutcome,
    derivedRejectionReasons:row.derivedRejectionReasons,
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
}

function authorityWidened(proof:AnyProof):boolean{
  return proof.decisionMutationAllowed!==false
    ||proof.candidateSelectionAllowed!==false
    ||proof.selectedCandidateIdAllowed!==false
    ||proof.reuseAdvanceAllowed!==false
    ||proof.fullStudentEscalationAllowed!==false
    ||proof.modelFleetPromotionAllowed!==false
    ||proof.installOrDownloadAllowed!==false
    ||proof.productionAuthorityGranted!==false
    ||proof.providerAuthorityGranted!==false
    ||proof.billingAuthorityGranted!==false
    ||proof.projectArtifactMutationAllowed!==false
    ||proof.aeeExecutionAuthorityGranted!==false
    ||proof.durableModelFleetPromotionAllowed!==false
    ||proof.trainingOrDistillationAllowed!==false
    ||proof.winnerSelectionAllowed!==false;
}

function runtimeUnresolved(runtime:HsmeFoundationReuseRuntimeV1):boolean{
  return runtime.backboneBytes==='UNKNOWN'
    &&runtime.conditionerBytes==='UNKNOWN'
    &&runtime.vaeBytes==='UNKNOWN'
    &&runtime.adapterBytes==='UNKNOWN'
    &&runtime.otherRequiredBytes==='UNKNOWN'
    &&runtime.mandatoryInstalledBytes==='UNKNOWN'
    &&runtime.workingMemoryBytes==='UNKNOWN'
    &&runtime.evidenceSha256==='UNKNOWN';
}

function digestKnown(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}

function unique(values:readonly string[]):string|null{
  if(values.length<1)return null;
  const first=values[0];
  return values.every(value=>value===first)?first:null;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  code:string,
):Promise<string>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
    if(!HEX64.test(result))throw new Error('invalid digest');
    return result;
  }catch{
    const error=new Error(code);
    (error as Error&{code?:string}).code=code;
    throw error;
  }
}

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function validIdentifier(value:string,max:number):boolean{
  return value.length>0&&value.length<=max&&/^[a-z0-9][a-z0-9._:@/-]*$/.test(value);
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
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationReuseCandidateEvidenceAssemblyV1,
    'requiredCapabilities'|'campaignId'|'campaignSha256'|'sourceDecisionSha256'|'sourceCandidateSha256'|
    'structuralCoverageBlockers'
  >>={},
):HsmeFoundationReuseCandidateEvidenceAssemblyV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId,
    state:'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    requiredCapabilities:Object.freeze([...(values.requiredCapabilities??[])]),
    campaignId:values.campaignId??'UNKNOWN',
    campaignSha256:values.campaignSha256??'UNKNOWN',
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    sourceCandidateSha256:values.sourceCandidateSha256??'UNKNOWN',
    capabilityEvidenceSetSha256:'UNKNOWN',
    assembledCandidateSha256:'UNKNOWN',
    structuralCoverageBlockers:Object.freeze([...(values.structuralCoverageBlockers??[])]),
    assembledCandidate:null,
    ...authorityBoundary(),
  });
}

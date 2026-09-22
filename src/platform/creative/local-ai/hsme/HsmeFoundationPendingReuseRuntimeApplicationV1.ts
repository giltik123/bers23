import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseCandidateV1,
  type HsmeFoundationReuseDecisionV1,
} from './HsmeFoundationReuseDecisionV1';
import {
  HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA,
  type HsmeFoundationPhysicalReuseRuntimeOverlayV1,
} from './HsmeFoundationPhysicalReuseRuntimeOverlayV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1' as const;
export const HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN =
  'bers:hsme:pending-reuse-source-candidate:v1\0' as const;
export const HSME_FOUNDATION_PENDING_REUSE_APPLIED_CANDIDATE_DIGEST_DOMAIN =
  'bers:hsme:pending-reuse-applied-candidate:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);

type Capability=typeof CAPABILITIES[number];

export type HsmeFoundationPendingReuseRuntimeApplicationStateV1=
  | 'RUNTIME_OVERLAY_APPLICATION_INVALID'
  | 'RUNTIME_OVERLAY_APPLIED_PENDING';

export type HsmeFoundationPendingReuseRuntimeApplicationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  state:HsmeFoundationPendingReuseRuntimeApplicationStateV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  sourceCandidateSha256:string|'UNKNOWN';
  appliedCandidateSha256:string|'UNKNOWN';
  pendingDecisionSha256:string|'UNKNOWN';
  runtimeEvidenceSha256:string|'UNKNOWN';
  candidate:HsmeFoundationReuseCandidateV1|null;
  pendingDecision:HsmeFoundationReuseDecisionV1|null;
  candidateQualificationAllowed:false;
  selectedCandidateIdAllowed:false;
  decisionStatusMutationAllowed:false;
  strategyMutationAllowed:false;
  licenseMutationAllowed:false;
  qualityMutationAllowed:false;
  trainingMutationAllowed:false;
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

export async function applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
  rawDecision:unknown,
  candidateId:string,
  capability:Capability,
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  expectedRuntimeEvidenceSha256:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationPendingReuseRuntimeApplicationV1>{
  const blockers:string[]=[];
  if(!validIdentifier(candidateId,120))blockers.push('CANDIDATE_ID_INVALID');
  if(!CAPABILITIES.includes(capability))blockers.push('CAPABILITY_INVALID');
  if(!HEX64.test(expectedRuntimeEvidenceSha256)){
    blockers.push('EXPECTED_RUNTIME_EVIDENCE_DIGEST_INVALID');
  }

  let decision:HsmeFoundationReuseDecisionV1;
  try{
    decision=normalizeHsmeFoundationReuseDecisionV1(rawDecision);
  }catch{
    return invalid(candidateId,capability,['SOURCE_REUSE_DECISION_INVALID']);
  }

  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(decision,hash);
  }catch{
    blockers.push('SOURCE_REUSE_DECISION_DIGEST_INVALID');
  }

  if(decision.decisionStatus!=='EVALUATION_PENDING'){
    blockers.push('SOURCE_DECISION_NOT_PENDING');
  }
  if(decision.selectedCandidateId!==undefined){
    blockers.push('SOURCE_DECISION_SELECTION_FORBIDDEN');
  }

  const matches=decision.candidates.filter(candidate=>candidate.candidateId===candidateId);
  if(matches.length!==1){
    blockers.push(matches.length===0?'SOURCE_CANDIDATE_MISSING':'SOURCE_CANDIDATE_DUPLICATE');
    return invalid(candidateId,capability,blockers,{sourceDecisionSha256});
  }
  const candidate=matches[0];
  if(candidate.strategy==='CONTROL_BASELINE')blockers.push('CONTROL_BASELINE_RUNTIME_APPLICATION_FORBIDDEN');
  if(candidate.targetTier!=='MOBILE_DEFAULT')blockers.push('MOBILE_DEFAULT_CANDIDATE_REQUIRED');
  if(candidate.evidenceState!=='UNRESOLVED')blockers.push('SOURCE_CANDIDATE_MUST_REMAIN_UNRESOLVED');
  if(candidate.rejectionReasons.length!==0)blockers.push('SOURCE_CANDIDATE_REJECTION_REASONS_FORBIDDEN');
  if(!runtimeFullyUnresolved(candidate))blockers.push('PREEXISTING_RUNTIME_EVIDENCE_CONFLICT');

  validateOverlay(overlay,candidateId,capability,expectedRuntimeEvidenceSha256,blockers);

  const sourceCandidateSha256=await digestCandidate(
    HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
    candidate,
    hash,
    blockers,
    'SOURCE_CANDIDATE_DIGEST_INVALID',
  );

  if(blockers.length>0||sourceCandidateSha256===null){
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256:sourceCandidateSha256??'UNKNOWN',
      runtimeEvidenceSha256:valueOrUnknown(overlay.runtimeEvidenceSha256),
    });
  }

  const runtime=Object.freeze({
    backboneBytes:overlay.backboneBytes as number,
    conditionerBytes:overlay.conditionerBytes as number,
    vaeBytes:overlay.vaeBytes as number,
    adapterBytes:overlay.adapterBytes as number,
    otherRequiredBytes:overlay.otherRequiredBytes as number,
    mandatoryInstalledBytes:overlay.mandatoryInstalledBytes as number,
    workingMemoryBytes:overlay.workingMemoryBytes as number,
    evidenceSha256:overlay.runtimeEvidenceSha256 as string,
  });

  const candidateRaw={
    ...candidate,
    runtime,
    evidenceState:'UNRESOLVED' as const,
  };

  const decisionRaw={
    ...decision,
    decisionStatus:'EVALUATION_PENDING' as const,
    candidates:decision.candidates.map(value=>value.candidateId===candidateId?candidateRaw:value),
  };
  delete (decisionRaw as {selectedCandidateId?:string}).selectedCandidateId;

  let pendingDecision:HsmeFoundationReuseDecisionV1;
  try{
    pendingDecision=normalizeHsmeFoundationReuseDecisionV1(decisionRaw);
  }catch{
    blockers.push('APPLIED_PENDING_DECISION_INVALID');
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256,
      runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
    });
  }

  if(pendingDecision.decisionStatus!=='EVALUATION_PENDING'
    ||pendingDecision.selectedCandidateId!==undefined){
    blockers.push('APPLIED_DECISION_AUTHORITY_DRIFT');
  }
  const applied=pendingDecision.candidates.filter(value=>value.candidateId===candidateId);
  if(applied.length!==1){
    blockers.push('APPLIED_CANDIDATE_LOOKUP_INVALID');
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256,
      runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
    });
  }
  const appliedCandidate=applied[0];
  validateNonRuntimePreservation(candidate,appliedCandidate,blockers);
  validateAppliedRuntime(appliedCandidate,overlay,blockers);

  const appliedCandidateSha256=await digestCandidate(
    HSME_FOUNDATION_PENDING_REUSE_APPLIED_CANDIDATE_DIGEST_DOMAIN,
    appliedCandidate,
    hash,
    blockers,
    'APPLIED_CANDIDATE_DIGEST_INVALID',
  );

  let pendingDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    pendingDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(pendingDecision,hash);
  }catch{
    blockers.push('APPLIED_PENDING_DECISION_DIGEST_INVALID');
  }

  if(blockers.length>0
    ||appliedCandidateSha256===null
    ||sourceDecisionSha256==='UNKNOWN'
    ||pendingDecisionSha256==='UNKNOWN'){
    return invalid(candidateId,capability,blockers,{
      sourceDecisionSha256,
      sourceCandidateSha256,
      appliedCandidateSha256:appliedCandidateSha256??'UNKNOWN',
      pendingDecisionSha256,
      runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
    });
  }

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA,
    candidateId,
    capability,
    state:'RUNTIME_OVERLAY_APPLIED_PENDING',
    blockers:Object.freeze([]),
    sourceDecisionSha256,
    sourceCandidateSha256,
    appliedCandidateSha256,
    pendingDecisionSha256,
    runtimeEvidenceSha256:overlay.runtimeEvidenceSha256,
    candidate:appliedCandidate,
    pendingDecision,
    ...authorityBoundary(),
  });
}

function runtimeFullyUnresolved(candidate:HsmeFoundationReuseCandidateV1):boolean{
  const runtime=candidate.runtime;
  return runtime.backboneBytes==='UNKNOWN'
    &&runtime.conditionerBytes==='UNKNOWN'
    &&runtime.vaeBytes==='UNKNOWN'
    &&runtime.adapterBytes==='UNKNOWN'
    &&runtime.otherRequiredBytes==='UNKNOWN'
    &&runtime.mandatoryInstalledBytes==='UNKNOWN'
    &&runtime.workingMemoryBytes==='UNKNOWN'
    &&runtime.evidenceSha256==='UNKNOWN';
}

function validateOverlay(
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  candidateId:string,
  capability:Capability,
  expectedRuntimeEvidenceSha256:string,
  blockers:string[],
):void{
  if(overlay.schemaVersion!==HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1_SCHEMA){
    blockers.push('RUNTIME_OVERLAY_SCHEMA_INVALID');
  }
  if(overlay.state!=='PHYSICAL_RUNTIME_EVIDENCE_READY'){
    blockers.push('PHYSICAL_RUNTIME_OVERLAY_NOT_READY');
  }
  if(!Array.isArray(overlay.blockers)||overlay.blockers.length!==0){
    blockers.push('RUNTIME_OVERLAY_BLOCKERS_PRESENT');
  }
  if(overlay.candidateId!==candidateId)blockers.push('RUNTIME_OVERLAY_CANDIDATE_DRIFT');
  if(overlay.capability!==capability)blockers.push('RUNTIME_OVERLAY_CAPABILITY_DRIFT');
  if(overlay.targetTier!=='MOBILE_DEFAULT')blockers.push('RUNTIME_OVERLAY_MOBILE_TIER_REQUIRED');
  if(overlay.runtimeEvidenceSha256==='UNKNOWN'||!HEX64.test(overlay.runtimeEvidenceSha256)){
    blockers.push('RUNTIME_EVIDENCE_DIGEST_INVALID');
  }else if(overlay.runtimeEvidenceSha256!==expectedRuntimeEvidenceSha256){
    blockers.push('RUNTIME_EVIDENCE_DIGEST_DRIFT');
  }
  for(const value of [
    overlay.componentMapSha256,
    overlay.physicalTargetBindingSha256,
    overlay.targetEvidenceSha256,
    overlay.sourceExecutionProfileSha256,
  ]){
    if(value==='UNKNOWN'||!HEX64.test(value))blockers.push('RUNTIME_OVERLAY_BINDING_DIGEST_INVALID');
  }

  const zeroAllowed=[
    overlay.backboneBytes,
    overlay.conditionerBytes,
    overlay.vaeBytes,
    overlay.adapterBytes,
    overlay.otherRequiredBytes,
  ];
  if(zeroAllowed.some(value=>value==='UNKNOWN'||!Number.isSafeInteger(value)||Number(value)<0)){
    blockers.push('RUNTIME_OVERLAY_COMPONENT_BYTES_INVALID');
  }
  if(overlay.mandatoryInstalledBytes==='UNKNOWN'
    ||!Number.isSafeInteger(overlay.mandatoryInstalledBytes)
    ||Number(overlay.mandatoryInstalledBytes)<1){
    blockers.push('RUNTIME_OVERLAY_INSTALLED_BYTES_INVALID');
  }
  if(overlay.workingMemoryBytes==='UNKNOWN'
    ||!Number.isSafeInteger(overlay.workingMemoryBytes)
    ||Number(overlay.workingMemoryBytes)<1){
    blockers.push('RUNTIME_OVERLAY_WORKING_MEMORY_INVALID');
  }

  if(!zeroAllowed.some(value=>value==='UNKNOWN')){
    const sum=safeSum(zeroAllowed as number[]);
    if(sum===null||sum!==overlay.mandatoryInstalledBytes){
      blockers.push('RUNTIME_OVERLAY_INSTALLED_TOTAL_MISMATCH');
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
    blockers.push('RUNTIME_OVERLAY_AUTHORITY_WIDENING');
  }
}

function validateNonRuntimePreservation(
  before:HsmeFoundationReuseCandidateV1,
  after:HsmeFoundationReuseCandidateV1,
  blockers:string[],
):void{
  if(before.candidateId!==after.candidateId
    ||before.strategy!==after.strategy
    ||before.targetTier!==after.targetTier
    ||before.evidenceState!==after.evidenceState
    ||JSON.stringify(before.source)!==JSON.stringify(after.source)
    ||before.licenseConclusion!==after.licenseConclusion
    ||before.licenseEvidenceSha256!==after.licenseEvidenceSha256
    ||JSON.stringify(before.quality)!==JSON.stringify(after.quality)
    ||JSON.stringify(before.training)!==JSON.stringify(after.training)
    ||JSON.stringify(before.rejectionReasons)!==JSON.stringify(after.rejectionReasons)){
    blockers.push('NON_RUNTIME_CANDIDATE_MUTATION');
  }
  if(after.evidenceState!=='UNRESOLVED')blockers.push('CANDIDATE_QUALIFICATION_FORBIDDEN');
}

function validateAppliedRuntime(
  candidate:HsmeFoundationReuseCandidateV1,
  overlay:HsmeFoundationPhysicalReuseRuntimeOverlayV1,
  blockers:string[],
):void{
  const runtime=candidate.runtime;
  if(runtime.backboneBytes!==overlay.backboneBytes
    ||runtime.conditionerBytes!==overlay.conditionerBytes
    ||runtime.vaeBytes!==overlay.vaeBytes
    ||runtime.adapterBytes!==overlay.adapterBytes
    ||runtime.otherRequiredBytes!==overlay.otherRequiredBytes
    ||runtime.mandatoryInstalledBytes!==overlay.mandatoryInstalledBytes
    ||runtime.workingMemoryBytes!==overlay.workingMemoryBytes
    ||runtime.evidenceSha256!==overlay.runtimeEvidenceSha256){
    blockers.push('APPLIED_RUNTIME_DRIFT');
  }
}

async function digestCandidate(
  domain:string,
  candidate:HsmeFoundationReuseCandidateV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
  blocker:string,
):Promise<string|null>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(candidate)));
    if(!HEX64.test(result))throw new Error('hash invalid');
    return result;
  }catch{
    blockers.push(blocker);
    return null;
  }
}

function safeSum(values:readonly number[]):number|null{
  let total=0;
  for(const value of values){
    if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-total)return null;
    total+=value;
  }
  return total;
}

function validIdentifier(value:string,max:number):boolean{
  return value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return value!=='UNKNOWN'&&HEX64.test(value)?value:'UNKNOWN';
}

function authorityBoundary(){
  return Object.freeze({
    candidateQualificationAllowed:false as const,
    selectedCandidateIdAllowed:false as const,
    decisionStatusMutationAllowed:false as const,
    strategyMutationAllowed:false as const,
    licenseMutationAllowed:false as const,
    qualityMutationAllowed:false as const,
    trainingMutationAllowed:false as const,
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
    HsmeFoundationPendingReuseRuntimeApplicationV1,
    'sourceDecisionSha256'|'sourceCandidateSha256'|'appliedCandidateSha256'|'pendingDecisionSha256'|'runtimeEvidenceSha256'
  >>={},
):HsmeFoundationPendingReuseRuntimeApplicationV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PENDING_REUSE_RUNTIME_APPLICATION_V1_SCHEMA,
    candidateId,
    capability,
    state:'RUNTIME_OVERLAY_APPLICATION_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    sourceCandidateSha256:values.sourceCandidateSha256??'UNKNOWN',
    appliedCandidateSha256:values.appliedCandidateSha256??'UNKNOWN',
    pendingDecisionSha256:values.pendingDecisionSha256??'UNKNOWN',
    runtimeEvidenceSha256:values.runtimeEvidenceSha256??'UNKNOWN',
    candidate:null,
    pendingDecision:null,
    ...authorityBoundary(),
  });
}

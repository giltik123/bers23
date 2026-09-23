import {
  hsmeFoundationReuseDecisionV1Digest,
  mayEscalateToFullHsmeStudentDistillationV1,
  normalizeHsmeFoundationReuseDecisionV1,
  type HsmeFoundationReuseCandidateV1,
} from './HsmeFoundationReuseDecisionV1';
import {
  HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
  type HsmeFoundationReuseDecisionFinalizationV1,
} from './HsmeFoundationReuseDecisionFinalizationV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA =
  'BERS_HSME_REUSE_OUTCOME_HANDOFF_V1' as const;
export const HSME_REUSE_OUTCOME_HANDOFF_DIGEST_DOMAIN =
  'bers:hsme:reuse-outcome-handoff:v1\0' as const;
export const HSME_REUSE_OUTCOME_ASSEMBLY_REFS_DIGEST_DOMAIN =
  'bers:hsme:reuse-outcome-assembly-refs:v1\0' as const;
export const HSME_REUSE_OUTCOME_SELECTED_CANDIDATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-outcome-selected-candidate:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeReuseOutcomeHandoffStateV1=
  | 'HANDOFF_INVALID'
  | 'HANDOFF_PENDING'
  | 'DIRECT_REUSE_HANDOFF_READY'
  | 'BOUNDED_ADAPTATION_HANDOFF_READY'
  | 'FULL_STUDENT_DISTILLATION_HANDOFF_READY';

export interface HsmeReuseOutcomeFinalizationOriginVerifierV1{
  verifyFinalization(
    finalization:HsmeFoundationReuseDecisionFinalizationV1,
    expectedFinalizationEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeReuseOutcomeHandoffV1=Readonly<{
  schemaVersion:typeof HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA;
  state:HsmeReuseOutcomeHandoffStateV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  finalDecisionSha256:string|'UNKNOWN';
  finalizationEvidenceSha256:string|'UNKNOWN';
  candidateAssemblyRefsSha256:string|'UNKNOWN';
  selectedCandidateId?:string;
  selectedCandidateEvidenceSha256:string|'UNKNOWN';
  handoffEvidenceSha256:string|'UNKNOWN';
  reusePhasePermitted:boolean;
  fullStudentDistillationPhasePermitted:boolean;
  trainingRunStartAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function proveHsmeReuseOutcomeHandoffV1(
  finalization:HsmeFoundationReuseDecisionFinalizationV1,
  origin:HsmeReuseOutcomeFinalizationOriginVerifierV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeReuseOutcomeHandoffV1>{
  const blockers:string[]=[];
  if(finalization.schemaVersion!==HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA){
    return invalid(['HANDOFF_FINALIZATION_SCHEMA_INVALID']);
  }
  if(finalizerAuthorityWidened(finalization)){
    blockers.push('HANDOFF_FINALIZATION_AUTHORITY_WIDENING');
  }

  if(
    finalization.state==='DECISION_EVIDENCE_INVALID'
    ||finalization.state==='DECISION_EVIDENCE_INCOMPLETE'
    ||finalization.state==='SELECTION_AMBIGUOUS'
  ){
    if(finalization.reuseAdvanceAllowed!==false
      ||finalization.fullStudentEscalationAllowed!==false
      ||finalization.finalDecision!==null
      ||finalization.finalDecisionSha256!=='UNKNOWN'){
      blockers.push('HANDOFF_PENDING_FINALIZATION_AUTHORITY_INVALID');
    }
    if(blockers.length>0)return invalid(blockers,{
      sourceDecisionSha256:valueOrUnknown(finalization.sourceDecisionSha256),
    });
    return pending(finalization.blockers,{
      sourceDecisionSha256:valueOrUnknown(finalization.sourceDecisionSha256),
    });
  }

  if(!Array.isArray(finalization.blockers)||finalization.blockers.length!==0){
    blockers.push('HANDOFF_READY_FINALIZATION_BLOCKERS_PRESENT');
  }
  if(finalization.finalDecision===null){
    blockers.push('HANDOFF_FINAL_DECISION_REQUIRED');
    return invalid(blockers,{
      sourceDecisionSha256:valueOrUnknown(finalization.sourceDecisionSha256),
    });
  }
  if(!digestKnown(finalization.sourceDecisionSha256)
    ||!digestKnown(finalization.campaignDigest)
    ||!digestKnown(finalization.qualityFrontierSha256)
    ||!digestKnown(finalization.paretoEvidenceSha256)
    ||!digestKnown(finalization.finalDecisionSha256)
    ||!digestKnown(finalization.finalizationEvidenceSha256)){
    blockers.push('HANDOFF_FINALIZATION_DIGEST_INCOMPLETE');
  }

  const refs=normalizeRefs(finalization.candidateAssemblyRefs,blockers);
  let candidateAssemblyRefsSha256:string|'UNKNOWN'='UNKNOWN';
  if(refs!==null){
    try{
      candidateAssemblyRefsSha256=await digest(
        HSME_REUSE_OUTCOME_ASSEMBLY_REFS_DIGEST_DOMAIN,
        refs,
        hash,
        'HANDOFF_ASSEMBLY_REFS_HASH_INVALID',
      );
    }catch{
      blockers.push('HANDOFF_ASSEMBLY_REFS_HASH_INVALID');
    }
  }

  let finalDecision;
  let finalDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    finalDecision=normalizeHsmeFoundationReuseDecisionV1(finalization.finalDecision);
    finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(finalDecision,hash);
    if(finalDecisionSha256!==finalization.finalDecisionSha256){
      blockers.push('HANDOFF_FINAL_DECISION_DIGEST_MISMATCH');
    }
  }catch{
    blockers.push('HANDOFF_FINAL_DECISION_INVALID');
  }

  let recomputedFinalizationSha256:string|'UNKNOWN'='UNKNOWN';
  if(finalDecision&&digestKnown(finalDecisionSha256)){
    try{
      recomputedFinalizationSha256=await digest(
        HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN,
        finalizationPayload(finalization),
        hash,
        'HANDOFF_FINALIZATION_REHASH_INVALID',
      );
      if(recomputedFinalizationSha256!==finalization.finalizationEvidenceSha256){
        blockers.push('HANDOFF_FINALIZATION_REHASH_MISMATCH');
      }
    }catch{
      blockers.push('HANDOFF_FINALIZATION_REHASH_INVALID');
    }
  }

  if(
    digestKnown(recomputedFinalizationSha256)
    &&recomputedFinalizationSha256===finalization.finalizationEvidenceSha256
  ){
    let trusted=false;
    try{
      trusted=await origin.verifyFinalization(
        finalization,
        recomputedFinalizationSha256,
      );
    }catch{
      trusted=false;
    }
    if(!trusted)blockers.push('HANDOFF_FINALIZATION_ORIGIN_UNVERIFIED');
  }else{
    blockers.push('HANDOFF_FINALIZATION_ORIGIN_NOT_CHECKABLE');
  }

  if(blockers.length>0){
    return invalid(blockers,{
      sourceDecisionSha256:valueOrUnknown(finalization.sourceDecisionSha256),
      finalDecisionSha256:valueOrUnknown(finalization.finalDecisionSha256),
      finalizationEvidenceSha256:valueOrUnknown(finalization.finalizationEvidenceSha256),
      candidateAssemblyRefsSha256,
    });
  }

  if(!finalDecision||!digestKnown(finalDecisionSha256)||!digestKnown(candidateAssemblyRefsSha256)){
    return invalid(['HANDOFF_INTERNAL_READY_BINDING_INCOMPLETE']);
  }

  if(finalization.state==='DIRECT_FOUNDATION_ADVANCE_READY'){
    if(finalization.reuseAdvanceAllowed!==true
      ||finalization.fullStudentEscalationAllowed!==false
      ||finalDecision.decisionStatus!=='DIRECT_FOUNDATION_ADVANCE'){
      return invalid(['HANDOFF_DIRECT_FINALIZATION_STATE_DRIFT']);
    }
    const selected=selectedCandidate(finalDecision,finalization.selectedCandidateId,blockers);
    if(!selected
      ||selected.strategy!=='DIRECT_FOUNDATION'
      ||selected.targetTier!=='MOBILE_DEFAULT'
      ||selected.evidenceState!=='QUALIFIED'){
      blockers.push('HANDOFF_DIRECT_SELECTED_CANDIDATE_INVALID');
    }
    if(blockers.length>0)return invalid(blockers);
    return readyReuse(
      'DIRECT_REUSE_HANDOFF_READY',
      finalization,
      finalDecisionSha256,
      candidateAssemblyRefsSha256,
      selected!,
      hash,
    );
  }

  if(finalization.state==='BOUNDED_ADAPTATION_ADVANCE_READY'){
    if(finalization.reuseAdvanceAllowed!==true
      ||finalization.fullStudentEscalationAllowed!==false
      ||finalDecision.decisionStatus!=='BOUNDED_ADAPTATION_ADVANCE'){
      return invalid(['HANDOFF_ADAPTATION_FINALIZATION_STATE_DRIFT']);
    }
    const selected=selectedCandidate(finalDecision,finalization.selectedCandidateId,blockers);
    if(!selected
      ||selected.strategy!=='FROZEN_FOUNDATION_ADAPTATION'
      ||selected.targetTier!=='MOBILE_DEFAULT'
      ||selected.evidenceState!=='QUALIFIED'){
      blockers.push('HANDOFF_ADAPTATION_SELECTED_CANDIDATE_INVALID');
    }
    if(blockers.length>0)return invalid(blockers);
    return readyReuse(
      'BOUNDED_ADAPTATION_HANDOFF_READY',
      finalization,
      finalDecisionSha256,
      candidateAssemblyRefsSha256,
      selected!,
      hash,
    );
  }

  if(finalization.state==='REUSE_PATH_INSUFFICIENT_READY'){
    if(finalization.reuseAdvanceAllowed!==false
      ||finalization.fullStudentEscalationAllowed!==true
      ||finalDecision.decisionStatus!=='REUSE_PATH_INSUFFICIENT'
      ||finalDecision.selectedCandidateId!==undefined
      ||finalization.selectedCandidateId!==undefined){
      return invalid(['HANDOFF_FULL_STUDENT_FINALIZATION_STATE_DRIFT']);
    }
    let escalation=false;
    try{
      escalation=mayEscalateToFullHsmeStudentDistillationV1(finalDecision);
    }catch{
      escalation=false;
    }
    if(!escalation){
      return invalid(['HANDOFF_FULL_STUDENT_ESCALATION_REPROOF_FAILED']);
    }
    const handoffEvidenceSha256=await handoffDigest({
      state:'FULL_STUDENT_DISTILLATION_HANDOFF_READY',
      sourceDecisionSha256:finalization.sourceDecisionSha256 as string,
      finalDecisionSha256,
      finalizationEvidenceSha256:finalization.finalizationEvidenceSha256 as string,
      candidateAssemblyRefsSha256,
      selectedCandidateEvidenceSha256:'UNKNOWN',
      reusePhasePermitted:false,
      fullStudentDistillationPhasePermitted:true,
    },hash);
    return Object.freeze({
      schemaVersion:HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
      state:'FULL_STUDENT_DISTILLATION_HANDOFF_READY',
      blockers:Object.freeze([]),
      sourceDecisionSha256:finalization.sourceDecisionSha256 as string,
      finalDecisionSha256,
      finalizationEvidenceSha256:finalization.finalizationEvidenceSha256 as string,
      candidateAssemblyRefsSha256,
      selectedCandidateEvidenceSha256:'UNKNOWN',
      handoffEvidenceSha256,
      reusePhasePermitted:false,
      fullStudentDistillationPhasePermitted:true,
      ...authorityBoundary(),
    });
  }

  return invalid(['HANDOFF_FINALIZATION_STATE_UNSUPPORTED']);
}

async function readyReuse(
  state:'DIRECT_REUSE_HANDOFF_READY'|'BOUNDED_ADAPTATION_HANDOFF_READY',
  finalization:HsmeFoundationReuseDecisionFinalizationV1,
  finalDecisionSha256:string,
  candidateAssemblyRefsSha256:string,
  selected:HsmeFoundationReuseCandidateV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeReuseOutcomeHandoffV1>{
  const selectedCandidateEvidenceSha256=await digest(
    HSME_REUSE_OUTCOME_SELECTED_CANDIDATE_DIGEST_DOMAIN,
    selected,
    hash,
    'HANDOFF_SELECTED_CANDIDATE_HASH_INVALID',
  );
  const handoffEvidenceSha256=await handoffDigest({
    state,
    sourceDecisionSha256:finalization.sourceDecisionSha256 as string,
    finalDecisionSha256,
    finalizationEvidenceSha256:finalization.finalizationEvidenceSha256 as string,
    candidateAssemblyRefsSha256,
    selectedCandidateId:selected.candidateId,
    selectedCandidateEvidenceSha256,
    reusePhasePermitted:true,
    fullStudentDistillationPhasePermitted:false,
  },hash);
  return Object.freeze({
    schemaVersion:HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
    state,
    blockers:Object.freeze([]),
    sourceDecisionSha256:finalization.sourceDecisionSha256 as string,
    finalDecisionSha256,
    finalizationEvidenceSha256:finalization.finalizationEvidenceSha256 as string,
    candidateAssemblyRefsSha256,
    selectedCandidateId:selected.candidateId,
    selectedCandidateEvidenceSha256,
    handoffEvidenceSha256,
    reusePhasePermitted:true,
    fullStudentDistillationPhasePermitted:false,
    ...authorityBoundary(),
  });
}

function selectedCandidate(
  decision:ReturnType<typeof normalizeHsmeFoundationReuseDecisionV1>,
  selectedCandidateId:string|undefined,
  blockers:string[],
):HsmeFoundationReuseCandidateV1|null{
  if(!selectedCandidateId||decision.selectedCandidateId!==selectedCandidateId){
    blockers.push('HANDOFF_SELECTED_CANDIDATE_ID_DRIFT');
    return null;
  }
  const matches=decision.candidates.filter(value=>value.candidateId===selectedCandidateId);
  if(matches.length!==1){
    blockers.push('HANDOFF_SELECTED_CANDIDATE_LOOKUP_INVALID');
    return null;
  }
  return matches[0];
}

function normalizeRefs(
  refs:HsmeFoundationReuseDecisionFinalizationV1['candidateAssemblyRefs'],
  blockers:string[],
):readonly HsmeFoundationReuseDecisionFinalizationV1['candidateAssemblyRefs'][number][]|null{
  if(!Array.isArray(refs)||refs.length<1||refs.length>16){
    blockers.push('HANDOFF_ASSEMBLY_REFS_INVALID');
    return null;
  }
  const ids=new Set<string>();
  const normalized=[...refs].sort((a,b)=>lexical(a.candidateId,b.candidateId));
  for(const ref of normalized){
    if(!validIdentifier(ref.candidateId,120)
      ||(ref.state!=='CANDIDATE_EVIDENCE_QUALIFIED'&&ref.state!=='CANDIDATE_EVIDENCE_REJECTED')
      ||!digestKnown(ref.candidateEvidenceSetSha256)
      ||!digestKnown(ref.assembledCandidateSha256)){
      blockers.push('HANDOFF_ASSEMBLY_REF_INVALID');
      return null;
    }
    if(ids.has(ref.candidateId)){
      blockers.push('HANDOFF_ASSEMBLY_REF_DUPLICATE');
      return null;
    }
    ids.add(ref.candidateId);
  }
  return Object.freeze(normalized.map(value=>Object.freeze({...value})));
}

function finalizationPayload(value:HsmeFoundationReuseDecisionFinalizationV1){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:value.state,
    sourceDecisionSha256:value.sourceDecisionSha256,
    campaignDigest:value.campaignDigest,
    qualityFrontierSha256:value.qualityFrontierSha256,
    paretoEvidenceSha256:value.paretoEvidenceSha256,
    candidateAssemblyRefs:value.candidateAssemblyRefs,
    eligibleCandidateIds:value.eligibleCandidateIds,
    ...(value.selectedCandidateId?{selectedCandidateId:value.selectedCandidateId}:{}),
    finalDecisionSha256:value.finalDecisionSha256,
    reuseAdvanceAllowed:value.reuseAdvanceAllowed,
    fullStudentEscalationAllowed:value.fullStudentEscalationAllowed,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    trainingOrDistillationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  };
}

async function handoffDigest(
  value:{
    state:
      |'DIRECT_REUSE_HANDOFF_READY'
      |'BOUNDED_ADAPTATION_HANDOFF_READY'
      |'FULL_STUDENT_DISTILLATION_HANDOFF_READY';
    sourceDecisionSha256:string;
    finalDecisionSha256:string;
    finalizationEvidenceSha256:string;
    candidateAssemblyRefsSha256:string;
    selectedCandidateId?:string;
    selectedCandidateEvidenceSha256:string|'UNKNOWN';
    reusePhasePermitted:boolean;
    fullStudentDistillationPhasePermitted:boolean;
  },
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  return digest(
    HSME_REUSE_OUTCOME_HANDOFF_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
      ...value,
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
    },
    hash,
    'HANDOFF_EVIDENCE_HASH_INVALID',
  );
}

function finalizerAuthorityWidened(value:HsmeFoundationReuseDecisionFinalizationV1):boolean{
  return value.modelFleetPromotionAllowed!==false
    ||value.installOrDownloadAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.trainingOrDistillationAllowed!==false
    ||value.winnerSelectionAllowed!==false;
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

function digestKnown(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}
function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return digestKnown(value)?value:'UNKNOWN';
}
function validIdentifier(value:string,max:number):boolean{
  return value.length>0&&value.length<=max&&/^[a-z0-9][a-z0-9._:@/-]*$/.test(value);
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function authorityBoundary(){
  return Object.freeze({
    trainingRunStartAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function invalid(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeReuseOutcomeHandoffV1,
    'sourceDecisionSha256'|'finalDecisionSha256'|'finalizationEvidenceSha256'|
    'candidateAssemblyRefsSha256'
  >>={},
):HsmeReuseOutcomeHandoffV1{
  return Object.freeze({
    schemaVersion:HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
    state:'HANDOFF_INVALID',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    finalDecisionSha256:values.finalDecisionSha256??'UNKNOWN',
    finalizationEvidenceSha256:values.finalizationEvidenceSha256??'UNKNOWN',
    candidateAssemblyRefsSha256:values.candidateAssemblyRefsSha256??'UNKNOWN',
    selectedCandidateEvidenceSha256:'UNKNOWN',
    handoffEvidenceSha256:'UNKNOWN',
    reusePhasePermitted:false,
    fullStudentDistillationPhasePermitted:false,
    ...authorityBoundary(),
  });
}

function pending(
  blockers:readonly string[],
  values:Partial<Pick<HsmeReuseOutcomeHandoffV1,'sourceDecisionSha256'>>={},
):HsmeReuseOutcomeHandoffV1{
  return Object.freeze({
    schemaVersion:HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
    state:'HANDOFF_PENDING',
    blockers:Object.freeze([...new Set(blockers)]),
    sourceDecisionSha256:values.sourceDecisionSha256??'UNKNOWN',
    finalDecisionSha256:'UNKNOWN',
    finalizationEvidenceSha256:'UNKNOWN',
    candidateAssemblyRefsSha256:'UNKNOWN',
    selectedCandidateEvidenceSha256:'UNKNOWN',
    handoffEvidenceSha256:'UNKNOWN',
    reusePhasePermitted:false,
    fullStudentDistillationPhasePermitted:false,
    ...authorityBoundary(),
  });
}

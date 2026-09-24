import {
  HSME_FULL_STUDENT_REPRODUCTION_EVIDENCE_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
} from './HsmeFullStudentTrainingPlanContractV1.ts';
export {
  HSME_FULL_STUDENT_REPRODUCTION_EVIDENCE_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
} from './HsmeFullStudentTrainingPlanContractV1.ts';

import {
  HSME_REUSE_OUTCOME_HANDOFF_DIGEST_DOMAIN,
  HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
  type HsmeReuseOutcomeHandoffV1,
} from './HsmeReuseOutcomeHandoffV1';
import {
  HSME_TEACHER_ADMISSION_FINALIZATION_DIGEST_DOMAIN,
  HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA,
  HSME_TEACHER_ADMISSION_GATE_EVIDENCE_DIGEST_DOMAIN,
  type HsmeTeacherAdmissionFinalizationV1,
} from './HsmeTeacherAdmissionFinalizationV1';
import {
  proveHsmeTrainingReproductionFixtureV1,
  type HsmeTrainingReproductionEvidenceV1,
  type HsmeTrainingReproductionFixtureV1,
} from './HsmeTrainingReproductionGateV1';
import {
  hsmeTrainingProvenanceDigestV1,
  type HsmeTrainingHashPortV1,
} from './HsmeTrainingProvenanceV1';

const HEX64=/^[0-9a-f]{64}$/;

export interface HsmeFullStudentTrainingPlanAdmissionOriginVerifierV1{
  verifyReuseHandoff(
    handoff:HsmeReuseOutcomeHandoffV1,
    expectedHandoffEvidenceSha256:string,
  ):Promise<boolean>;
  verifyTeacherFinalization(
    finalization:HsmeTeacherAdmissionFinalizationV1,
    expectedFinalizationEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeFullStudentTrainingPlanAdmissionStateV1=
  | 'TRAINING_PLAN_INVALID'
  | 'TRAINING_PLAN_BLOCKED'
  | 'TRAINING_PLAN_READY_NOT_AUTHORIZED';

export type HsmeFullStudentTrainingPlanAdmissionV1=Readonly<{
  schemaVersion:typeof HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA;
  state:HsmeFullStudentTrainingPlanAdmissionStateV1;
  blockers:readonly string[];
  reuseHandoffEvidenceSha256:string|'UNKNOWN';
  reuseSourceDecisionSha256:string|'UNKNOWN';
  reuseFinalDecisionSha256:string|'UNKNOWN';
  teacherAdmissionFinalizationSha256:string|'UNKNOWN';
  teacherDecisionSha256:string|'UNKNOWN';
  teacherAdmissionGateEvidenceSha256:string|'UNKNOWN';
  selectedTeacherIds:readonly string[];
  reproductionEvidenceSha256:string|'UNKNOWN';
  corpusShardDigests:readonly string[];
  corpusRootDigest:string|'UNKNOWN';
  recipeDigest:string|'UNKNOWN';
  checkpointSha256:string|'UNKNOWN';
  resumeCheckpointSha256:string|'UNKNOWN';
  deterministicTargetCount:number;
  planEvidenceSha256:string|'UNKNOWN';
  trainingRunStartAllowed:false;
  trainingOrDistillationExecutionAllowed:false;
  checkpointPromotionAllowed:false;
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

export class HsmeFullStudentTrainingPlanAdmissionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFullStudentTrainingPlanAdmissionV1Error';
    this.code=code;
  }
}

export async function admitHsmeFullStudentTrainingPlanV1(
  handoff:HsmeReuseOutcomeHandoffV1,
  teacherFinalization:HsmeTeacherAdmissionFinalizationV1,
  reproductionFixture:HsmeTrainingReproductionFixtureV1,
  origin:HsmeFullStudentTrainingPlanAdmissionOriginVerifierV1,
  hash:HsmeTrainingHashPortV1,
):Promise<HsmeFullStudentTrainingPlanAdmissionV1>{
  if(!handoff||handoff.schemaVersion!==HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA){
    return invalid(['TRAINING_PLAN_HANDOFF_SCHEMA_INVALID']);
  }

  if(
    handoff.state!=='FULL_STUDENT_DISTILLATION_HANDOFF_READY'
  ){
    return blocked(['TRAINING_PLAN_FULL_STUDENT_HANDOFF_REQUIRED'],{
      reuseHandoffEvidenceSha256:valueOrUnknown(handoff.handoffEvidenceSha256),
      reuseSourceDecisionSha256:valueOrUnknown(handoff.sourceDecisionSha256),
      reuseFinalDecisionSha256:valueOrUnknown(handoff.finalDecisionSha256),
    });
  }

  const invalidBlockers:string[]=[];
  if(!Array.isArray(handoff.blockers)||handoff.blockers.length!==0){
    invalidBlockers.push('TRAINING_PLAN_HANDOFF_BLOCKERS_PRESENT');
  }
  if(
    handoff.reusePhasePermitted!==false
    ||handoff.fullStudentDistillationPhasePermitted!==true
    ||handoff.trainingRunStartAllowed!==false
    ||handoff.modelInstallAllowed!==false
    ||handoff.modelFleetPromotionAllowed!==false
    ||handoff.productionAuthorityGranted!==false
    ||handoff.providerAuthorityGranted!==false
    ||handoff.billingAuthorityGranted!==false
    ||handoff.projectArtifactMutationAllowed!==false
    ||handoff.aeeExecutionAuthorityGranted!==false
    ||handoff.durableModelFleetPromotionAllowed!==false
    ||handoff.winnerSelectionAllowed!==false
  ){
    invalidBlockers.push('TRAINING_PLAN_HANDOFF_AUTHORITY_INVALID');
  }
  if(
    !digestKnown(handoff.sourceDecisionSha256)
    ||!digestKnown(handoff.finalDecisionSha256)
    ||!digestKnown(handoff.finalizationEvidenceSha256)
    ||!digestKnown(handoff.candidateAssemblyRefsSha256)
    ||!digestKnown(handoff.handoffEvidenceSha256)
  ){
    invalidBlockers.push('TRAINING_PLAN_HANDOFF_DIGEST_INCOMPLETE');
  }
  if(
    Object.hasOwn(handoff,'selectedCandidateId')
    ||handoff.selectedCandidateEvidenceSha256!=='UNKNOWN'
  ){
    invalidBlockers.push('TRAINING_PLAN_HANDOFF_SELECTED_REUSE_CANDIDATE_FORBIDDEN');
  }

  let handoffEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  if(invalidBlockers.length===0){
    try{
      handoffEvidenceSha256=await digest(
        HSME_REUSE_OUTCOME_HANDOFF_DIGEST_DOMAIN,
        handoffPayload(handoff),
        hash,
      );
      if(handoffEvidenceSha256!==handoff.handoffEvidenceSha256){
        invalidBlockers.push('TRAINING_PLAN_HANDOFF_REHASH_MISMATCH');
      }else if(!await verifyOrigin(
        ()=>origin.verifyReuseHandoff(handoff,handoffEvidenceSha256 as string),
      )){
        invalidBlockers.push('TRAINING_PLAN_HANDOFF_ORIGIN_UNVERIFIED');
      }
    }catch{
      invalidBlockers.push('TRAINING_PLAN_HANDOFF_REHASH_INVALID');
    }
  }

  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,{
      reuseHandoffEvidenceSha256:handoffEvidenceSha256,
      reuseSourceDecisionSha256:valueOrUnknown(handoff.sourceDecisionSha256),
      reuseFinalDecisionSha256:valueOrUnknown(handoff.finalDecisionSha256),
    });
  }

  if(
    !teacherFinalization
    ||teacherFinalization.schemaVersion!==HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA
  ){
    return invalid([
      ...invalidBlockers,
      'TRAINING_PLAN_TEACHER_FINALIZATION_SCHEMA_INVALID',
    ],{
      reuseHandoffEvidenceSha256:handoffEvidenceSha256,
      reuseSourceDecisionSha256:valueOrUnknown(handoff.sourceDecisionSha256),
      reuseFinalDecisionSha256:valueOrUnknown(handoff.finalDecisionSha256),
    });
  }

  if(teacherFinalization.state==='FINALIZATION_BLOCKED'){
    return blocked([
      ...invalidBlockers,
      'TRAINING_PLAN_TEACHER_ADMISSION_NOT_READY',
      ...teacherFinalization.blockers,
    ],{
      reuseHandoffEvidenceSha256:handoffEvidenceSha256,
      reuseSourceDecisionSha256:valueOrUnknown(handoff.sourceDecisionSha256),
      reuseFinalDecisionSha256:valueOrUnknown(handoff.finalDecisionSha256),
      selectedTeacherIds:teacherFinalization.selectedTeacherIds,
    });
  }
  if(teacherFinalization.state!=='TEACHER_SET_ADMITTED_READY'){
    invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_NOT_ADMITTED');
  }
  if(
    !Array.isArray(teacherFinalization.blockers)
    ||teacherFinalization.blockers.length!==0
  ){
    invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_BLOCKERS_PRESENT');
  }
  if(
    teacherFinalization.finalDecision===null
    ||teacherFinalization.admissionGateEvidence===null
  ){
    invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_PAYLOAD_MISSING');
  }
  if(
    teacherFinalization.trainingStartAllowed!==false
    ||teacherFinalization.productionAuthorityGranted!==false
    ||teacherFinalization.providerAuthorityGranted!==false
    ||teacherFinalization.billingAuthorityGranted!==false
    ||teacherFinalization.projectArtifactMutationAllowed!==false
    ||teacherFinalization.aeeExecutionAuthorityGranted!==false
    ||teacherFinalization.durableModelFleetPromotionAllowed!==false
    ||teacherFinalization.winnerSelectionAllowed!==false
  ){
    invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_AUTHORITY_INVALID');
  }
  for(const value of [
    teacherFinalization.eligibilityEvidenceSha256,
    teacherFinalization.rosterRefreshSha256,
    teacherFinalization.qualityBakeoffAssemblySha256,
    teacherFinalization.selectionRationaleSha256,
    teacherFinalization.finalDecisionSha256,
    teacherFinalization.admissionGateEvidenceSha256,
    teacherFinalization.finalizationEvidenceSha256,
  ]){
    if(!digestKnown(value)){
      invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_DIGEST_INCOMPLETE');
      break;
    }
  }

  let teacherDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  let teacherAdmissionGateEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let teacherAdmissionFinalizationSha256:string|'UNKNOWN'='UNKNOWN';

  if(
    teacherFinalization.finalDecision!==null
    &&teacherFinalization.admissionGateEvidence!==null
  ){
    try{
      teacherDecisionSha256=await hsmeTrainingProvenanceDigestV1(
        teacherFinalization.finalDecision,
        hash,
      );
      if(teacherDecisionSha256!==teacherFinalization.finalDecisionSha256){
        invalidBlockers.push('TRAINING_PLAN_TEACHER_DECISION_REHASH_MISMATCH');
      }
      if(
        !sameStrings(
          teacherFinalization.selectedTeacherIds,
          teacherFinalization.finalDecision.selectedCandidateIds,
        )
      ){
        invalidBlockers.push('TRAINING_PLAN_TEACHER_SELECTED_SET_DECISION_DRIFT');
      }
    }catch{
      invalidBlockers.push('TRAINING_PLAN_TEACHER_DECISION_REHASH_INVALID');
    }

    try{
      teacherAdmissionGateEvidenceSha256=await digest(
        HSME_TEACHER_ADMISSION_GATE_EVIDENCE_DIGEST_DOMAIN,
        teacherFinalization.admissionGateEvidence,
        hash,
      );
      if(
        teacherAdmissionGateEvidenceSha256
        !==teacherFinalization.admissionGateEvidenceSha256
      ){
        invalidBlockers.push('TRAINING_PLAN_TEACHER_GATE_REHASH_MISMATCH');
      }
      if(
        !sameStrings(
          teacherFinalization.selectedTeacherIds,
          teacherFinalization.admissionGateEvidence.selectedTeacherIds,
        )
      ){
        invalidBlockers.push('TRAINING_PLAN_TEACHER_SELECTED_SET_GATE_DRIFT');
      }
    }catch{
      invalidBlockers.push('TRAINING_PLAN_TEACHER_GATE_REHASH_INVALID');
    }
  }

  if(
    digestKnown(teacherDecisionSha256)
    &&digestKnown(teacherAdmissionGateEvidenceSha256)
  ){
    try{
      teacherAdmissionFinalizationSha256=await digest(
        HSME_TEACHER_ADMISSION_FINALIZATION_DIGEST_DOMAIN,
        teacherFinalizationPayload(
          teacherFinalization,
          teacherDecisionSha256,
          teacherAdmissionGateEvidenceSha256,
        ),
        hash,
      );
      if(
        teacherAdmissionFinalizationSha256
        !==teacherFinalization.finalizationEvidenceSha256
      ){
        invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_REHASH_MISMATCH');
      }else if(!await verifyOrigin(
        ()=>origin.verifyTeacherFinalization(
          teacherFinalization,
          teacherAdmissionFinalizationSha256 as string,
        ),
      )){
        invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_ORIGIN_UNVERIFIED');
      }
    }catch{
      invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_REHASH_INVALID');
    }
  }else{
    invalidBlockers.push('TRAINING_PLAN_TEACHER_FINALIZATION_ORIGIN_NOT_CHECKABLE');
  }

  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,{
      reuseHandoffEvidenceSha256:handoffEvidenceSha256,
      reuseSourceDecisionSha256:valueOrUnknown(handoff.sourceDecisionSha256),
      reuseFinalDecisionSha256:valueOrUnknown(handoff.finalDecisionSha256),
      teacherAdmissionFinalizationSha256,
      teacherDecisionSha256,
      teacherAdmissionGateEvidenceSha256,
      selectedTeacherIds:teacherFinalization.selectedTeacherIds,
    });
  }

  let reproduction:HsmeTrainingReproductionEvidenceV1;
  try{
    reproduction=await proveHsmeTrainingReproductionFixtureV1(
      reproductionFixture,
      hash,
    );
  }catch(error){
    return invalid([
      'TRAINING_PLAN_REPRODUCTION_PROOF_INVALID'
      +(error&&typeof error==='object'&&'code' in error
        ?':'+String((error as {code?:unknown}).code??'UNKNOWN')
        :''),
    ],{
      reuseHandoffEvidenceSha256:handoffEvidenceSha256,
      reuseSourceDecisionSha256:handoff.sourceDecisionSha256,
      reuseFinalDecisionSha256:handoff.finalDecisionSha256,
      teacherAdmissionFinalizationSha256,
      teacherDecisionSha256,
      teacherAdmissionGateEvidenceSha256,
      selectedTeacherIds:teacherFinalization.selectedTeacherIds,
    });
  }

  if(reproduction.teacherDecisionDigest!==teacherDecisionSha256){
    return invalid(['TRAINING_PLAN_REPRODUCTION_TEACHER_DECISION_MISMATCH'],{
      reuseHandoffEvidenceSha256:handoffEvidenceSha256,
      reuseSourceDecisionSha256:handoff.sourceDecisionSha256,
      reuseFinalDecisionSha256:handoff.finalDecisionSha256,
      teacherAdmissionFinalizationSha256,
      teacherDecisionSha256,
      teacherAdmissionGateEvidenceSha256,
      selectedTeacherIds:teacherFinalization.selectedTeacherIds,
    });
  }

  let reproductionEvidenceSha256:string;
  try{
    reproductionEvidenceSha256=await digest(
      HSME_FULL_STUDENT_REPRODUCTION_EVIDENCE_DIGEST_DOMAIN,
      reproduction,
      hash,
    );
  }catch{
    return invalid(['TRAINING_PLAN_REPRODUCTION_EVIDENCE_HASH_INVALID']);
  }

  const readyPayload={
    schemaVersion:HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
    state:'TRAINING_PLAN_READY_NOT_AUTHORIZED' as const,
    reuseHandoffEvidenceSha256:handoffEvidenceSha256 as string,
    reuseSourceDecisionSha256:handoff.sourceDecisionSha256,
    reuseFinalDecisionSha256:handoff.finalDecisionSha256,
    teacherAdmissionFinalizationSha256:teacherAdmissionFinalizationSha256 as string,
    teacherDecisionSha256:teacherDecisionSha256 as string,
    teacherAdmissionGateEvidenceSha256:teacherAdmissionGateEvidenceSha256 as string,
    selectedTeacherIds:Object.freeze([...teacherFinalization.selectedTeacherIds]),
    reproductionEvidenceSha256,
    corpusShardDigests:Object.freeze([...reproduction.corpusShardDigests]),
    corpusRootDigest:reproduction.corpusRootDigest,
    recipeDigest:reproduction.recipeDigest,
    checkpointSha256:reproduction.checkpointSha256,
    resumeCheckpointSha256:reproduction.resumeCheckpointSha256??'UNKNOWN',
    deterministicTargetCount:reproduction.deterministicTargetCount,
    ...authorityBoundary(),
  };

  let planEvidenceSha256:string;
  try{
    planEvidenceSha256=await digest(
      HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
      readyPayload,
      hash,
    );
  }catch{
    return invalid(['TRAINING_PLAN_OUTPUT_HASH_INVALID']);
  }

  return Object.freeze({
    ...readyPayload,
    blockers:Object.freeze([]),
    planEvidenceSha256,
  });
}

function handoffPayload(value:HsmeReuseOutcomeHandoffV1){
  return {
    schemaVersion:HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
    state:'FULL_STUDENT_DISTILLATION_HANDOFF_READY' as const,
    sourceDecisionSha256:value.sourceDecisionSha256,
    finalDecisionSha256:value.finalDecisionSha256,
    finalizationEvidenceSha256:value.finalizationEvidenceSha256,
    candidateAssemblyRefsSha256:value.candidateAssemblyRefsSha256,
    selectedCandidateEvidenceSha256:'UNKNOWN' as const,
    reusePhasePermitted:false,
    fullStudentDistillationPhasePermitted:true,
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
  };
}

function teacherFinalizationPayload(
  value:HsmeTeacherAdmissionFinalizationV1,
  teacherDecisionSha256:string,
  teacherAdmissionGateEvidenceSha256:string,
){
  return {
    schemaVersion:HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA,
    eligibilityEvidenceSha256:value.eligibilityEvidenceSha256,
    rosterRefreshSha256:value.rosterRefreshSha256,
    qualityBakeoffAssemblySha256:value.qualityBakeoffAssemblySha256,
    selectionRationaleSha256:value.selectionRationaleSha256,
    selectedTeacherIds:value.selectedTeacherIds,
    finalDecisionSha256:teacherDecisionSha256,
    admissionGateEvidenceSha256:teacherAdmissionGateEvidenceSha256,
    trainingStartAllowed:false as const,
    productionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  };
}

function authorityBoundary(){
  return Object.freeze({
    trainingRunStartAllowed:false as const,
    trainingOrDistillationExecutionAllowed:false as const,
    checkpointPromotionAllowed:false as const,
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
    HsmeFullStudentTrainingPlanAdmissionV1,
    'reuseHandoffEvidenceSha256'|'reuseSourceDecisionSha256'|
    'reuseFinalDecisionSha256'|'teacherAdmissionFinalizationSha256'|
    'teacherDecisionSha256'|'teacherAdmissionGateEvidenceSha256'|
    'selectedTeacherIds'
  >>={},
):HsmeFullStudentTrainingPlanAdmissionV1{
  return Object.freeze({
    schemaVersion:HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
    state:'TRAINING_PLAN_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    reuseHandoffEvidenceSha256:values.reuseHandoffEvidenceSha256??'UNKNOWN',
    reuseSourceDecisionSha256:values.reuseSourceDecisionSha256??'UNKNOWN',
    reuseFinalDecisionSha256:values.reuseFinalDecisionSha256??'UNKNOWN',
    teacherAdmissionFinalizationSha256:
      values.teacherAdmissionFinalizationSha256??'UNKNOWN',
    teacherDecisionSha256:values.teacherDecisionSha256??'UNKNOWN',
    teacherAdmissionGateEvidenceSha256:
      values.teacherAdmissionGateEvidenceSha256??'UNKNOWN',
    selectedTeacherIds:Object.freeze([...(values.selectedTeacherIds??[])]),
    reproductionEvidenceSha256:'UNKNOWN',
    corpusShardDigests:Object.freeze([]),
    corpusRootDigest:'UNKNOWN',
    recipeDigest:'UNKNOWN',
    checkpointSha256:'UNKNOWN',
    resumeCheckpointSha256:'UNKNOWN',
    deterministicTargetCount:0,
    planEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function blocked(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFullStudentTrainingPlanAdmissionV1,
    'reuseHandoffEvidenceSha256'|'reuseSourceDecisionSha256'|
    'reuseFinalDecisionSha256'|'selectedTeacherIds'
  >>={},
):HsmeFullStudentTrainingPlanAdmissionV1{
  return Object.freeze({
    schemaVersion:HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
    state:'TRAINING_PLAN_BLOCKED',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    reuseHandoffEvidenceSha256:values.reuseHandoffEvidenceSha256??'UNKNOWN',
    reuseSourceDecisionSha256:values.reuseSourceDecisionSha256??'UNKNOWN',
    reuseFinalDecisionSha256:values.reuseFinalDecisionSha256??'UNKNOWN',
    teacherAdmissionFinalizationSha256:'UNKNOWN',
    teacherDecisionSha256:'UNKNOWN',
    teacherAdmissionGateEvidenceSha256:'UNKNOWN',
    selectedTeacherIds:Object.freeze([...(values.selectedTeacherIds??[])]),
    reproductionEvidenceSha256:'UNKNOWN',
    corpusShardDigests:Object.freeze([]),
    corpusRootDigest:'UNKNOWN',
    recipeDigest:'UNKNOWN',
    checkpointSha256:'UNKNOWN',
    resumeCheckpointSha256:'UNKNOWN',
    deterministicTargetCount:0,
    planEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    throw new HsmeFullStudentTrainingPlanAdmissionV1Error(
      'hsme_full_student_training_plan_hash_invalid',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verifyOrigin(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function digestKnown(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return digestKnown(value)?value:'UNKNOWN';
}

function sameStrings(a:readonly string[],b:readonly string[]):boolean{
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

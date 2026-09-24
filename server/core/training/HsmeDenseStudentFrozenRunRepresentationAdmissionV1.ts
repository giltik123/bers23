import {
  HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentFrozenWorkspaceRunEvidenceV1Digest,
  type HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
} from './HsmeDenseStudentFrozenWorkspaceRunEvidenceV1.ts';
import {
  HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
  hsmeDenseStudentTrainingRunReceiptV1Digest,
  type HsmeDenseStudentTrainingRunReceiptV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
  type HsmeDenseStudentTrainingHashPortV1,
  type HsmeDenseStudentTrainingPreflightV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  representHsmeDenseStudentCheckpointV1,
  type CoreHsmeDenseStudentRepresentationPortV1,
  type CoreHsmeDenseStudentRepresentationResultOriginVerifierV1,
} from './HsmeDenseStudentRepresentationV1.ts';

export const HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1' as const;
export const HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_DIGEST_DOMAIN =
  'bers:hsme:dense-student-frozen-run-representation-admission:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeDenseStudentFrozenRunRepresentationAdmissionStateV1=
  | 'FROZEN_RUN_REPRESENTATION_ADMISSION_INVALID'
  | 'FROZEN_RUN_REPRESENTATION_ADMISSION_BLOCKED'
  | 'FROZEN_RUN_REPRESENTATION_READY_NOT_ADMITTED';

export interface HsmeDenseStudentFrozenRunEvidenceOriginVerifierV1{
  verifyFrozenRunEvidence(
    evidence:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
    expectedEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentFrozenRunRepresentationAdmissionV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA;
  state:HsmeDenseStudentFrozenRunRepresentationAdmissionStateV1;
  blockers:readonly string[];
  frozenRunEvidenceSha256:string|'UNKNOWN';
  trainingRunReceiptSha256:string|'UNKNOWN';
  preflightEvidenceSha256:string|'UNKNOWN';
  launchSpecSha256:string|'UNKNOWN';
  representationEvidenceSha256:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  targetStepCount:number|'UNKNOWN';
  stagedCheckpointSha256:string|'UNKNOWN';
  stagedCheckpointBytes:number|'UNKNOWN';
  representationArtifactSha256:string|'UNKNOWN';
  representationBytes:number|'UNKNOWN';
  representationMetadataSha256:string|'UNKNOWN';
  exportToolchainSha256:string|'UNKNOWN';
  packDescriptorSha256:string|'UNKNOWN';
  admissionEvidenceSha256:string|'UNKNOWN';
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeDenseStudentFrozenRunRepresentationAdmissionV1Error
  extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentFrozenRunRepresentationAdmissionV1Error';
    this.code=code;
  }
}

export async function admitHsmeDenseStudentFrozenRunRepresentationV1(
  frozenRun:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
  expectedFrozenRunEvidenceSha256:string,
  frozenRunOrigin:HsmeDenseStudentFrozenRunEvidenceOriginVerifierV1,
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  expectedTrainingRunReceiptSha256:string,
  preflight:HsmeDenseStudentTrainingPreflightV1,
  exporter:CoreHsmeDenseStudentRepresentationPortV1,
  representationResultOrigin:
    CoreHsmeDenseStudentRepresentationResultOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentFrozenRunRepresentationAdmissionV1>{
  const blockers:string[]=[];

  let frozenRunEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  if(
    !frozenRun
    ||frozenRun.schemaVersion!==
      HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_RUN_SCHEMA_INVALID');
  }else if(
    frozenRun.state!=='FROZEN_WORKSPACE_RUN_EVIDENCE_READY'
    ||frozenRun.blockers.length!==0
    ||frozenRun.realProtectedExecution!==true
  ){
    return blocked(
      ['FROZEN_RUN_REPRESENTATION_REAL_READY_RUN_REQUIRED'],
      valuesFromFrozenRun(frozenRun),
    );
  }else if(frozenRunAuthorityWidened(frozenRun)){
    blockers.push('FROZEN_RUN_REPRESENTATION_RUN_AUTHORITY_WIDENING');
  }

  if(!HEX64.test(expectedFrozenRunEvidenceSha256)){
    blockers.push('FROZEN_RUN_REPRESENTATION_EXPECTED_RUN_DIGEST_INVALID');
  }

  if(blockers.length===0){
    try{
      frozenRunEvidenceSha256=
        await hsmeDenseStudentFrozenWorkspaceRunEvidenceV1Digest(
          frozenRun,
          hash,
        );
      if(
        frozenRunEvidenceSha256!==frozenRun.evidenceSha256
        ||frozenRunEvidenceSha256!==expectedFrozenRunEvidenceSha256
      ){
        blockers.push('FROZEN_RUN_REPRESENTATION_RUN_REHASH_MISMATCH');
      }else if(!await verify(
        ()=>frozenRunOrigin.verifyFrozenRunEvidence(
          frozenRun,
          frozenRunEvidenceSha256 as string,
        ),
      )){
        blockers.push('FROZEN_RUN_REPRESENTATION_RUN_ORIGIN_UNVERIFIED');
      }
    }catch{
      blockers.push('FROZEN_RUN_REPRESENTATION_RUN_REHASH_INVALID');
    }
  }

  let trainingRunReceiptSha256:string|'UNKNOWN'='UNKNOWN';
  if(
    !receipt
    ||receipt.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA
    ||receipt.state!=='TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED'
    ||receipt.blockers.length!==0
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_COMPLETED_RECEIPT_REQUIRED');
  }else if(receiptAuthorityWidened(receipt)){
    blockers.push('FROZEN_RUN_REPRESENTATION_RECEIPT_AUTHORITY_WIDENING');
  }
  if(!HEX64.test(expectedTrainingRunReceiptSha256)){
    blockers.push('FROZEN_RUN_REPRESENTATION_EXPECTED_RECEIPT_DIGEST_INVALID');
  }

  if(
    receipt
    &&receipt.schemaVersion===HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA
    &&receipt.state==='TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED'
    &&receipt.blockers.length===0
  ){
    try{
      trainingRunReceiptSha256=
        await hsmeDenseStudentTrainingRunReceiptV1Digest(receipt,hash);
      if(
        trainingRunReceiptSha256!==receipt.receiptEvidenceSha256
        ||trainingRunReceiptSha256!==expectedTrainingRunReceiptSha256
        ||trainingRunReceiptSha256!==frozenRun.trainingRunReceiptSha256
      ){
        blockers.push('FROZEN_RUN_REPRESENTATION_RECEIPT_REHASH_MISMATCH');
      }
    }catch{
      blockers.push('FROZEN_RUN_REPRESENTATION_RECEIPT_REHASH_INVALID');
    }
  }

  let preflightEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let launchSpecSha256:string|'UNKNOWN'='UNKNOWN';
  if(
    !preflight
    ||preflight.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA
    ||preflight.state!=='TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    ||preflight.launchSpec===null
    ||preflight.blockers.length!==0
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_READY_PREFLIGHT_REQUIRED');
  }else{
    try{
      preflightEvidenceSha256=
        await hsmeDenseStudentTrainingPreflightV1Digest(preflight,hash);
      if(
        preflightEvidenceSha256!==preflight.preflightEvidenceSha256
        ||preflightEvidenceSha256!==frozenRun.preflightEvidenceSha256
      ){
        blockers.push('FROZEN_RUN_REPRESENTATION_PREFLIGHT_REHASH_MISMATCH');
      }
    }catch{
      blockers.push('FROZEN_RUN_REPRESENTATION_PREFLIGHT_REHASH_INVALID');
    }
    try{
      launchSpecSha256=
        await hsmeDenseStudentLaunchSpecV1Digest(preflight.launchSpec,hash);
      if(
        launchSpecSha256!==preflight.launchSpecSha256
        ||launchSpecSha256!==preflight.launchSpec.launchSpecSha256
        ||launchSpecSha256!==frozenRun.launchSpecSha256
      ){
        blockers.push('FROZEN_RUN_REPRESENTATION_LAUNCH_REHASH_MISMATCH');
      }
    }catch{
      blockers.push('FROZEN_RUN_REPRESENTATION_LAUNCH_REHASH_INVALID');
    }
  }

  if(
    preflight?.launchSpec!==null
    &&preflight?.launchSpec!==undefined
    &&receipt
    &&frozenRun
  ){
    validateFrozenRunReceiptPreflightBinding(
      frozenRun,
      receipt,
      preflight,
      blockers,
    );
  }

  const common=values({
    ...valuesFromFrozenRun(frozenRun),
    frozenRunEvidenceSha256,
    trainingRunReceiptSha256,
    preflightEvidenceSha256,
    launchSpecSha256,
  });

  if(blockers.length>0){
    return invalid(blockers,common);
  }

  const representation=await representHsmeDenseStudentCheckpointV1(
    receipt,
    preflight,
    exporter,
    representationResultOrigin,
    hash,
  );

  if(representation.state==='REPRESENTATION_INVALID'){
    return invalid(
      representation.blockers.map(
        value=>'REPRESENTATION:'+value,
      ),
      {
        ...common,
        ...valuesFromRepresentation(representation),
      },
    );
  }
  if(representation.state!=='REPRESENTATION_READY_NOT_ADMITTED'){
    return blocked(
      representation.blockers.length>0
        ?representation.blockers.map(value=>'REPRESENTATION:'+value)
        :['FROZEN_RUN_REPRESENTATION_READY_EVIDENCE_REQUIRED'],
      {
        ...common,
        ...valuesFromRepresentation(representation),
      },
    );
  }
  if(
    representation.schemaVersion!==
      HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA
    ||representation.blockers.length!==0
    ||representation.evidenceSha256==='UNKNOWN'
  ){
    return invalid(
      ['FROZEN_RUN_REPRESENTATION_EVIDENCE_SHAPE_INVALID'],
      {
        ...common,
        ...valuesFromRepresentation(representation),
      },
    );
  }

  let representationEvidenceSha256:string;
  try{
    representationEvidenceSha256=
      await hsmeDenseStudentRepresentationEvidenceV1Digest(
        representation,
        hash,
      );
  }catch{
    return invalid(
      ['FROZEN_RUN_REPRESENTATION_EVIDENCE_REHASH_INVALID'],
      {
        ...common,
        ...valuesFromRepresentation(representation),
      },
    );
  }
  if(representationEvidenceSha256!==representation.evidenceSha256){
    return invalid(
      ['FROZEN_RUN_REPRESENTATION_EVIDENCE_REHASH_MISMATCH'],
      {
        ...common,
        ...valuesFromRepresentation(representation),
        representationEvidenceSha256,
      },
    );
  }

  const representationBlockers:string[]=[];
  validateRepresentationBinding(
    frozenRun,
    receipt,
    representation,
    representationBlockers,
  );
  if(representationBlockers.length>0){
    return invalid(
      representationBlockers,
      {
        ...common,
        ...valuesFromRepresentation(representation),
        representationEvidenceSha256,
      },
    );
  }

  if(representationAuthorityWidened(representation)){
    return invalid(
      ['FROZEN_RUN_REPRESENTATION_OUTPUT_AUTHORITY_WIDENING'],
      {
        ...common,
        ...valuesFromRepresentation(representation),
        representationEvidenceSha256,
      },
    );
  }

  const readyPayload={
    schemaVersion:
      HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA,
    state:'FROZEN_RUN_REPRESENTATION_READY_NOT_ADMITTED' as const,
    blockers:Object.freeze([]) as readonly string[],
    ...values({
      ...common,
      ...valuesFromRepresentation(representation),
      representationEvidenceSha256,
    }),
    ...authorityBoundary(),
  };
  const admissionEvidenceSha256=await digest(readyPayload,hash);
  return deepFreeze({
    ...readyPayload,
    admissionEvidenceSha256,
  });
}

export async function
hsmeDenseStudentFrozenRunRepresentationAdmissionV1Digest(
  value:HsmeDenseStudentFrozenRunRepresentationAdmissionV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    value.schemaVersion!==
      HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA
    ||value.state!=='FROZEN_RUN_REPRESENTATION_READY_NOT_ADMITTED'
    ||value.blockers.length!==0
    ||value.admissionEvidenceSha256==='UNKNOWN'
  ){
    throw new HsmeDenseStudentFrozenRunRepresentationAdmissionV1Error(
      'hsme_frozen_run_representation_admission_digest_state',
      'only READY_NOT_ADMITTED admission evidence is digestible',
    );
  }
  const {admissionEvidenceSha256:_ignored,...payload}=value;
  return digest(payload,hash);
}

function validateFrozenRunReceiptPreflightBinding(
  frozenRun:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  preflight:HsmeDenseStudentTrainingPreflightV1,
  blockers:string[],
):void{
  const launch=preflight.launchSpec;
  if(launch===null){
    blockers.push('FROZEN_RUN_REPRESENTATION_LAUNCH_MISSING');
    return;
  }

  if(
    frozenRun.candidateId!==launch.candidateId
    ||frozenRun.targetStepCount!==launch.targetStepCount
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_TARGET_BINDING_MISMATCH');
  }
  if(
    receipt.preflightEvidenceSha256!==frozenRun.preflightEvidenceSha256
    ||receipt.launchSpecSha256!==frozenRun.launchSpecSha256
    ||receipt.preflightEvidenceSha256!==preflight.preflightEvidenceSha256
    ||receipt.launchSpecSha256!==preflight.launchSpecSha256
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_PREFLIGHT_BINDING_MISMATCH');
  }
  if(
    receipt.executionAttemptId!==frozenRun.executionAttemptId
    ||receipt.backend===null
    ||frozenRun.backend===null
    ||!sameBackend(receipt.backend,frozenRun.backend)
    ||!sameBackend(receipt.backend,launch.backend)
    ||receipt.startedAtMs!==frozenRun.startedAtMs
    ||receipt.finishedAtMs!==frozenRun.finishedAtMs
    ||receipt.consumedTrainingExamples!==frozenRun.consumedTrainingExamples
    ||receipt.consumedGpuSeconds!==frozenRun.consumedGpuSeconds
    ||receipt.consumedTrainingCostMicrousd!==
      frozenRun.consumedTrainingCostMicrousd
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_EXECUTION_BINDING_MISMATCH');
  }
  if(
    receipt.stagedCheckpointSha256!==frozenRun.stagedCheckpointSha256
    ||receipt.stagedCheckpointBytes!==frozenRun.stagedCheckpointBytes
    ||receipt.checkpointMetadataSha256!==frozenRun.checkpointMetadataSha256
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_CHECKPOINT_BINDING_MISMATCH');
  }
  if(
    receipt.teacherDecisionSha256!==frozenRun.teacherDecisionSha256
    ||receipt.reproductionEvidenceSha256!==frozenRun.reproductionEvidenceSha256
    ||receipt.corpusRootDigest!==frozenRun.corpusRootDigest
    ||receipt.recipeDigest!==frozenRun.recipeDigest
    ||receipt.inputCheckpointSha256!==frozenRun.inputCheckpointSha256
    ||receipt.resumeCheckpointSha256!==frozenRun.resumeCheckpointSha256
    ||receipt.teacherDecisionSha256!==launch.teacherDecisionSha256
    ||receipt.reproductionEvidenceSha256!==launch.reproductionEvidenceSha256
    ||receipt.corpusRootDigest!==launch.corpusRootDigest
    ||receipt.recipeDigest!==launch.recipeDigest
    ||receipt.inputCheckpointSha256!==launch.checkpointSha256
    ||receipt.resumeCheckpointSha256!==launch.resumeCheckpointSha256
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_LINEAGE_MISMATCH');
  }
}

function validateRepresentationBinding(
  frozenRun:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  representation:Awaited<
    ReturnType<typeof representHsmeDenseStudentCheckpointV1>
  >,
  blockers:string[],
):void{
  if(
    representation.receiptEvidenceSha256!==frozenRun.trainingRunReceiptSha256
    ||representation.preflightEvidenceSha256!==frozenRun.preflightEvidenceSha256
    ||representation.launchSpecSha256!==frozenRun.launchSpecSha256
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_SOURCE_DIGEST_BINDING_MISMATCH');
  }
  if(
    representation.candidateId!==frozenRun.candidateId
    ||representation.targetStepCount!==frozenRun.targetStepCount
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_TARGET_OUTPUT_MISMATCH');
  }
  if(
    representation.stagedCheckpointSha256!==frozenRun.stagedCheckpointSha256
    ||representation.stagedCheckpointBytes!==frozenRun.stagedCheckpointBytes
    ||representation.checkpointMetadataSha256!==frozenRun.checkpointMetadataSha256
    ||representation.stagedCheckpointSha256!==receipt.stagedCheckpointSha256
    ||representation.stagedCheckpointBytes!==receipt.stagedCheckpointBytes
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_CHECKPOINT_OUTPUT_MISMATCH');
  }
  if(
    representation.teacherDecisionSha256!==frozenRun.teacherDecisionSha256
    ||representation.reproductionEvidenceSha256!==
      frozenRun.reproductionEvidenceSha256
    ||representation.corpusRootDigest!==frozenRun.corpusRootDigest
    ||representation.recipeDigest!==frozenRun.recipeDigest
    ||representation.inputCheckpointSha256!==frozenRun.inputCheckpointSha256
    ||representation.resumeCheckpointSha256!==frozenRun.resumeCheckpointSha256
  ){
    blockers.push('FROZEN_RUN_REPRESENTATION_LINEAGE_OUTPUT_MISMATCH');
  }
}

type OutputValues=Partial<Pick<
  HsmeDenseStudentFrozenRunRepresentationAdmissionV1,
  'frozenRunEvidenceSha256'|'trainingRunReceiptSha256'|
  'preflightEvidenceSha256'|'launchSpecSha256'|
  'representationEvidenceSha256'|'candidateId'|'targetStepCount'|
  'stagedCheckpointSha256'|'stagedCheckpointBytes'|
  'representationArtifactSha256'|'representationBytes'|
  'representationMetadataSha256'|'exportToolchainSha256'|
  'packDescriptorSha256'
>>;

function values(input:OutputValues={}):Required<OutputValues>{
  return {
    frozenRunEvidenceSha256:input.frozenRunEvidenceSha256??'UNKNOWN',
    trainingRunReceiptSha256:input.trainingRunReceiptSha256??'UNKNOWN',
    preflightEvidenceSha256:input.preflightEvidenceSha256??'UNKNOWN',
    launchSpecSha256:input.launchSpecSha256??'UNKNOWN',
    representationEvidenceSha256:
      input.representationEvidenceSha256??'UNKNOWN',
    candidateId:input.candidateId??'UNKNOWN',
    targetStepCount:input.targetStepCount??'UNKNOWN',
    stagedCheckpointSha256:input.stagedCheckpointSha256??'UNKNOWN',
    stagedCheckpointBytes:input.stagedCheckpointBytes??'UNKNOWN',
    representationArtifactSha256:
      input.representationArtifactSha256??'UNKNOWN',
    representationBytes:input.representationBytes??'UNKNOWN',
    representationMetadataSha256:
      input.representationMetadataSha256??'UNKNOWN',
    exportToolchainSha256:input.exportToolchainSha256??'UNKNOWN',
    packDescriptorSha256:input.packDescriptorSha256??'UNKNOWN',
  };
}

function valuesFromFrozenRun(
  value:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
):OutputValues{
  return {
    frozenRunEvidenceSha256:
      HEX64.test(value?.evidenceSha256??'')?value.evidenceSha256:'UNKNOWN',
    trainingRunReceiptSha256:value?.trainingRunReceiptSha256??'UNKNOWN',
    preflightEvidenceSha256:value?.preflightEvidenceSha256??'UNKNOWN',
    launchSpecSha256:value?.launchSpecSha256??'UNKNOWN',
    candidateId:value?.candidateId??'UNKNOWN',
    targetStepCount:value?.targetStepCount??'UNKNOWN',
    stagedCheckpointSha256:value?.stagedCheckpointSha256??'UNKNOWN',
    stagedCheckpointBytes:value?.stagedCheckpointBytes??'UNKNOWN',
  };
}

function valuesFromRepresentation(
  value:Awaited<ReturnType<typeof representHsmeDenseStudentCheckpointV1>>,
):OutputValues{
  return {
    representationEvidenceSha256:value.evidenceSha256,
    candidateId:value.candidateId,
    targetStepCount:value.targetStepCount,
    stagedCheckpointSha256:value.stagedCheckpointSha256,
    stagedCheckpointBytes:value.stagedCheckpointBytes,
    representationArtifactSha256:value.representationArtifactSha256,
    representationBytes:value.representationBytes,
    representationMetadataSha256:value.representationMetadataSha256,
    exportToolchainSha256:value.exportToolchainSha256,
    packDescriptorSha256:value.packDescriptorSha256,
  };
}

function invalid(
  blockers:readonly string[],
  input:OutputValues={},
):HsmeDenseStudentFrozenRunRepresentationAdmissionV1{
  return deepFreeze({
    schemaVersion:
      HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA,
    state:'FROZEN_RUN_REPRESENTATION_ADMISSION_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    ...values(input),
    admissionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function blocked(
  blockers:readonly string[],
  input:OutputValues={},
):HsmeDenseStudentFrozenRunRepresentationAdmissionV1{
  return deepFreeze({
    schemaVersion:
      HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA,
    state:'FROZEN_RUN_REPRESENTATION_ADMISSION_BLOCKED',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    ...values(input),
    admissionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function frozenRunAuthorityWidened(
  value:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
):boolean{
  return value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function receiptAuthorityWidened(
  value:HsmeDenseStudentTrainingRunReceiptV1,
):boolean{
  return value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function representationAuthorityWidened(
  value:Awaited<ReturnType<typeof representHsmeDenseStudentCheckpointV1>>,
):boolean{
  return value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function authorityBoundary(){
  return Object.freeze({
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

async function digest(
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(new TextEncoder().encode(
    HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_DIGEST_DOMAIN
    +JSON.stringify(value),
  ));
  if(!HEX64.test(result)){
    throw new HsmeDenseStudentFrozenRunRepresentationAdmissionV1Error(
      'hsme_frozen_run_representation_admission_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

function sameBackend(
  left:Readonly<{
    backendClass:'CUDA_GPU';
    providerId:string;
    accountId:string;
    executionEnvironmentId:string;
  }>,
  right:Readonly<{
    backendClass:'CUDA_GPU';
    providerId:string;
    accountId:string;
    executionEnvironmentId:string;
  }>,
):boolean{
  return left.backendClass===right.backendClass
    &&left.providerId===right.providerId
    &&left.accountId===right.accountId
    &&left.executionEnvironmentId===right.executionEnvironmentId;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function lexical(left:string,right:string):number{
  return left<right?-1:left>right?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

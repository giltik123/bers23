import {
  HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA,
  hsmeDenseStudentQualityFirstDispositionV1Digest,
  type HsmeDenseStudentQualityFirstDispositionV1,
} from './HsmeDenseStudentQualityFirstDispositionV1.ts';
import {
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
  type HsmeDenseStudentStepMatrixEvidenceV1,
} from './HsmeDenseStudentStepMatrixV1.ts';
import {
  HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
  hsmeDenseStudentDualBudgetProjectionV1Digest,
  projectHsmeDenseStudentDualBudgetV1,
  type HsmeDenseStudentDualBudgetProjectionV1,
  type HsmeDenseStudentDualBudgetTemplateOriginVerifierV1,
} from './HsmeDenseStudentDualBudgetProjectionV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1' as const;
export const HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_DIGEST_DOMAIN =
  'bers:hsme:dense-student-selected-dual-budget-projection:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

type StepCount=2|4|6|8;

export interface HsmeDenseStudentSelectedDispositionOriginVerifierV1{
  verifyQualityFirstDisposition(
    disposition:HsmeDenseStudentQualityFirstDispositionV1,
    expectedDispositionSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentSelectedRepresentationOriginVerifierV1{
  verifyRepresentationEvidence(
    representation:HsmeDenseStudentRepresentationEvidenceV1,
    expectedRepresentationEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentSelectedStepMatrixOriginVerifierV1{
  verifyStepMatrixEvidence(
    matrix:HsmeDenseStudentStepMatrixEvidenceV1,
    expectedStepMatrixEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentSelectedDualBudgetProjectionV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1_SCHEMA;
  state:
    |'SELECTED_DUAL_BUDGET_PROJECTION_INVALID'
    |'SELECTED_DUAL_BUDGET_PROJECTION_BLOCKED'
    |'SELECTED_DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN';
  blockers:readonly string[];
  qualityFirstDispositionSha256:string|'UNKNOWN';
  selectedTrainingTargetStepCount:StepCount|'UNKNOWN';
  representationEvidenceSha256:string|'UNKNOWN';
  representationArtifactSha256:string|'UNKNOWN';
  stepMatrixEvidenceSha256:string|'UNKNOWN';
  dualBudgetProjectionSha256:string|'UNKNOWN';
  projectedDualBudgetEvidenceSha256:string|'UNKNOWN';
  projection:HsmeDenseStudentDualBudgetProjectionV1|null;
  evidenceSha256:string|'UNKNOWN';
  scheduleSelectionAllowed:false;
  trainingExecutionAllowed:false;
  candidateSelectionAllowed:false;
  baselineSelectionAllowed:false;
  canonicalDecisionPersistAllowed:false;
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

export class HsmeDenseStudentSelectedDualBudgetProjectionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentSelectedDualBudgetProjectionV1Error';
    this.code=code;
  }
}

export async function proveHsmeDenseStudentSelectedDualBudgetProjectionV1(
  disposition:HsmeDenseStudentQualityFirstDispositionV1,
  expectedDispositionSha256:string,
  dispositionOrigin:HsmeDenseStudentSelectedDispositionOriginVerifierV1,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  expectedRepresentationEvidenceSha256:string,
  representationOrigin:HsmeDenseStudentSelectedRepresentationOriginVerifierV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  expectedStepMatrixEvidenceSha256:string,
  matrixOrigin:HsmeDenseStudentSelectedStepMatrixOriginVerifierV1,
  rawTemplate:unknown,
  expectedTemplateSha256:string,
  templateOrigin:HsmeDenseStudentDualBudgetTemplateOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentSelectedDualBudgetProjectionV1>{
  if(
    !disposition
    ||disposition.schemaVersion!==
      HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA
  ){
    return invalid(['SELECTED_PROJECTION_DISPOSITION_SCHEMA_INVALID']);
  }
  if(
    disposition.state!=='REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED'
    ||disposition.blockers.length!==0
  ){
    return blocked(['SELECTED_PROJECTION_SELECTED_DISPOSITION_REQUIRED']);
  }
  if(dispositionAuthorityWidened(disposition)){
    return invalid(['SELECTED_PROJECTION_DISPOSITION_AUTHORITY_WIDENING']);
  }

  let qualityFirstDispositionSha256:string;
  try{
    qualityFirstDispositionSha256=
      await hsmeDenseStudentQualityFirstDispositionV1Digest(
        disposition,
        hash,
      );
  }catch{
    return invalid(['SELECTED_PROJECTION_DISPOSITION_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedDispositionSha256)
    ||qualityFirstDispositionSha256!==expectedDispositionSha256
    ||qualityFirstDispositionSha256!==disposition.evidenceSha256
  ){
    return invalid(
      ['SELECTED_PROJECTION_DISPOSITION_REHASH_MISMATCH'],
      {qualityFirstDispositionSha256},
    );
  }
  if(!await verify(
    ()=>dispositionOrigin.verifyQualityFirstDisposition(
      disposition,
      qualityFirstDispositionSha256,
    ),
  )){
    return invalid(
      ['SELECTED_PROJECTION_DISPOSITION_ORIGIN_UNVERIFIED'],
      {qualityFirstDispositionSha256},
    );
  }

  const selectedStep=disposition.selectedTrainingTargetStepCount;
  if(!isStepCount(selectedStep)){
    return invalid(
      ['SELECTED_PROJECTION_TRAINING_STEP_INVALID'],
      {qualityFirstDispositionSha256},
    );
  }
  const selectedRepresentationSha=
    disposition.selectedRepresentationEvidenceSha256;
  const selectedArtifactSha=
    disposition.selectedRepresentationArtifactSha256;
  const selectedRepresentationBytes=disposition.selectedRepresentationBytes;
  const selectedMatrixSha=disposition.selectedStepMatrixEvidenceSha256;
  if(
    typeof selectedRepresentationSha!=='string'
    ||!HEX64.test(selectedRepresentationSha)
    ||typeof selectedArtifactSha!=='string'
    ||!HEX64.test(selectedArtifactSha)
    ||typeof selectedRepresentationBytes!=='number'
    ||!Number.isSafeInteger(selectedRepresentationBytes)
    ||selectedRepresentationBytes<1
    ||typeof selectedMatrixSha!=='string'
    ||!HEX64.test(selectedMatrixSha)
    ||disposition.benchmarkBindingSha256==='UNKNOWN'
  ){
    return invalid(
      ['SELECTED_PROJECTION_SELECTION_BINDING_UNRESOLVED'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
      },
    );
  }

  if(representationAuthorityWidened(representation)){
    return invalid(
      ['SELECTED_PROJECTION_REPRESENTATION_AUTHORITY_WIDENING'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
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
      ['SELECTED_PROJECTION_REPRESENTATION_REHASH_INVALID'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
      },
    );
  }
  if(
    !HEX64.test(expectedRepresentationEvidenceSha256)
    ||representationEvidenceSha256!==expectedRepresentationEvidenceSha256
    ||representationEvidenceSha256!==representation.evidenceSha256
    ||representationEvidenceSha256!==selectedRepresentationSha
  ){
    return invalid(
      ['SELECTED_PROJECTION_REPRESENTATION_REHASH_MISMATCH'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }
  if(!await verify(
    ()=>representationOrigin.verifyRepresentationEvidence(
      representation,
      representationEvidenceSha256,
    ),
  )){
    return invalid(
      ['SELECTED_PROJECTION_REPRESENTATION_ORIGIN_UNVERIFIED'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }
  if(
    representation.targetStepCount!==selectedStep
    ||representation.representationArtifactSha256!==selectedArtifactSha
    ||representation.representationBytes!==selectedRepresentationBytes
  ){
    return invalid(
      ['SELECTED_PROJECTION_REPRESENTATION_SELECTION_BINDING_MISMATCH'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }

  if(matrixAuthorityWidened(stepMatrix)){
    return invalid(
      ['SELECTED_PROJECTION_MATRIX_AUTHORITY_WIDENING'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }
  let stepMatrixEvidenceSha256:string;
  try{
    stepMatrixEvidenceSha256=
      await hsmeDenseStudentStepMatrixEvidenceV1Digest(stepMatrix,hash);
  }catch{
    return invalid(
      ['SELECTED_PROJECTION_MATRIX_REHASH_INVALID'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }
  if(
    !HEX64.test(expectedStepMatrixEvidenceSha256)
    ||stepMatrixEvidenceSha256!==expectedStepMatrixEvidenceSha256
    ||stepMatrixEvidenceSha256!==stepMatrix.evidenceSha256
    ||stepMatrixEvidenceSha256!==selectedMatrixSha
  ){
    return invalid(
      ['SELECTED_PROJECTION_MATRIX_REHASH_MISMATCH'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }
  if(!await verify(
    ()=>matrixOrigin.verifyStepMatrixEvidence(
      stepMatrix,
      stepMatrixEvidenceSha256,
    ),
  )){
    return invalid(
      ['SELECTED_PROJECTION_MATRIX_ORIGIN_UNVERIFIED'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }
  if(
    stepMatrix.representationEvidenceSha256!==representationEvidenceSha256
    ||stepMatrix.representationArtifactSha256!==selectedArtifactSha
    ||stepMatrix.representationBytes!==selectedRepresentationBytes
    ||stepMatrix.benchmarkBindingSha256!==disposition.benchmarkBindingSha256
    ||stepMatrix.candidateId!==representation.candidateId
  ){
    return invalid(
      ['SELECTED_PROJECTION_MATRIX_SELECTION_BINDING_MISMATCH'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }

  let projection:HsmeDenseStudentDualBudgetProjectionV1;
  try{
    projection=await projectHsmeDenseStudentDualBudgetV1(
      representation,
      stepMatrix,
      rawTemplate,
      expectedTemplateSha256,
      templateOrigin,
      hash,
    );
  }catch(error){
    return invalid(
      ['SELECTED_PROJECTION_CANONICAL_PROJECTION_FAILED'+errorCodeSuffix(error)],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }
  if(
    projection.schemaVersion!==HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA
    ||projection.state!=='DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN'
    ||projectionAuthorityWidened(projection)
    ||projection.representationEvidenceSha256!==representationEvidenceSha256
    ||projection.stepMatrixEvidenceSha256!==stepMatrixEvidenceSha256
  ){
    return invalid(
      ['SELECTED_PROJECTION_CANONICAL_PROJECTION_BINDING_INVALID'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }

  let dualBudgetProjectionSha256:string;
  try{
    dualBudgetProjectionSha256=
      await hsmeDenseStudentDualBudgetProjectionV1Digest(projection,hash);
  }catch{
    return invalid(
      ['SELECTED_PROJECTION_CANONICAL_PROJECTION_REHASH_INVALID'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }
  if(dualBudgetProjectionSha256!==projection.projectionEvidenceSha256){
    return invalid(
      ['SELECTED_PROJECTION_CANONICAL_PROJECTION_REHASH_MISMATCH'],
      {
        qualityFirstDispositionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }

  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
    state:'SELECTED_DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN' as const,
    blockers:Object.freeze([]) as readonly string[],
    qualityFirstDispositionSha256,
    selectedTrainingTargetStepCount:selectedStep,
    representationEvidenceSha256,
    representationArtifactSha256:selectedArtifactSha,
    stepMatrixEvidenceSha256,
    dualBudgetProjectionSha256,
    projectedDualBudgetEvidenceSha256:projection.projectedEvidenceSha256,
    projection,
    ...authorityBoundary(),
  };
  const evidenceSha256=await selectedProjectionDigest(readyPayload,hash);
  return deepFreeze({...readyPayload,evidenceSha256});
}

export async function hsmeDenseStudentSelectedDualBudgetProjectionV1Digest(
  value:HsmeDenseStudentSelectedDualBudgetProjectionV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    value.state!=='SELECTED_DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN'
    ||value.blockers.length!==0
    ||value.qualityFirstDispositionSha256==='UNKNOWN'
    ||value.selectedTrainingTargetStepCount==='UNKNOWN'
    ||value.representationEvidenceSha256==='UNKNOWN'
    ||value.representationArtifactSha256==='UNKNOWN'
    ||value.stepMatrixEvidenceSha256==='UNKNOWN'
    ||value.dualBudgetProjectionSha256==='UNKNOWN'
    ||value.projectedDualBudgetEvidenceSha256==='UNKNOWN'
    ||value.projection===null
    ||value.evidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_selected_projection_digest_state',
      'only READY_NOT_FROZEN selected projection is digestible',
    );
  }
  const {evidenceSha256:_ignored,...payload}=value;
  return selectedProjectionDigest(payload,hash);
}

function dispositionAuthorityWidened(
  value:HsmeDenseStudentQualityFirstDispositionV1,
):boolean{
  return value.weightedAggregateScoreAllowed!==false
    ||value.efficiencyMayOverrideQualityFailure!==false
    ||value.scheduleSelectionAllowed!==false
    ||value.trainingExecutionAllowed!==false
    ||value.candidateSelectionAllowed!==false
    ||value.baselineSelectionAllowed!==false
    ||value.canonicalDecisionPersistAllowed!==false
    ||value.checkpointPromotionAllowed!==false
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
  value:HsmeDenseStudentRepresentationEvidenceV1,
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

function matrixAuthorityWidened(
  value:HsmeDenseStudentStepMatrixEvidenceV1,
):boolean{
  return value.weightedAggregateScoreAllowed!==false
    ||value.efficiencyMayOverrideQualityFailure!==false
    ||value.scheduleSelectionAllowed!==false
    ||value.candidateSelectionAllowed!==false
    ||value.checkpointPromotionAllowed!==false
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

function projectionAuthorityWidened(
  value:HsmeDenseStudentDualBudgetProjectionV1,
):boolean{
  return value.baselineSelectionAllowed!==false
    ||value.scheduleSelectionAllowed!==false
    ||value.candidateSelectionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false
    ||value.projectedCandidate.efficiencyDisposition!=='R&D_ONLY';
}

function authorityBoundary(){
  return Object.freeze({
    scheduleSelectionAllowed:false as const,
    trainingExecutionAllowed:false as const,
    candidateSelectionAllowed:false as const,
    baselineSelectionAllowed:false as const,
    canonicalDecisionPersistAllowed:false as const,
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

type PartialOutput=Partial<Pick<
  HsmeDenseStudentSelectedDualBudgetProjectionV1,
  'qualityFirstDispositionSha256'
  |'selectedTrainingTargetStepCount'
  |'representationEvidenceSha256'
  |'stepMatrixEvidenceSha256'
>>;

function invalid(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentSelectedDualBudgetProjectionV1{
  return terminal('SELECTED_DUAL_BUDGET_PROJECTION_INVALID',blockers,input);
}

function blocked(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentSelectedDualBudgetProjectionV1{
  return terminal('SELECTED_DUAL_BUDGET_PROJECTION_BLOCKED',blockers,input);
}

function terminal(
  state:
    |'SELECTED_DUAL_BUDGET_PROJECTION_INVALID'
    |'SELECTED_DUAL_BUDGET_PROJECTION_BLOCKED',
  blockers:readonly string[],
  input:PartialOutput,
):HsmeDenseStudentSelectedDualBudgetProjectionV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    qualityFirstDispositionSha256:input.qualityFirstDispositionSha256??'UNKNOWN',
    selectedTrainingTargetStepCount:
      input.selectedTrainingTargetStepCount??'UNKNOWN',
    representationEvidenceSha256:input.representationEvidenceSha256??'UNKNOWN',
    representationArtifactSha256:'UNKNOWN',
    stepMatrixEvidenceSha256:input.stepMatrixEvidenceSha256??'UNKNOWN',
    dualBudgetProjectionSha256:'UNKNOWN',
    projectedDualBudgetEvidenceSha256:'UNKNOWN',
    projection:null,
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

async function selectedProjectionDigest(
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(
    HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_DIGEST_DOMAIN
    +JSON.stringify(value),
  ));
  if(!HEX64.test(digest)){
    fail(
      'hsme_selected_projection_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return digest;
}

function isStepCount(value:unknown):value is StepCount{
  return value===2||value===4||value===6||value===8;
}

function errorCodeSuffix(error:unknown):string{
  if(
    error
    &&typeof error==='object'
    &&'code' in error
    &&typeof (error as {code?:unknown}).code==='string'
  ){
    return ':'+(error as {code:string}).code;
  }
  return '';
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

function fail(code:string,message:string):never{
  throw new HsmeDenseStudentSelectedDualBudgetProjectionV1Error(code,message);
}

import {
  hsmeDenseStudentSelectedDualBudgetProjectionV1Digest,
  type HsmeDenseStudentSelectedDualBudgetProjectionV1,
} from './HsmeDenseStudentSelectedDualBudgetProjectionV1.ts';
import {
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
  type HsmeDenseStudentStepMatrixEvidenceV1,
} from './HsmeDenseStudentStepMatrixV1.ts';
import {
  hsmeDenseStudentDualBudgetProjectionV1Digest,
} from './HsmeDenseStudentDualBudgetProjectionV1.ts';
import {
  finalizeHsmeDenseBaselineV1,
  hsmeDenseBaselineFinalizationV1Digest,
  type HsmeDenseBaselineFinalizationOriginVerifierV1,
  type HsmeDenseBaselineFinalizationV1,
} from './HsmeDenseBaselineFinalizationV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_V1' as const;
export const HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_DIGEST_DOMAIN =
  'bers:hsme:dense-student-selected-baseline-finalization:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
type StepCount=2|4|6|8;

export interface HsmeDenseStudentSelectedProjectionOriginVerifierV1{
  verifySelectedDualBudgetProjection(
    selectedProjection:HsmeDenseStudentSelectedDualBudgetProjectionV1,
    expectedSelectedProjectionSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentSelectedFinalizationRepresentationOriginVerifierV1{
  verifyRepresentationEvidence(
    representation:HsmeDenseStudentRepresentationEvidenceV1,
    expectedRepresentationEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseStudentSelectedFinalizationMatrixOriginVerifierV1{
  verifyStepMatrixEvidence(
    matrix:HsmeDenseStudentStepMatrixEvidenceV1,
    expectedStepMatrixEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentSelectedBaselineFinalizationV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_V1_SCHEMA;
  state:
    |'SELECTED_BASELINE_FINALIZATION_INVALID'
    |'SELECTED_BASELINE_FINALIZATION_BLOCKED'
    |'SELECTED_BASELINE_REDESIGN_REQUIRED'
    |'SELECTED_BASELINE_REJECTED'
    |'SELECTED_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED';
  blockers:readonly string[];
  selectedDualBudgetProjectionSha256:string|'UNKNOWN';
  selectedTrainingTargetStepCount:StepCount|'UNKNOWN';
  representationEvidenceSha256:string|'UNKNOWN';
  stepMatrixEvidenceSha256:string|'UNKNOWN';
  dualBudgetProjectionSha256:string|'UNKNOWN';
  denseBaselineFinalizationSha256:string|'UNKNOWN';
  finalization:HsmeDenseBaselineFinalizationV1|null;
  evidenceSha256:string|'UNKNOWN';
  trainingExecutionAllowed:false;
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

export class HsmeDenseStudentSelectedBaselineFinalizationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentSelectedBaselineFinalizationV1Error';
    this.code=code;
  }
}

export async function proveHsmeDenseStudentSelectedBaselineFinalizationV1(
  selectedProjection:HsmeDenseStudentSelectedDualBudgetProjectionV1,
  expectedSelectedProjectionSha256:string,
  selectedProjectionOrigin:HsmeDenseStudentSelectedProjectionOriginVerifierV1,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  expectedRepresentationEvidenceSha256:string,
  representationOrigin:
    HsmeDenseStudentSelectedFinalizationRepresentationOriginVerifierV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  expectedStepMatrixEvidenceSha256:string,
  matrixOrigin:HsmeDenseStudentSelectedFinalizationMatrixOriginVerifierV1,
  rawSourceDecision:unknown,
  expectedSourceDecisionSha256:string,
  rawPinAttestation:unknown|null,
  expectedPinAttestationSha256:string|null,
  finalizationOrigin:HsmeDenseBaselineFinalizationOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentSelectedBaselineFinalizationV1>{
  if(
    !selectedProjection
    ||selectedProjection.state!==
      'SELECTED_DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN'
    ||selectedProjection.blockers.length!==0
    ||selectedProjection.projection===null
  ){
    return blocked(['SELECTED_FINALIZATION_READY_PROJECTION_REQUIRED']);
  }
  if(selectedProjectionAuthorityWidened(selectedProjection)){
    return invalid(['SELECTED_FINALIZATION_PROJECTION_WRAPPER_AUTHORITY_WIDENING']);
  }

  let selectedDualBudgetProjectionSha256:string;
  try{
    selectedDualBudgetProjectionSha256=
      await hsmeDenseStudentSelectedDualBudgetProjectionV1Digest(
        selectedProjection,
        hash,
      );
  }catch{
    return invalid(['SELECTED_FINALIZATION_SELECTED_PROJECTION_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedSelectedProjectionSha256)
    ||selectedDualBudgetProjectionSha256!==expectedSelectedProjectionSha256
    ||selectedDualBudgetProjectionSha256!==selectedProjection.evidenceSha256
  ){
    return invalid(
      ['SELECTED_FINALIZATION_SELECTED_PROJECTION_REHASH_MISMATCH'],
      {selectedDualBudgetProjectionSha256},
    );
  }
  if(!await verify(
    ()=>selectedProjectionOrigin.verifySelectedDualBudgetProjection(
      selectedProjection,
      selectedDualBudgetProjectionSha256,
    ),
  )){
    return invalid(
      ['SELECTED_FINALIZATION_SELECTED_PROJECTION_ORIGIN_UNVERIFIED'],
      {selectedDualBudgetProjectionSha256},
    );
  }

  const selectedStep=selectedProjection.selectedTrainingTargetStepCount;
  if(!isStepCount(selectedStep)){
    return invalid(
      ['SELECTED_FINALIZATION_TRAINING_STEP_INVALID'],
      {selectedDualBudgetProjectionSha256},
    );
  }

  if(representationAuthorityWidened(representation)){
    return invalid(
      ['SELECTED_FINALIZATION_REPRESENTATION_AUTHORITY_WIDENING'],
      {selectedDualBudgetProjectionSha256,selectedTrainingTargetStepCount:selectedStep},
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
      ['SELECTED_FINALIZATION_REPRESENTATION_REHASH_INVALID'],
      {selectedDualBudgetProjectionSha256,selectedTrainingTargetStepCount:selectedStep},
    );
  }
  if(
    !HEX64.test(expectedRepresentationEvidenceSha256)
    ||representationEvidenceSha256!==expectedRepresentationEvidenceSha256
    ||representationEvidenceSha256!==representation.evidenceSha256
    ||representationEvidenceSha256!==selectedProjection.representationEvidenceSha256
  ){
    return invalid(
      ['SELECTED_FINALIZATION_REPRESENTATION_REHASH_MISMATCH'],
      {
        selectedDualBudgetProjectionSha256,
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
      ['SELECTED_FINALIZATION_REPRESENTATION_ORIGIN_UNVERIFIED'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }
  if(
    representation.targetStepCount!==selectedStep
    ||representation.representationArtifactSha256!==
      selectedProjection.representationArtifactSha256
  ){
    return invalid(
      ['SELECTED_FINALIZATION_REPRESENTATION_SELECTION_BINDING_MISMATCH'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }

  if(matrixAuthorityWidened(stepMatrix)){
    return invalid(
      ['SELECTED_FINALIZATION_MATRIX_AUTHORITY_WIDENING'],
      {
        selectedDualBudgetProjectionSha256,
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
      ['SELECTED_FINALIZATION_MATRIX_REHASH_INVALID'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
      },
    );
  }
  if(
    !HEX64.test(expectedStepMatrixEvidenceSha256)
    ||stepMatrixEvidenceSha256!==expectedStepMatrixEvidenceSha256
    ||stepMatrixEvidenceSha256!==stepMatrix.evidenceSha256
    ||stepMatrixEvidenceSha256!==selectedProjection.stepMatrixEvidenceSha256
  ){
    return invalid(
      ['SELECTED_FINALIZATION_MATRIX_REHASH_MISMATCH'],
      {
        selectedDualBudgetProjectionSha256,
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
      ['SELECTED_FINALIZATION_MATRIX_ORIGIN_UNVERIFIED'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }
  if(
    stepMatrix.representationEvidenceSha256!==representationEvidenceSha256
    ||stepMatrix.representationArtifactSha256!==
      representation.representationArtifactSha256
    ||stepMatrix.representationBytes!==representation.representationBytes
    ||selectedProjection.projection.representationEvidenceSha256!==
      representationEvidenceSha256
    ||selectedProjection.projection.stepMatrixEvidenceSha256!==
      stepMatrixEvidenceSha256
  ){
    return invalid(
      ['SELECTED_FINALIZATION_SOURCE_BINDING_MISMATCH'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }

  let dualBudgetProjectionSha256:string;
  try{
    dualBudgetProjectionSha256=
      await hsmeDenseStudentDualBudgetProjectionV1Digest(
        selectedProjection.projection,
        hash,
      );
  }catch{
    return invalid(
      ['SELECTED_FINALIZATION_PROJECTION_REHASH_INVALID'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
      },
    );
  }
  if(
    dualBudgetProjectionSha256!==selectedProjection.dualBudgetProjectionSha256
    ||dualBudgetProjectionSha256!==
      selectedProjection.projection.projectionEvidenceSha256
    ||selectedProjection.projectedDualBudgetEvidenceSha256!==
      selectedProjection.projection.projectedEvidenceSha256
    ||projectionAuthorityWidened(selectedProjection.projection)
  ){
    return invalid(
      ['SELECTED_FINALIZATION_PROJECTION_BINDING_MISMATCH'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
      },
    );
  }

  const finalization=await finalizeHsmeDenseBaselineV1(
    rawSourceDecision,
    expectedSourceDecisionSha256,
    representation,
    stepMatrix,
    selectedProjection.projection,
    rawPinAttestation,
    expectedPinAttestationSha256,
    finalizationOrigin,
    hash,
  );

  let denseBaselineFinalizationSha256:string;
  try{
    denseBaselineFinalizationSha256=
      await hsmeDenseBaselineFinalizationV1Digest(finalization,hash);
  }catch{
    return invalid(
      ['SELECTED_FINALIZATION_CANONICAL_FINALIZATION_REHASH_INVALID'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
      },
    );
  }
  if(
    denseBaselineFinalizationSha256!==finalization.finalizationEvidenceSha256
    ||finalization.representationEvidenceSha256!==representationEvidenceSha256
    ||finalization.stepMatrixEvidenceSha256!==stepMatrixEvidenceSha256
    ||finalization.dualBudgetProjectionSha256!==dualBudgetProjectionSha256
    ||finalization.projectedDualBudgetEvidenceSha256!==
      selectedProjection.projectedDualBudgetEvidenceSha256
    ||finalizationAuthorityWidened(finalization)
  ){
    return invalid(
      ['SELECTED_FINALIZATION_CANONICAL_FINALIZATION_BINDING_INVALID'],
      {
        selectedDualBudgetProjectionSha256,
        selectedTrainingTargetStepCount:selectedStep,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
      },
    );
  }

  const state=mapFinalizationState(finalization.state);
  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_V1_SCHEMA,
    state,
    blockers:finalization.blockers,
    selectedDualBudgetProjectionSha256,
    selectedTrainingTargetStepCount:selectedStep,
    representationEvidenceSha256,
    stepMatrixEvidenceSha256,
    dualBudgetProjectionSha256,
    denseBaselineFinalizationSha256,
    finalization,
    ...authorityBoundary(),
  };
  const evidenceSha256=await selectedFinalizationDigest(readyPayload,hash);
  return deepFreeze({...readyPayload,evidenceSha256});
}

export async function hsmeDenseStudentSelectedBaselineFinalizationV1Digest(
  value:HsmeDenseStudentSelectedBaselineFinalizationV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    value.finalization===null
    ||value.selectedDualBudgetProjectionSha256==='UNKNOWN'
    ||value.selectedTrainingTargetStepCount==='UNKNOWN'
    ||value.representationEvidenceSha256==='UNKNOWN'
    ||value.stepMatrixEvidenceSha256==='UNKNOWN'
    ||value.dualBudgetProjectionSha256==='UNKNOWN'
    ||value.denseBaselineFinalizationSha256==='UNKNOWN'
    ||value.evidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_selected_finalization_digest_state',
      'only canonical-finalization-backed wrapper states are digestible',
    );
  }
  const {evidenceSha256:_ignored,...payload}=value;
  return selectedFinalizationDigest(payload,hash);
}

function mapFinalizationState(
  state:HsmeDenseBaselineFinalizationV1['state'],
):HsmeDenseStudentSelectedBaselineFinalizationV1['state']{
  switch(state){
    case 'DENSE_BASELINE_FINALIZATION_INVALID':
      return 'SELECTED_BASELINE_FINALIZATION_INVALID';
    case 'DENSE_BASELINE_PIN_REVIEW_BLOCKED':
      return 'SELECTED_BASELINE_FINALIZATION_BLOCKED';
    case 'DENSE_BASELINE_REDESIGN_REQUIRED':
      return 'SELECTED_BASELINE_REDESIGN_REQUIRED';
    case 'DENSE_BASELINE_REJECTED':
      return 'SELECTED_BASELINE_REJECTED';
    case 'DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED':
      return 'SELECTED_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED';
  }
}

function selectedProjectionAuthorityWidened(
  value:HsmeDenseStudentSelectedDualBudgetProjectionV1,
):boolean{
  return value.scheduleSelectionAllowed!==false
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
  value:NonNullable<HsmeDenseStudentSelectedDualBudgetProjectionV1['projection']>,
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
    ||value.winnerSelectionAllowed!==false;
}

function finalizationAuthorityWidened(
  value:HsmeDenseBaselineFinalizationV1,
):boolean{
  return value.canonicalDecisionPersistAllowed!==false
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
    trainingExecutionAllowed:false as const,
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
  HsmeDenseStudentSelectedBaselineFinalizationV1,
  'selectedDualBudgetProjectionSha256'
  |'selectedTrainingTargetStepCount'
  |'representationEvidenceSha256'
  |'stepMatrixEvidenceSha256'
  |'dualBudgetProjectionSha256'
>>;

function invalid(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentSelectedBaselineFinalizationV1{
  return terminal('SELECTED_BASELINE_FINALIZATION_INVALID',blockers,input);
}

function blocked(
  blockers:readonly string[],
  input:PartialOutput={},
):HsmeDenseStudentSelectedBaselineFinalizationV1{
  return terminal('SELECTED_BASELINE_FINALIZATION_BLOCKED',blockers,input);
}

function terminal(
  state:
    |'SELECTED_BASELINE_FINALIZATION_INVALID'
    |'SELECTED_BASELINE_FINALIZATION_BLOCKED',
  blockers:readonly string[],
  input:PartialOutput,
):HsmeDenseStudentSelectedBaselineFinalizationV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    selectedDualBudgetProjectionSha256:
      input.selectedDualBudgetProjectionSha256??'UNKNOWN',
    selectedTrainingTargetStepCount:
      input.selectedTrainingTargetStepCount??'UNKNOWN',
    representationEvidenceSha256:
      input.representationEvidenceSha256??'UNKNOWN',
    stepMatrixEvidenceSha256:input.stepMatrixEvidenceSha256??'UNKNOWN',
    dualBudgetProjectionSha256:input.dualBudgetProjectionSha256??'UNKNOWN',
    denseBaselineFinalizationSha256:'UNKNOWN',
    finalization:null,
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

async function selectedFinalizationDigest(
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(
    HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_DIGEST_DOMAIN
    +JSON.stringify(value),
  ));
  if(!HEX64.test(digest)){
    fail(
      'hsme_selected_finalization_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return digest;
}

function isStepCount(value:unknown):value is StepCount{
  return value===2||value===4||value===6||value===8;
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
  throw new HsmeDenseStudentSelectedBaselineFinalizationV1Error(code,message);
}

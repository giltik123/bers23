import {
  HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
  type HsmeDenseBaselineDecisionV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';
import {
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1,
  HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1,
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
  type HsmeDenseStudentStepMatrixEvidenceV1,
} from './HsmeDenseStudentStepMatrixV1.ts';
import {
  HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
  HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
  hsmeDenseBaselineProjectedDualBudgetEvidenceV1Digest,
  hsmeDenseStudentDualBudgetProjectionV1Digest,
  type HsmeDenseStudentDualBudgetProjectionV1,
} from './HsmeDenseStudentDualBudgetProjectionV1.ts';
import {
  hsmePackDescriptorV1Digest,
} from '../../../src/platform/creative/local-ai/hsme/HsmePackV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA =
  'BERS_HSME_DENSE_BASELINE_PIN_ATTESTATION_V1' as const;
export const HSME_DENSE_BASELINE_PIN_ATTESTATION_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-pin-attestation:v1\0' as const;
export const HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA =
  'BERS_HSME_DENSE_BASELINE_FINALIZATION_V1' as const;
export const HSME_DENSE_BASELINE_FINALIZATION_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-finalization:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeDenseBaselinePinAttestationV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA;
  candidateId:typeof HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID;
  representationEvidenceSha256:string;
  representationArtifactSha256:string;
  packDescriptorSha256:string;
  reviewState:'COMMERCIAL_ADMISSIBLE'|'REJECTED';
  sourceUri:string;
  license:string;
  licenseEvidenceSha256:string;
  canonicalDecisionPersistAllowed:false;
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

export interface HsmeDenseBaselineFinalizationOriginVerifierV1{
  verifySourceDecision(
    decision:HsmeDenseBaselineDecisionV1,
    expectedDecisionSha256:string,
  ):Promise<boolean>;
  verifyPinAttestation(
    attestation:HsmeDenseBaselinePinAttestationV1,
    expectedAttestationSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseBaselineFinalizationDispositionV1=
  | 'INVALID'
  | 'BLOCKED'
  | 'ADVANCE'
  | 'REDESIGN'
  | 'REJECT';

export type HsmeDenseBaselineFinalizationV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA;
  state:
    | 'DENSE_BASELINE_FINALIZATION_INVALID'
    | 'DENSE_BASELINE_PIN_REVIEW_BLOCKED'
    | 'DENSE_BASELINE_REDESIGN_REQUIRED'
    | 'DENSE_BASELINE_REJECTED'
    | 'DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED';
  disposition:HsmeDenseBaselineFinalizationDispositionV1;
  blockers:readonly string[];
  sourceDecisionSha256:string|'UNKNOWN';
  representationEvidenceSha256:string|'UNKNOWN';
  stepMatrixEvidenceSha256:string|'UNKNOWN';
  dualBudgetProjectionSha256:string|'UNKNOWN';
  projectedDualBudgetEvidenceSha256:string|'UNKNOWN';
  packDescriptorSha256:string|'UNKNOWN';
  pinAttestationSha256:string|'UNKNOWN';
  decisionCandidateSha256:string|'UNKNOWN';
  decisionCandidate:HsmeDenseBaselineDecisionV1|null;
  finalizationEvidenceSha256:string;
  canonicalDecisionPersistAllowed:false;
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

export class HsmeDenseBaselineFinalizationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseBaselineFinalizationV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseBaselinePinAttestationV1(
  raw:unknown,
):HsmeDenseBaselinePinAttestationV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'candidateId',
    'representationEvidenceSha256',
    'representationArtifactSha256',
    'packDescriptorSha256',
    'reviewState',
    'sourceUri',
    'license',
    'licenseEvidenceSha256',
    'canonicalDecisionPersistAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'pinAttestation');

  if(record.schemaVersion!==HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA){
    fail(
      'hsme_dense_finalization_attestation_schema',
      'pin attestation schema unsupported',
    );
  }
  if(record.candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID){
    fail(
      'hsme_dense_finalization_attestation_candidate',
      'pin attestation candidateId mismatch',
    );
  }
  const representationArtifactSha256=sha256(
    record.representationArtifactSha256,
    'pinAttestation.representationArtifactSha256',
  );
  const sourceUri=boundedString(record.sourceUri,'pinAttestation.sourceUri',600);
  if(!sourceUri.includes(representationArtifactSha256)){
    fail(
      'hsme_dense_finalization_attestation_source_uri',
      'sourceUri must be content-addressed by representation artifact SHA-256',
    );
  }
  const reviewState=enumValue(
    record.reviewState,
    ['COMMERCIAL_ADMISSIBLE','REJECTED'] as const,
    'pinAttestation.reviewState',
  );

  return deepFreeze({
    schemaVersion:HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA,
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    representationEvidenceSha256:sha256(
      record.representationEvidenceSha256,
      'pinAttestation.representationEvidenceSha256',
    ),
    representationArtifactSha256,
    packDescriptorSha256:sha256(
      record.packDescriptorSha256,
      'pinAttestation.packDescriptorSha256',
    ),
    reviewState,
    sourceUri,
    license:boundedString(record.license,'pinAttestation.license',160),
    licenseEvidenceSha256:sha256(
      record.licenseEvidenceSha256,
      'pinAttestation.licenseEvidenceSha256',
    ),
    ...normalizeAuthorityBoundary(record,'pinAttestation'),
  });
}

export async function hsmeDenseBaselinePinAttestationV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const attestation=normalizeHsmeDenseBaselinePinAttestationV1(raw);
  return digest(
    HSME_DENSE_BASELINE_PIN_ATTESTATION_DIGEST_DOMAIN,
    attestation,
    hash,
  );
}

export async function finalizeHsmeDenseBaselineV1(
  rawSourceDecision:unknown,
  expectedSourceDecisionSha256:string,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  projection:HsmeDenseStudentDualBudgetProjectionV1,
  rawPinAttestation:unknown|null,
  expectedPinAttestationSha256:string|null,
  origin:HsmeDenseBaselineFinalizationOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseBaselineFinalizationV1>{
  const invalidBlockers:string[]=[];
  let sourceDecision:HsmeDenseBaselineDecisionV1|null=null;
  let sourceDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  let representationEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let stepMatrixEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let dualBudgetProjectionSha256:string|'UNKNOWN'='UNKNOWN';
  let projectedDualBudgetEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let packDescriptorSha256:string|'UNKNOWN'='UNKNOWN';

  try{
    sourceDecision=normalizeHsmeDenseBaselineDecisionV1(rawSourceDecision);
  }catch(error){
    invalidBlockers.push(
      'DENSE_FINALIZATION_SOURCE_DECISION_INVALID'+errorCodeSuffix(error),
    );
  }
  if(sourceDecision!==null){
    if(!HEX64.test(expectedSourceDecisionSha256)){
      invalidBlockers.push('DENSE_FINALIZATION_SOURCE_DECISION_EXPECTED_DIGEST_INVALID');
    }else{
      try{
        sourceDecisionSha256=await hsmeDenseBaselineDecisionV1Digest(
          sourceDecision,
          hash,
        );
        if(sourceDecisionSha256!==expectedSourceDecisionSha256){
          invalidBlockers.push('DENSE_FINALIZATION_SOURCE_DECISION_DIGEST_MISMATCH');
        }else if(!await verify(
          ()=>origin.verifySourceDecision(
            sourceDecision as HsmeDenseBaselineDecisionV1,
            sourceDecisionSha256 as string,
          ),
        )){
          invalidBlockers.push('DENSE_FINALIZATION_SOURCE_DECISION_ORIGIN_UNVERIFIED');
        }
      }catch{
        invalidBlockers.push('DENSE_FINALIZATION_SOURCE_DECISION_REHASH_INVALID');
      }
    }
  }

  try{
    representationEvidenceSha256=
      await hsmeDenseStudentRepresentationEvidenceV1Digest(
        representation,
        hash,
      );
    if(representationEvidenceSha256!==representation.evidenceSha256){
      invalidBlockers.push('DENSE_FINALIZATION_REPRESENTATION_DIGEST_MISMATCH');
    }
  }catch{
    invalidBlockers.push('DENSE_FINALIZATION_REPRESENTATION_INVALID');
  }

  try{
    stepMatrixEvidenceSha256=
      await hsmeDenseStudentStepMatrixEvidenceV1Digest(stepMatrix,hash);
    if(stepMatrixEvidenceSha256!==stepMatrix.evidenceSha256){
      invalidBlockers.push('DENSE_FINALIZATION_STEP_MATRIX_DIGEST_MISMATCH');
    }
  }catch{
    invalidBlockers.push('DENSE_FINALIZATION_STEP_MATRIX_INVALID');
  }

  try{
    dualBudgetProjectionSha256=
      await hsmeDenseStudentDualBudgetProjectionV1Digest(projection,hash);
    if(dualBudgetProjectionSha256!==projection.projectionEvidenceSha256){
      invalidBlockers.push('DENSE_FINALIZATION_PROJECTION_DIGEST_MISMATCH');
    }
  }catch{
    invalidBlockers.push('DENSE_FINALIZATION_PROJECTION_INVALID');
  }

  try{
    projectedDualBudgetEvidenceSha256=
      await hsmeDenseBaselineProjectedDualBudgetEvidenceV1Digest(
        projection.projectedEvidence,
        hash,
      );
    if(
      projectedDualBudgetEvidenceSha256!==projection.projectedEvidenceSha256
    ){
      invalidBlockers.push(
        'DENSE_FINALIZATION_PROJECTED_DUAL_BUDGET_DIGEST_MISMATCH',
      );
    }
  }catch{
    invalidBlockers.push('DENSE_FINALIZATION_PROJECTED_DUAL_BUDGET_INVALID');
  }

  if(representation.packDescriptor!==null){
    try{
      packDescriptorSha256=await hsmePackDescriptorV1Digest(
        representation.packDescriptor,
        hash,
      );
      if(packDescriptorSha256!==representation.packDescriptorSha256){
        invalidBlockers.push('DENSE_FINALIZATION_PACK_DIGEST_MISMATCH');
      }
    }catch{
      invalidBlockers.push('DENSE_FINALIZATION_PACK_INVALID');
    }
  }else{
    invalidBlockers.push('DENSE_FINALIZATION_PACK_MISSING');
  }

  validateAuthorityAndBindings(
    sourceDecision,
    representation,
    stepMatrix,
    projection,
    representationEvidenceSha256,
    stepMatrixEvidenceSha256,
    packDescriptorSha256,
    invalidBlockers,
  );

  if(invalidBlockers.length>0){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      invalidBlockers,
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256:'UNKNOWN',
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  const decision=sourceDecision as HsmeDenseBaselineDecisionV1;
  const redesignBlockers=evaluateMeasuredRedesignGates(
    decision,
    representation,
    stepMatrix,
    projection,
  );
  if(redesignBlockers.length>0){
    return buildResult(
      'DENSE_BASELINE_REDESIGN_REQUIRED',
      'REDESIGN',
      redesignBlockers,
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256:'UNKNOWN',
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  if(
    representation.components===null
    ||representation.components.textConditionerSha256!=='NONE'
  ){
    return buildResult(
      'DENSE_BASELINE_PIN_REVIEW_BLOCKED',
      'BLOCKED',
      ['DENSE_FINALIZATION_TEXT_CONDITIONER_BYTES_REQUIRED'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256:'UNKNOWN',
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  if(rawPinAttestation===null){
    if(expectedPinAttestationSha256!==null){
      return buildResult(
        'DENSE_BASELINE_FINALIZATION_INVALID',
        'INVALID',
        ['DENSE_FINALIZATION_ATTESTATION_MISSING_WITH_EXPECTED_DIGEST'],
        {
          sourceDecisionSha256,
          representationEvidenceSha256,
          stepMatrixEvidenceSha256,
          dualBudgetProjectionSha256,
          projectedDualBudgetEvidenceSha256,
          packDescriptorSha256,
          pinAttestationSha256:'UNKNOWN',
          decisionCandidate:null,
          decisionCandidateSha256:'UNKNOWN',
        },
        hash,
      );
    }
    return buildResult(
      'DENSE_BASELINE_PIN_REVIEW_BLOCKED',
      'BLOCKED',
      ['DENSE_FINALIZATION_COMMERCIAL_LICENSE_REVIEW_REQUIRED'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256:'UNKNOWN',
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  if(
    expectedPinAttestationSha256===null
    ||!HEX64.test(expectedPinAttestationSha256)
  ){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      ['DENSE_FINALIZATION_ATTESTATION_EXPECTED_DIGEST_INVALID'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256:'UNKNOWN',
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  let attestation:HsmeDenseBaselinePinAttestationV1;
  let pinAttestationSha256:string;
  try{
    attestation=normalizeHsmeDenseBaselinePinAttestationV1(rawPinAttestation);
    pinAttestationSha256=await hsmeDenseBaselinePinAttestationV1Digest(
      attestation,
      hash,
    );
  }catch(error){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      ['DENSE_FINALIZATION_ATTESTATION_INVALID'+errorCodeSuffix(error)],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256:'UNKNOWN',
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  if(pinAttestationSha256!==expectedPinAttestationSha256){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      ['DENSE_FINALIZATION_ATTESTATION_DIGEST_MISMATCH'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256,
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }
  if(!await verify(
    ()=>origin.verifyPinAttestation(attestation,pinAttestationSha256),
  )){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      ['DENSE_FINALIZATION_ATTESTATION_ORIGIN_UNVERIFIED'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256,
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }
  if(
    attestation.representationEvidenceSha256!==representationEvidenceSha256
    ||attestation.representationArtifactSha256!==
      representation.representationArtifactSha256
    ||attestation.packDescriptorSha256!==packDescriptorSha256
  ){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      ['DENSE_FINALIZATION_ATTESTATION_BINDING_MISMATCH'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256,
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  if(attestation.reviewState==='REJECTED'){
    return buildResult(
      'DENSE_BASELINE_REJECTED',
      'REJECT',
      ['DENSE_FINALIZATION_LICENSE_REJECTED'],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256,
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  const decisionCandidate=buildPinnedDecisionCandidate(
    decision,
    representation,
    stepMatrix,
    projection,
    attestation,
  );
  let normalizedCandidate:HsmeDenseBaselineDecisionV1;
  let decisionCandidateSha256:string;
  try{
    normalizedCandidate=normalizeHsmeDenseBaselineDecisionV1(decisionCandidate);
    decisionCandidateSha256=await hsmeDenseBaselineDecisionV1Digest(
      normalizedCandidate,
      hash,
    );
    assertNonTargetCandidatesUnchanged(decision,normalizedCandidate);
  }catch(error){
    return buildResult(
      'DENSE_BASELINE_FINALIZATION_INVALID',
      'INVALID',
      ['DENSE_FINALIZATION_PIN_CANDIDATE_INVALID'+errorCodeSuffix(error)],
      {
        sourceDecisionSha256,
        representationEvidenceSha256,
        stepMatrixEvidenceSha256,
        dualBudgetProjectionSha256,
        projectedDualBudgetEvidenceSha256,
        packDescriptorSha256,
        pinAttestationSha256,
        decisionCandidate:null,
        decisionCandidateSha256:'UNKNOWN',
      },
      hash,
    );
  }

  return buildResult(
    'DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED',
    'ADVANCE',
    [],
    {
      sourceDecisionSha256,
      representationEvidenceSha256,
      stepMatrixEvidenceSha256,
      dualBudgetProjectionSha256,
      projectedDualBudgetEvidenceSha256,
      packDescriptorSha256,
      pinAttestationSha256,
      decisionCandidate:normalizedCandidate,
      decisionCandidateSha256,
    },
    hash,
  );
}

export async function hsmeDenseBaselineFinalizationV1Digest(
  finalization:HsmeDenseBaselineFinalizationV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const {
    finalizationEvidenceSha256:_finalizationEvidenceSha256,
    ...payload
  }=finalization;
  return digest(HSME_DENSE_BASELINE_FINALIZATION_DIGEST_DOMAIN,payload,hash);
}

function validateAuthorityAndBindings(
  decision:HsmeDenseBaselineDecisionV1|null,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  projection:HsmeDenseStudentDualBudgetProjectionV1,
  representationEvidenceSha256:string|'UNKNOWN',
  stepMatrixEvidenceSha256:string|'UNKNOWN',
  packDescriptorSha256:string|'UNKNOWN',
  blockers:string[],
):void{
  if(
    decision===null
    ||decision.schemaVersion!==HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA
    ||decision.decisionStatus!=='REDESIGN_REQUIRED'
    ||decision.selectedCandidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
    ||decision.trainingTarget?.candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
  ){
    blockers.push('DENSE_FINALIZATION_SOURCE_DECISION_STATE_INVALID');
  }

  if(
    representation.state!=='REPRESENTATION_READY_NOT_ADMITTED'
    ||representation.blockers.length!==0
    ||representation.candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
    ||representation.architectureFamily!=='COMPACT_DIT'
    ||representation.representationArtifactSha256==='UNKNOWN'
    ||representation.representationBytes==='UNKNOWN'
    ||representation.representationMetadataSha256==='UNKNOWN'
    ||representation.components===null
    ||representation.exportToolchainSha256==='UNKNOWN'
    ||representation.packCandidateState!=='PACK_CANDIDATE_READY_NOT_ADMITTED'
    ||representation.packDescriptor===null
    ||representation.packDescriptorSha256==='UNKNOWN'
  ){
    blockers.push('DENSE_FINALIZATION_REPRESENTATION_STATE_INVALID');
  }

  if(
    representation.checkpointPromotionAllowed!==false
    ||representation.modelInstallAllowed!==false
    ||representation.modelFleetPromotionAllowed!==false
    ||representation.durableModelFleetPromotionAllowed!==false
    ||representation.productionAuthorityGranted!==false
    ||representation.providerAuthorityGranted!==false
    ||representation.billingAuthorityGranted!==false
    ||representation.projectArtifactMutationAllowed!==false
    ||representation.aeeExecutionAuthorityGranted!==false
    ||representation.winnerSelectionAllowed!==false
  ){
    blockers.push('DENSE_FINALIZATION_REPRESENTATION_AUTHORITY_WIDENING');
  }

  if(
    stepMatrix.state!=='STEP_MATRIX_READY_NOT_SELECTED'
    ||stepMatrix.blockers.length!==0
    ||stepMatrix.candidateId!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
    ||stepMatrix.rows.length!==8
    ||stepMatrix.representationEvidenceSha256!==representationEvidenceSha256
    ||stepMatrix.representationArtifactSha256!==
      representation.representationArtifactSha256
    ||stepMatrix.representationBytes!==representation.representationBytes
  ){
    blockers.push('DENSE_FINALIZATION_STEP_MATRIX_BINDING_INVALID');
  }
  if(
    stepMatrix.weightedAggregateScoreAllowed!==false
    ||stepMatrix.efficiencyMayOverrideQualityFailure!==false
    ||stepMatrix.scheduleSelectionAllowed!==false
    ||stepMatrix.candidateSelectionAllowed!==false
    ||stepMatrix.checkpointPromotionAllowed!==false
    ||stepMatrix.modelInstallAllowed!==false
    ||stepMatrix.modelFleetPromotionAllowed!==false
    ||stepMatrix.durableModelFleetPromotionAllowed!==false
    ||stepMatrix.productionAuthorityGranted!==false
    ||stepMatrix.providerAuthorityGranted!==false
    ||stepMatrix.billingAuthorityGranted!==false
    ||stepMatrix.projectArtifactMutationAllowed!==false
    ||stepMatrix.aeeExecutionAuthorityGranted!==false
    ||stepMatrix.winnerSelectionAllowed!==false
  ){
    blockers.push('DENSE_FINALIZATION_STEP_MATRIX_AUTHORITY_WIDENING');
  }
  validateFixedMatrixRoster(stepMatrix,blockers);

  if(
    projection.schemaVersion!==HSME_DENSE_STUDENT_DUAL_BUDGET_PROJECTION_V1_SCHEMA
    ||projection.state!=='DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN'
    ||projection.representationEvidenceSha256!==representationEvidenceSha256
    ||projection.stepMatrixEvidenceSha256!==stepMatrixEvidenceSha256
    ||projection.changedCandidateIds.length!==1
    ||projection.changedCandidateIds[0]!==HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
    ||projection.projectedCandidate.candidateId!==
      HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
  ){
    blockers.push('DENSE_FINALIZATION_PROJECTION_BINDING_INVALID');
  }
  if(
    projection.baselineSelectionAllowed!==false
    ||projection.scheduleSelectionAllowed!==false
    ||projection.candidateSelectionAllowed!==false
    ||projection.modelInstallAllowed!==false
    ||projection.modelFleetPromotionAllowed!==false
    ||projection.durableModelFleetPromotionAllowed!==false
    ||projection.productionAuthorityGranted!==false
    ||projection.providerAuthorityGranted!==false
    ||projection.billingAuthorityGranted!==false
    ||projection.projectArtifactMutationAllowed!==false
    ||projection.aeeExecutionAuthorityGranted!==false
    ||projection.winnerSelectionAllowed!==false
  ){
    blockers.push('DENSE_FINALIZATION_PROJECTION_AUTHORITY_WIDENING');
  }

  const pack=representation.packDescriptor;
  if(
    pack===null
    ||pack.roots.length!==1
    ||pack.roots[0].role!=='BASE'
    ||pack.roots[0].sha256!==representation.representationArtifactSha256
    ||pack.routing.mode!=='SHARED_ONLY'
    ||pack.routing.maxActiveExperts!==0
    ||packDescriptorSha256!==representation.packDescriptorSha256
  ){
    blockers.push('DENSE_FINALIZATION_PACK_BINDING_INVALID');
  }

  const projected=projection.projectedCandidate;
  if(
    projected.qualityPerInstalledGbStatus!=='MEASURED'
    ||projected.efficiencyDisposition!=='R&D_ONLY'
    ||projected.mvmState!=='NOT_EVALUATED'
    ||projected.installed.mandatoryInstalledBytes!==representation.representationBytes
  ){
    blockers.push('DENSE_FINALIZATION_PROJECTED_CANDIDATE_INVALID');
  }
}

function evaluateMeasuredRedesignGates(
  decision:HsmeDenseBaselineDecisionV1,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  projection:HsmeDenseStudentDualBudgetProjectionV1,
):readonly string[]{
  const blockers:string[]=[];
  const target=decision.trainingTarget;
  if(!target){
    return Object.freeze(['DENSE_FINALIZATION_TRAINING_TARGET_MISSING']);
  }

  for(const row of stepMatrix.rows){
    if(row.criticalFailureCount>0){
      blockers.push(
        'DENSE_FINALIZATION_CRITICAL_FAILURE:'+row.capability+':'+row.stepCount,
      );
    }
    for(const dimension of row.qualityDimensions){
      if(dimension.criticalFailureObserved){
        blockers.push(
          'DENSE_FINALIZATION_CRITICAL_QUALITY_FAILURE:'
          +row.capability+':'+row.stepCount+':'+dimension.dimensionId,
        );
      }
    }
  }

  const installed=projection.projectedCandidate.installed.mandatoryInstalledBytes;
  if(
    installed==='UNKNOWN'
    ||installed>target.initialUsefulPackBytes.max
    ||installed!==representation.representationBytes
  ){
    blockers.push('DENSE_FINALIZATION_INSTALLED_BUDGET_EXCEEDED');
  }

  const activeWeights=projection.projectedCandidate.workingMemory.activeWeightsBytes;
  if(activeWeights==='UNKNOWN'||activeWeights>target.activeWeightsMaxBytes){
    blockers.push('DENSE_FINALIZATION_ACTIVE_WEIGHTS_BUDGET_EXCEEDED');
  }

  return Object.freeze([...new Set(blockers)].sort(lexical));
}

function buildPinnedDecisionCandidate(
  source:HsmeDenseBaselineDecisionV1,
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  projection:HsmeDenseStudentDualBudgetProjectionV1,
  attestation:HsmeDenseBaselinePinAttestationV1,
):unknown{
  const pack=representation.packDescriptor;
  const components=representation.components;
  if(
    pack===null
    ||components===null
    ||representation.representationArtifactSha256==='UNKNOWN'
    ||representation.representationBytes==='UNKNOWN'
    ||representation.representationMetadataSha256==='UNKNOWN'
    ||representation.exportToolchainSha256==='UNKNOWN'
    ||stepMatrix.evidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_dense_finalization_pin_source_unresolved',
      'pin candidate source evidence remains unresolved',
    );
  }
  const root=pack.roots[0];
  const targetCandidate=source.candidates.find(
    value=>value.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
  );
  if(!targetCandidate){
    fail(
      'hsme_dense_finalization_pin_source_candidate',
      'target candidate missing from source decision',
    );
  }

  return {
    schemaVersion:HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
    decisionStatus:'BASELINE_PINNED',
    rationale:Object.freeze([
      ...source.rationale,
      'Measured dense-student representation, fixed 2/4/6/8 quality-resource matrix, dual-budget projection, HSME pack binding, and external commercial license review satisfy the HSME-2 pin-review evidence gate.',
    ]),
    candidates:source.candidates.map(candidate=>
      candidate.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID
        ?{
          ...candidate,
          verdict:'SELECTED_BASELINE',
          metrics:{
            ...candidate.metrics,
            parametersMillions:representation.activeParametersMillions,
            fullPipelineBytes:representation.representationBytes,
            textConditionerBytes:0,
            supportedStepCounts:[...HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1],
          },
        }
        :candidate
    ),
    selectedCandidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    baselinePin:{
      modelId:root.modelId,
      version:root.version,
      sourceUri:attestation.sourceUri,
      sourceRevision:representation.representationArtifactSha256,
      contentSha256:representation.representationArtifactSha256,
      packageBytes:representation.representationBytes,
      license:attestation.license,
      licenseConclusion:'COMMERCIAL_ADMISSIBLE',
      licenseEvidenceSha256:attestation.licenseEvidenceSha256,
      toolchainLockSha256:representation.exportToolchainSha256,
      architectureConfigSha256:components.modelConfigSha256,
      representationManifestSha256:representation.representationMetadataSha256,
      evaluationContractSha256:stepMatrix.benchmarkBindingSha256,
      qualityEvidenceSha256:stepMatrix.evidenceSha256,
      runtimeEvidenceSha256:projection.projectedEvidenceSha256,
      hsmeBindingEvidenceSha256:representation.packDescriptorSha256,
    },
  };
}

function validateFixedMatrixRoster(
  stepMatrix:HsmeDenseStudentStepMatrixEvidenceV1,
  blockers:string[],
):void{
  const expected=HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1.flatMap(
    capability=>HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1.map(
      stepCount=>capability+'\0'+stepCount,
    ),
  ).sort(lexical);
  const actual=stepMatrix.rows.map(
    row=>row.capability+'\0'+row.stepCount,
  ).sort(lexical);
  if(
    actual.length!==expected.length
    ||actual.some((value,index)=>value!==expected[index])
  ){
    blockers.push('DENSE_FINALIZATION_STEP_MATRIX_ROSTER_INVALID');
  }
}

function assertNonTargetCandidatesUnchanged(
  source:HsmeDenseBaselineDecisionV1,
  candidate:HsmeDenseBaselineDecisionV1,
):void{
  for(const sourceCandidate of source.candidates){
    if(sourceCandidate.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID){
      continue;
    }
    const projected=candidate.candidates.find(
      value=>value.candidateId===sourceCandidate.candidateId,
    );
    if(!projected||JSON.stringify(projected)!==JSON.stringify(sourceCandidate)){
      fail(
        'hsme_dense_finalization_non_target_drift',
        'pin candidate changed non-target comparison candidate '
        +sourceCandidate.candidateId,
      );
    }
  }
}

async function buildResult(
  state:HsmeDenseBaselineFinalizationV1['state'],
  disposition:HsmeDenseBaselineFinalizationDispositionV1,
  rawBlockers:readonly string[],
  values:Pick<
    HsmeDenseBaselineFinalizationV1,
    'sourceDecisionSha256'|'representationEvidenceSha256'|
    'stepMatrixEvidenceSha256'|'dualBudgetProjectionSha256'|
    'projectedDualBudgetEvidenceSha256'|'packDescriptorSha256'|
    'pinAttestationSha256'|'decisionCandidateSha256'|'decisionCandidate'
  >,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseBaselineFinalizationV1>{
  const payload={
    schemaVersion:HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA,
    state,
    disposition,
    blockers:Object.freeze([...new Set(rawBlockers)].sort(lexical)),
    ...values,
    ...authorityBoundary(),
  };
  const finalizationEvidenceSha256=await digest(
    HSME_DENSE_BASELINE_FINALIZATION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,finalizationEvidenceSha256});
}

function normalizeAuthorityBoundary(
  record:Record<string,unknown>,
  path:string,
){
  for(const field of [
    'canonicalDecisionPersistAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    if(record[field]!==false){
      fail(
        'hsme_dense_finalization_attestation_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
  return authorityBoundary();
}

function authorityBoundary(){
  return Object.freeze({
    canonicalDecisionPersistAllowed:false as const,
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_dense_finalization_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_dense_finalization_schema',
      path+' contains unknown or missing fields',
    );
  }
  return record;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_dense_finalization_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_dense_finalization_value',path+' is invalid');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_dense_finalization_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_dense_finalization_value',path+' is unsupported');
  }
  return raw as T[number];
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_dense_finalization_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
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

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeDenseBaselineFinalizationV1Error(code,message);
}

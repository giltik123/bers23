import {
  HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
  hsmeAdapterMoeExpertDeltaManifestV1Digest,
  normalizeHsmeAdapterMoeExpertDeltaManifestV1,
  type HsmeAdapterMoeExpertDeltaManifestV1,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
  type HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  type HsmeAdapterMoeExpertTrainingPreflightV1,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingRunReceiptV1Digest,
  type HsmeAdapterMoeExpertTrainingRunReceiptOriginVerifierV1,
  type HsmeAdapterMoeExpertTrainingRunReceiptV1,
} from './HsmeAdapterMoeExpertProtectedTrainingRunV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-artifact-attestation:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-real-run-evidence:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeAdapterMoeExpertArtifactAttestationV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1_SCHEMA;
  expertId:string;
  trainingRunReceiptSha256:string;
  artifactSha256:string;
  artifactBytes:number;
  artifactMetadataSha256:string;
  artifactUri:string;
  artifactRevision:string;
  license:string;
  licenseEvidenceSha256:string;
  reviewState:'REAL_PROTECTED_ARTIFACT_VERIFIED';
  expertPackAdmissionAllowed:false;
  prototypeAssemblyAllowed:false;
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

export interface HsmeAdapterMoeExpertArtifactAttestationOriginVerifierV1{
  verifyArtifactAttestation(
    attestation:HsmeAdapterMoeExpertArtifactAttestationV1,
    expectedAttestationSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertRealProtectedRunBindingV1=Readonly<{
  preflightEvidenceSha256:string;
  workspaceFreezeReceiptSha256:string;
  workspaceSha256:string;
  experimentPlanSha256:string;
  trainingSpecSha256:string;
  expertId:string;
  executionAttemptId:string;
  trainingRunReceiptSha256:string;
  stagedArtifactSha256:string;
  stagedArtifactBytes:number;
  stagedArtifactMetadataSha256:string;
  consumedTrainingExamples:number;
  consumedGpuSeconds:number;
  consumedTrainingCostMicrousd:number;
}>;

export interface HsmeAdapterMoeExpertRealProtectedRunOriginVerifierV1{
  verifyRealProtectedRun(
    receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
    binding:HsmeAdapterMoeExpertRealProtectedRunBindingV1,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertRealRunEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID'
    |'ADAPTER_MOE_EXPERT_REAL_RUN_BLOCKED'
    |'ADAPTER_MOE_EXPERT_REAL_RUN_READY_NOT_PACKED';
  blockers:readonly string[];
  preflightEvidenceSha256:string|'UNKNOWN';
  trainingRunReceiptSha256:string|'UNKNOWN';
  artifactAttestationSha256:string|'UNKNOWN';
  experimentPlanSha256:string|'UNKNOWN';
  trainingSpecSha256:string|'UNKNOWN';
  expertId:string|'UNKNOWN';
  workspaceFreezeReceiptSha256:string|'UNKNOWN';
  workspaceSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  consumedTrainingExamples:number|'UNKNOWN';
  consumedGpuSeconds:number|'UNKNOWN';
  consumedTrainingCostMicrousd:number|'UNKNOWN';
  realProtectedExecution:boolean;
  manifest:HsmeAdapterMoeExpertDeltaManifestV1|null;
  manifestSha256:string|'UNKNOWN';
  evidenceSha256:string;
  expertPackAdmissionAllowed:false;
  prototypeAssemblyAllowed:false;
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

export class HsmeAdapterMoeExpertRealRunEvidenceV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExpertRealRunEvidenceV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeExpertArtifactAttestationV1(
  raw:unknown,
):HsmeAdapterMoeExpertArtifactAttestationV1{
  const record=exactRecord(raw,[
    'schemaVersion','expertId','trainingRunReceiptSha256','artifactSha256',
    'artifactBytes','artifactMetadataSha256','artifactUri','artifactRevision',
    'license','licenseEvidenceSha256','reviewState','expertPackAdmissionAllowed',
    'prototypeAssemblyAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'attestation');
  if(record.schemaVersion!==HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1_SCHEMA){
    fail('hsme_adapter_moe_real_artifact_schema','artifact attestation schema unsupported');
  }
  if(record.reviewState!=='REAL_PROTECTED_ARTIFACT_VERIFIED'){
    fail('hsme_adapter_moe_real_artifact_review','artifact attestation review state invalid');
  }
  assertNoAuthority(record,'attestation');
  const artifactRevision=boundedString(
    record.artifactRevision,
    'attestation.artifactRevision',
    64,
  );
  if(!IMMUTABLE_REVISION.test(artifactRevision)){
    fail(
      'hsme_adapter_moe_real_artifact_revision',
      'artifactRevision must be immutable 40- or 64-hex',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1_SCHEMA,
    expertId:identifier(record.expertId,'attestation.expertId',120),
    trainingRunReceiptSha256:sha256(
      record.trainingRunReceiptSha256,
      'attestation.trainingRunReceiptSha256',
    ),
    artifactSha256:sha256(record.artifactSha256,'attestation.artifactSha256'),
    artifactBytes:safeInteger(
      record.artifactBytes,
      'attestation.artifactBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    artifactMetadataSha256:sha256(
      record.artifactMetadataSha256,
      'attestation.artifactMetadataSha256',
    ),
    artifactUri:boundedString(record.artifactUri,'attestation.artifactUri',500),
    artifactRevision,
    license:boundedString(record.license,'attestation.license',180),
    licenseEvidenceSha256:sha256(
      record.licenseEvidenceSha256,
      'attestation.licenseEvidenceSha256',
    ),
    reviewState:'REAL_PROTECTED_ARTIFACT_VERIFIED',
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoeExpertArtifactAttestationV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const attestation=normalizeHsmeAdapterMoeExpertArtifactAttestationV1(raw);
  return digest(
    HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_DIGEST_DOMAIN,
    attestation,
    hash,
  );
}

export async function deriveHsmeAdapterMoeExpertRealRunEvidenceV1(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  expectedPreflightSha256:string,
  preflightOrigin:HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  expectedReceiptSha256:string,
  receiptOrigin:HsmeAdapterMoeExpertTrainingRunReceiptOriginVerifierV1,
  realRunOrigin:HsmeAdapterMoeExpertRealProtectedRunOriginVerifierV1,
  rawAttestation:unknown,
  expectedAttestationSha256:string,
  attestationOrigin:HsmeAdapterMoeExpertArtifactAttestationOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertRealRunEvidenceV1>{
  if(!isReadyPreflight(preflight)){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_BLOCKED',
      ['REAL_EXPERT_READY_PREFLIGHT_REQUIRED'],
      {},
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(!isCompletedReceipt(receipt)){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_BLOCKED',
      ['REAL_EXPERT_COMPLETED_RUN_RECEIPT_REQUIRED'],
      {},
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }

  let preflightEvidenceSha256:string;
  try{
    preflightEvidenceSha256=
      await hsmeAdapterMoeExpertTrainingPreflightV1Digest(preflight,hash);
  }catch{
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_PREFLIGHT_REHASH_INVALID'],
      {},
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(
    !HEX64.test(expectedPreflightSha256)
    ||preflightEvidenceSha256!==expectedPreflightSha256
    ||preflightEvidenceSha256!==preflight.preflightEvidenceSha256
  ){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_PREFLIGHT_REHASH_MISMATCH'],
      {preflightEvidenceSha256},
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(!await verify(
    ()=>preflightOrigin.verifyTrainingPreflight(
      preflight,
      preflightEvidenceSha256,
    ),
  )){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_PREFLIGHT_ORIGIN_UNVERIFIED'],
      {preflightEvidenceSha256},
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }

  let trainingRunReceiptSha256:string;
  try{
    trainingRunReceiptSha256=
      await hsmeAdapterMoeExpertTrainingRunReceiptV1Digest(receipt,hash);
  }catch{
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_RUN_RECEIPT_REHASH_INVALID'],
      {preflightEvidenceSha256},
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }
  const common=valuesFromRun(
    preflight,
    receipt,
    preflightEvidenceSha256,
    trainingRunReceiptSha256,
  );
  if(
    !HEX64.test(expectedReceiptSha256)
    ||trainingRunReceiptSha256!==expectedReceiptSha256
    ||trainingRunReceiptSha256!==receipt.receiptEvidenceSha256
  ){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_RUN_RECEIPT_REHASH_MISMATCH'],
      common,
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(!await verify(
    ()=>receiptOrigin.verifyTrainingRunReceipt(
      receipt,
      trainingRunReceiptSha256,
    ),
  )){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_RUN_RECEIPT_ORIGIN_UNVERIFIED'],
      common,
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(!runBindsPreflight(preflight,receipt,preflightEvidenceSha256)){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_RUN_PREFLIGHT_BINDING_MISMATCH'],
      common,
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }

  const binding=realRunBinding(receipt,trainingRunReceiptSha256);
  if(!await verify(()=>realRunOrigin.verifyRealProtectedRun(receipt,binding))){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_BLOCKED',
      ['REAL_EXPERT_PROTECTED_ORIGIN_UNVERIFIED'],
      common,
      false,
      null,
      'UNKNOWN',
      hash,
    );
  }

  let attestation:HsmeAdapterMoeExpertArtifactAttestationV1;
  let artifactAttestationSha256:string;
  try{
    attestation=normalizeHsmeAdapterMoeExpertArtifactAttestationV1(
      rawAttestation,
    );
    artifactAttestationSha256=
      await hsmeAdapterMoeExpertArtifactAttestationV1Digest(attestation,hash);
  }catch{
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_ARTIFACT_ATTESTATION_INVALID'],
      common,
      true,
      null,
      'UNKNOWN',
      hash,
    );
  }
  const attested={...common,artifactAttestationSha256};
  if(
    !HEX64.test(expectedAttestationSha256)
    ||artifactAttestationSha256!==expectedAttestationSha256
  ){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_ARTIFACT_ATTESTATION_REHASH_MISMATCH'],
      attested,
      true,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(!await verify(
    ()=>attestationOrigin.verifyArtifactAttestation(
      attestation,
      artifactAttestationSha256,
    ),
  )){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_ARTIFACT_ATTESTATION_ORIGIN_UNVERIFIED'],
      attested,
      true,
      null,
      'UNKNOWN',
      hash,
    );
  }
  if(!attestationBindsRun(preflight,receipt,trainingRunReceiptSha256,attestation)){
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_ARTIFACT_ATTESTATION_BINDING_MISMATCH'],
      attested,
      true,
      null,
      'UNKNOWN',
      hash,
    );
  }

  let manifest:HsmeAdapterMoeExpertDeltaManifestV1;
  let manifestSha256:string;
  try{
    manifest=deriveCanonicalManifest(
      preflight,
      receipt,
      trainingRunReceiptSha256,
      attestation,
    );
    manifestSha256=
      await hsmeAdapterMoeExpertDeltaManifestV1Digest(manifest,hash);
  }catch{
    return evidence(
      'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID',
      ['REAL_EXPERT_CANONICAL_MANIFEST_INVALID'],
      attested,
      true,
      null,
      'UNKNOWN',
      hash,
    );
  }

  return evidence(
    'ADAPTER_MOE_EXPERT_REAL_RUN_READY_NOT_PACKED',
    [],
    attested,
    true,
    manifest,
    manifestSha256,
    hash,
  );
}

export async function hsmeAdapterMoeExpertRealRunEvidenceV1Digest(
  value:HsmeAdapterMoeExpertRealRunEvidenceV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const {evidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function deriveCanonicalManifest(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  trainingRunReceiptSha256:string,
  attestation:HsmeAdapterMoeExpertArtifactAttestationV1,
):HsmeAdapterMoeExpertDeltaManifestV1{
  const delta=receipt.stagedExpertDelta;
  if(
    delta===null
    ||preflight.expertId==='UNKNOWN'
    ||preflight.specialistHypothesis==='UNKNOWN'
    ||preflight.adapterKind==='UNKNOWN'
    ||preflight.experimentPlanSha256==='UNKNOWN'
    ||preflight.denseBaselineDecisionSha256==='UNKNOWN'
    ||preflight.denseBaselineContentSha256==='UNKNOWN'
    ||preflight.targetModuleSetSha256==='UNKNOWN'
    ||preflight.adapterConfigSha256==='UNKNOWN'
    ||preflight.trainingToolchainSha256==='UNKNOWN'
  ){
    fail('hsme_adapter_moe_real_manifest_shape','manifest source binding incomplete');
  }
  return normalizeHsmeAdapterMoeExpertDeltaManifestV1({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
    expertId:preflight.expertId,
    specialistHypothesis:preflight.specialistHypothesis,
    adapterKind:preflight.adapterKind,
    experimentPlanSha256:preflight.experimentPlanSha256,
    denseBaselineDecisionSha256:preflight.denseBaselineDecisionSha256,
    denseBaselineContentSha256:preflight.denseBaselineContentSha256,
    targetModuleSetSha256:preflight.targetModuleSetSha256,
    adapterConfigSha256:preflight.adapterConfigSha256,
    artifactUri:attestation.artifactUri,
    artifactRevision:attestation.artifactRevision,
    contentSha256:delta.artifactSha256,
    artifactBytes:delta.artifactBytes,
    trainableParameters:delta.trainableParameters,
    exportToolchainSha256:preflight.trainingToolchainSha256,
    trainingReceiptSha256:trainingRunReceiptSha256,
    license:attestation.license,
    licenseEvidenceSha256:attestation.licenseEvidenceSha256,
    requiresSharedBaseline:true,
    containsFullBackboneWeights:false,
    ...manifestAuthorityBoundary(),
  });
}

function realRunBinding(
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  trainingRunReceiptSha256:string,
):HsmeAdapterMoeExpertRealProtectedRunBindingV1{
  const delta=receipt.stagedExpertDelta;
  if(
    delta===null
    ||receipt.preflightEvidenceSha256==='UNKNOWN'
    ||receipt.workspaceFreezeReceiptSha256==='UNKNOWN'
    ||receipt.workspaceSha256==='UNKNOWN'
    ||receipt.experimentPlanSha256==='UNKNOWN'
    ||receipt.trainingSpecSha256==='UNKNOWN'
    ||receipt.expertId==='UNKNOWN'
    ||receipt.executionAttemptId==='UNKNOWN'
    ||receipt.consumedTrainingExamples==='UNKNOWN'
    ||receipt.consumedGpuSeconds==='UNKNOWN'
    ||receipt.consumedTrainingCostMicrousd==='UNKNOWN'
  ){
    fail('hsme_adapter_moe_real_binding_shape','real-run binding incomplete');
  }
  return deepFreeze({
    preflightEvidenceSha256:receipt.preflightEvidenceSha256,
    workspaceFreezeReceiptSha256:receipt.workspaceFreezeReceiptSha256,
    workspaceSha256:receipt.workspaceSha256,
    experimentPlanSha256:receipt.experimentPlanSha256,
    trainingSpecSha256:receipt.trainingSpecSha256,
    expertId:receipt.expertId,
    executionAttemptId:receipt.executionAttemptId,
    trainingRunReceiptSha256,
    stagedArtifactSha256:delta.artifactSha256,
    stagedArtifactBytes:delta.artifactBytes,
    stagedArtifactMetadataSha256:delta.artifactMetadataSha256,
    consumedTrainingExamples:receipt.consumedTrainingExamples,
    consumedGpuSeconds:receipt.consumedGpuSeconds,
    consumedTrainingCostMicrousd:receipt.consumedTrainingCostMicrousd,
  });
}

function runBindsPreflight(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  preflightSha:string,
):boolean{
  const delta=receipt.stagedExpertDelta;
  return delta!==null
    &&receipt.preflightEvidenceSha256===preflightSha
    &&receipt.experimentPlanSha256===preflight.experimentPlanSha256
    &&receipt.trainingSpecSha256===preflight.trainingSpecSha256
    &&receipt.expertId===preflight.expertId
    &&receipt.specialistHypothesis===preflight.specialistHypothesis
    &&receipt.adapterKind===preflight.adapterKind
    &&preflight.denseBaselineContentSha256!=='UNKNOWN'
    &&delta.denseBaselineContentSha256===preflight.denseBaselineContentSha256
    &&preflight.targetModuleSetSha256!=='UNKNOWN'
    &&delta.targetModuleSetSha256===preflight.targetModuleSetSha256
    &&preflight.adapterConfigSha256!=='UNKNOWN'
    &&delta.adapterConfigSha256===preflight.adapterConfigSha256
    &&preflight.reproductionContractSha256!=='UNKNOWN'
    &&delta.reproductionContractSha256===preflight.reproductionContractSha256;
}

function attestationBindsRun(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  receiptSha:string,
  attestation:HsmeAdapterMoeExpertArtifactAttestationV1,
):boolean{
  const delta=receipt.stagedExpertDelta;
  return delta!==null
    &&preflight.license!=='UNKNOWN'
    &&preflight.licenseEvidenceSha256!=='UNKNOWN'
    &&attestation.expertId===receipt.expertId
    &&attestation.trainingRunReceiptSha256===receiptSha
    &&attestation.artifactSha256===delta.artifactSha256
    &&attestation.artifactBytes===delta.artifactBytes
    &&attestation.artifactMetadataSha256===delta.artifactMetadataSha256
    &&attestation.license===preflight.license
    &&attestation.licenseEvidenceSha256===preflight.licenseEvidenceSha256;
}

function isReadyPreflight(
  value:HsmeAdapterMoeExpertTrainingPreflightV1,
):boolean{
  return value.schemaVersion===HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA
    &&value.state==='ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.preflightEvidenceSha256!=='UNKNOWN';
}

function isCompletedReceipt(
  value:HsmeAdapterMoeExpertTrainingRunReceiptV1,
):boolean{
  return value.schemaVersion===HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA
    &&value.state==='EXPERT_TRAINING_RUN_COMPLETED_DELTA_STAGED_NOT_PACKED'
    &&value.blockers.length===0
    &&value.receiptEvidenceSha256!=='UNKNOWN'
    &&value.stagedExpertDelta!==null;
}

type PartialOutput=Partial<Pick<
  HsmeAdapterMoeExpertRealRunEvidenceV1,
  'preflightEvidenceSha256'|'trainingRunReceiptSha256'
  |'artifactAttestationSha256'|'experimentPlanSha256'|'trainingSpecSha256'
  |'expertId'|'workspaceFreezeReceiptSha256'|'workspaceSha256'
  |'executionAttemptId'|'consumedTrainingExamples'|'consumedGpuSeconds'
  |'consumedTrainingCostMicrousd'
>>;

function valuesFromRun(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  preflightSha:string,
  receiptSha:string,
):PartialOutput{
  return {
    preflightEvidenceSha256:preflightSha,
    trainingRunReceiptSha256:receiptSha,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
    workspaceFreezeReceiptSha256:receipt.workspaceFreezeReceiptSha256,
    workspaceSha256:receipt.workspaceSha256,
    executionAttemptId:receipt.executionAttemptId,
    consumedTrainingExamples:receipt.consumedTrainingExamples,
    consumedGpuSeconds:receipt.consumedGpuSeconds,
    consumedTrainingCostMicrousd:receipt.consumedTrainingCostMicrousd,
  };
}

async function evidence(
  state:
    |'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID'
    |'ADAPTER_MOE_EXPERT_REAL_RUN_BLOCKED'
    |'ADAPTER_MOE_EXPERT_REAL_RUN_READY_NOT_PACKED',
  blockers:readonly string[],
  values:PartialOutput,
  realProtectedExecution:boolean,
  manifest:HsmeAdapterMoeExpertDeltaManifestV1|null,
  manifestSha256:string|'UNKNOWN',
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertRealRunEvidenceV1>{
  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    preflightEvidenceSha256:values.preflightEvidenceSha256??'UNKNOWN',
    trainingRunReceiptSha256:values.trainingRunReceiptSha256??'UNKNOWN',
    artifactAttestationSha256:values.artifactAttestationSha256??'UNKNOWN',
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    trainingSpecSha256:values.trainingSpecSha256??'UNKNOWN',
    expertId:values.expertId??'UNKNOWN',
    workspaceFreezeReceiptSha256:
      values.workspaceFreezeReceiptSha256??'UNKNOWN',
    workspaceSha256:values.workspaceSha256??'UNKNOWN',
    executionAttemptId:values.executionAttemptId??'UNKNOWN',
    consumedTrainingExamples:values.consumedTrainingExamples??'UNKNOWN',
    consumedGpuSeconds:values.consumedGpuSeconds??'UNKNOWN',
    consumedTrainingCostMicrousd:
      values.consumedTrainingCostMicrousd??'UNKNOWN',
    realProtectedExecution,
    manifest,
    manifestSha256,
    ...authorityBoundary(),
  };
  const evidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,evidenceSha256});
}

function manifestAuthorityBoundary(){
  return Object.freeze({
    standaloneExecutionAllowed:false as const,
    trainingExecutionAllowed:false as const,
    prototypeAssemblyAllowed:false as const,
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

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail('hsme_adapter_moe_real_authority',path+'.'+field+' must remain false');
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
    expertPackAdmissionAllowed:false as const,
    prototypeAssemblyAllowed:false as const,
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
    fail('hsme_adapter_moe_real_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_real_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_real_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_real_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_real_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_real_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_real_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_adapter_moe_real_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_adapter_moe_real_hash','hash port must return lowercase SHA-256');
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function lexical(left:string,right:string):number{
  return left<right?-1:left>right?1:0;
}

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
  throw new HsmeAdapterMoeExpertRealRunEvidenceV1Error(code,message);
}

import {
  HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
  type HsmeDenseStudentLaunchSpecV1,
  type HsmeDenseStudentTrainingHashPortV1,
  type HsmeDenseStudentTrainingPreflightV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
  hsmeDenseStudentTrainingRunReceiptV1Digest,
  type HsmeDenseStudentTrainingRunReceiptV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  HSME_PACK_V1_SCHEMA,
  hsmePackDescriptorV1Digest,
  normalizeHsmePackDescriptorV1,
  type HsmePackDescriptorV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmePackV1.ts';

export const CORE_HSME_DENSE_STUDENT_REPRESENTATION_REQUEST_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_REPRESENTATION_REQUEST_V1' as const;
export const CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1' as const;
export const HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1' as const;

export const CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:dense-student-representation-result:v1\0' as const;
export const HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:dense-student-representation-evidence:v1\0' as const;

export const HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1 =
  'BERS_DENSE_STUDENT_SAFETENSORS_BUNDLE_V1' as const;
export const HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1 =
  '1' as const;
export const HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1 =
  'BF16' as const;

const HEX64=/^[0-9a-f]{64}$/;
const COMMIT40=/^[0-9a-f]{40}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeDenseStudentRepresentationExportSpecV1=Readonly<{
  format:typeof HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1;
  formatVersion:typeof HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1;
  precision:typeof HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1;
  architectureFamily:'COMPACT_DIT';
  checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY';
}>;

export type CoreHsmeDenseStudentRepresentationRequestV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_STUDENT_REPRESENTATION_REQUEST_V1_SCHEMA;
  receiptEvidenceSha256:string;
  preflightEvidenceSha256:string;
  launchSpecSha256:string;
  candidateId:string;
  activeParametersMillions:number;
  targetStepCount:number;
  repositoryCommitSha:string;
  immutableEnvironmentSha256:string;
  checkpointSha256:string;
  checkpointBytes:number;
  checkpointMetadataSha256:string;
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
  exportSpec:HsmeDenseStudentRepresentationExportSpecV1;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
}>;

export type HsmeDenseStudentRepresentationComponentsV1=Readonly<{
  modelConfigSha256:string;
  tokenizerSha256:string|'NONE';
  textConditionerSha256:string|'NONE';
  imageEncoderSha256:string|'NONE';
  vaeSha256:string|'NONE';
  schedulerConfigSha256:string;
}>;

export type HsmeDenseStudentRepresentationResourceEvidenceV1=Readonly<{
  peakMemoryBytes:number;
  maxResidentBytes:number;
  maxPrefetchBytes:number;
  resourceEvidenceSha256:string;
}>;

export type CoreHsmeDenseStudentRepresentationArtifactV1=Readonly<{
  representationArtifactSha256:string;
  representationBytes:number;
  representationMetadataSha256:string;
  components:HsmeDenseStudentRepresentationComponentsV1;
  exportToolchainSha256:string;
  resourceEvidence:HsmeDenseStudentRepresentationResourceEvidenceV1|null;
}>;

export type CoreHsmeDenseStudentRepresentationResultStateV1=
  | 'REPRESENTATION_EXPORT_ATTEMPT_FAILED'
  | 'REPRESENTATION_EXPORT_ATTEMPT_COMPLETED';

export type CoreHsmeDenseStudentRepresentationResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1_SCHEMA;
  state:CoreHsmeDenseStudentRepresentationResultStateV1;
  receiptEvidenceSha256:string;
  preflightEvidenceSha256:string;
  launchSpecSha256:string;
  checkpointSha256:string;
  checkpointMetadataSha256:string;
  exportAttemptId:string;
  exportSpec:HsmeDenseStudentRepresentationExportSpecV1;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  stdoutEvidenceSha256:string;
  stderrEvidenceSha256:string;
  artifact:CoreHsmeDenseStudentRepresentationArtifactV1|null;
  exporterResultSha256:string;
}>;

export interface CoreHsmeDenseStudentRepresentationPortV1{
  exportExactDenseStudentRepresentation(
    request:CoreHsmeDenseStudentRepresentationRequestV1,
  ):Promise<unknown>;
}

export interface CoreHsmeDenseStudentRepresentationResultOriginVerifierV1{
  verifyRepresentationResult(
    result:CoreHsmeDenseStudentRepresentationResultV1,
    expectedExporterResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentPackCandidateStateV1=
  | 'PACK_CANDIDATE_UNAVAILABLE'
  | 'PACK_CANDIDATE_BLOCKED_RESOURCE_EVIDENCE_REQUIRED'
  | 'PACK_CANDIDATE_READY_NOT_ADMITTED';

export type HsmeDenseStudentRepresentationStateV1=
  | 'REPRESENTATION_INVALID'
  | 'REPRESENTATION_BLOCKED'
  | 'REPRESENTATION_EXPORT_FAILED'
  | 'REPRESENTATION_READY_NOT_ADMITTED';

export type HsmeDenseStudentRepresentationEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA;
  state:HsmeDenseStudentRepresentationStateV1;
  blockers:readonly string[];
  receiptEvidenceSha256:string|'UNKNOWN';
  preflightEvidenceSha256:string|'UNKNOWN';
  launchSpecSha256:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  architectureFamily:'COMPACT_DIT'|'UNKNOWN';
  activeParametersMillions:number|'UNKNOWN';
  targetStepCount:number|'UNKNOWN';
  repositoryCommitSha:string|'UNKNOWN';
  immutableEnvironmentSha256:string|'UNKNOWN';
  stagedCheckpointSha256:string|'UNKNOWN';
  stagedCheckpointBytes:number|'UNKNOWN';
  checkpointMetadataSha256:string|'UNKNOWN';
  teacherDecisionSha256:string|'UNKNOWN';
  reproductionEvidenceSha256:string|'UNKNOWN';
  corpusRootDigest:string|'UNKNOWN';
  recipeDigest:string|'UNKNOWN';
  inputCheckpointSha256:string|'UNKNOWN';
  resumeCheckpointSha256:string|'NONE'|'UNKNOWN';
  exportAttemptId:string|'UNKNOWN';
  exportSpec:HsmeDenseStudentRepresentationExportSpecV1|null;
  representationArtifactSha256:string|'UNKNOWN';
  representationBytes:number|'UNKNOWN';
  representationMetadataSha256:string|'UNKNOWN';
  components:HsmeDenseStudentRepresentationComponentsV1|null;
  exportToolchainSha256:string|'UNKNOWN';
  resourceEvidence:HsmeDenseStudentRepresentationResourceEvidenceV1|null;
  exporterResultSha256:string|'UNKNOWN';
  packCandidateState:HsmeDenseStudentPackCandidateStateV1;
  packDescriptor:HsmePackDescriptorV1|null;
  packDescriptorSha256:string|'UNKNOWN';
  evidenceSha256:string|'UNKNOWN';
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

export class HsmeDenseStudentRepresentationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentRepresentationV1Error';
    this.code=code;
  }
}

export async function representHsmeDenseStudentCheckpointV1(
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  preflight:HsmeDenseStudentTrainingPreflightV1,
  exporter:CoreHsmeDenseStudentRepresentationPortV1,
  resultOrigin:CoreHsmeDenseStudentRepresentationResultOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentRepresentationEvidenceV1>{
  if(
    !receipt
    ||receipt.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA
  ){
    return invalid(['REPRESENTATION_RECEIPT_SCHEMA_INVALID']);
  }
  if(
    receipt.state!=='TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED'
  ){
    return blocked(['REPRESENTATION_COMPLETED_RECEIPT_REQUIRED'],{
      receiptEvidenceSha256:valueOrUnknown(receipt.receiptEvidenceSha256),
      preflightEvidenceSha256:valueOrUnknown(receipt.preflightEvidenceSha256),
      launchSpecSha256:valueOrUnknown(receipt.launchSpecSha256),
    });
  }
  if(
    !preflight
    ||preflight.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA
    ||preflight.state!=='TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    ||preflight.launchSpec===null
  ){
    return invalid(['REPRESENTATION_PREFLIGHT_READY_REQUIRED'],{
      receiptEvidenceSha256:valueOrUnknown(receipt.receiptEvidenceSha256),
    });
  }

  const launch=preflight.launchSpec;
  const invalidBlockers:string[]=[];
  if(receipt.blockers.length!==0){
    invalidBlockers.push('REPRESENTATION_RECEIPT_BLOCKERS_PRESENT');
  }
  if(preflight.blockers.length!==0){
    invalidBlockers.push('REPRESENTATION_PREFLIGHT_BLOCKERS_PRESENT');
  }
  if(receiptAuthorityWidened(receipt)){
    invalidBlockers.push('REPRESENTATION_RECEIPT_AUTHORITY_WIDENING');
  }
  if(preflightAuthorityWidened(preflight)||launchAuthorityWidened(launch)){
    invalidBlockers.push('REPRESENTATION_PREFLIGHT_AUTHORITY_WIDENING');
  }

  let receiptEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let preflightEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let launchSpecSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    receiptEvidenceSha256=await hsmeDenseStudentTrainingRunReceiptV1Digest(
      receipt,
      hash,
    );
    if(receiptEvidenceSha256!==receipt.receiptEvidenceSha256){
      invalidBlockers.push('REPRESENTATION_RECEIPT_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('REPRESENTATION_RECEIPT_REHASH_INVALID');
  }
  try{
    preflightEvidenceSha256=await hsmeDenseStudentTrainingPreflightV1Digest(
      preflight,
      hash,
    );
    if(preflightEvidenceSha256!==preflight.preflightEvidenceSha256){
      invalidBlockers.push('REPRESENTATION_PREFLIGHT_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('REPRESENTATION_PREFLIGHT_REHASH_INVALID');
  }
  try{
    launchSpecSha256=await hsmeDenseStudentLaunchSpecV1Digest(launch,hash);
    if(
      launchSpecSha256!==launch.launchSpecSha256
      ||launchSpecSha256!==preflight.launchSpecSha256
    ){
      invalidBlockers.push('REPRESENTATION_LAUNCH_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('REPRESENTATION_LAUNCH_REHASH_INVALID');
  }

  validateReceiptPreflightBinding(receipt,preflight,launch,invalidBlockers);

  const common=valuesFromSource(receipt,launch,{
    receiptEvidenceSha256,
    preflightEvidenceSha256,
    launchSpecSha256,
  });

  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,common);
  }

  const request=buildRepresentationRequest(
    receipt,
    launch,
    receiptEvidenceSha256 as string,
    preflightEvidenceSha256 as string,
    launchSpecSha256 as string,
  );

  let rawResult:unknown;
  try{
    rawResult=await exporter.exportExactDenseStudentRepresentation(request);
  }catch{
    return exportFailed(['REPRESENTATION_PROTECTED_EXPORTER_FAILED'],common);
  }

  let result:CoreHsmeDenseStudentRepresentationResultV1;
  try{
    result=normalizeRepresentationResult(rawResult);
  }catch(error){
    return invalid([
      'REPRESENTATION_EXPORT_RESULT_INVALID'+errorCodeSuffix(error),
    ],common);
  }

  let exporterResultSha256:string;
  try{
    exporterResultSha256=await coreHsmeDenseStudentRepresentationResultV1Digest(
      result,
      hash,
    );
  }catch{
    return invalid(['REPRESENTATION_EXPORT_RESULT_REHASH_INVALID'],{
      ...common,
      ...valuesFromResult(result),
    });
  }
  if(exporterResultSha256!==result.exporterResultSha256){
    return invalid(['REPRESENTATION_EXPORT_RESULT_REHASH_MISMATCH'],{
      ...common,
      ...valuesFromResult(result),
    });
  }
  if(!await verify(
    ()=>resultOrigin.verifyRepresentationResult(result,exporterResultSha256),
  )){
    return invalid(['REPRESENTATION_EXPORT_RESULT_ORIGIN_UNVERIFIED'],{
      ...common,
      ...valuesFromResult(result),
    });
  }

  const resultBlockers:string[]=[];
  validateResultBinding(result,request,resultBlockers);
  if(resultBlockers.length>0){
    return invalid(resultBlockers,{
      ...common,
      ...valuesFromResult(result),
    });
  }

  if(result.state==='REPRESENTATION_EXPORT_ATTEMPT_FAILED'){
    if(result.artifact!==null){
      return invalid(['REPRESENTATION_FAILED_EXPORT_ARTIFACT_FORBIDDEN'],{
        ...common,
        ...valuesFromResult(result),
      });
    }
    return exportFailed(['REPRESENTATION_EXPORT_ATTEMPT_FAILED'],{
      ...common,
      ...valuesFromResult(result),
    });
  }

  if(result.artifact===null){
    return exportFailed(['REPRESENTATION_EXPORT_ARTIFACT_MISSING'],{
      ...common,
      ...valuesFromResult(result),
    });
  }

  const artifact=result.artifact;
  let packCandidateState:HsmeDenseStudentPackCandidateStateV1=
    'PACK_CANDIDATE_BLOCKED_RESOURCE_EVIDENCE_REQUIRED';
  let packDescriptor:HsmePackDescriptorV1|null=null;
  let packDescriptorSha256:string|'UNKNOWN'='UNKNOWN';

  if(artifact.resourceEvidence!==null){
    try{
      packDescriptor=buildPackDescriptorCandidate(
        launch,
        artifact,
      );
      packDescriptorSha256=await hsmePackDescriptorV1Digest(
        packDescriptor,
        hash,
      );
      packCandidateState='PACK_CANDIDATE_READY_NOT_ADMITTED';
    }catch(error){
      return invalid([
        'REPRESENTATION_PACK_CANDIDATE_INVALID'+errorCodeSuffix(error),
      ],{
        ...common,
        ...valuesFromResult(result),
      });
    }
  }

  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
    state:'REPRESENTATION_READY_NOT_ADMITTED' as const,
    blockers:Object.freeze([]) as readonly string[],
    ...common,
    ...valuesFromResult(result),
    packCandidateState,
    packDescriptor,
    packDescriptorSha256,
    ...authorityBoundary(),
  };

  const evidenceSha256=await digest(
    HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_DIGEST_DOMAIN,
    readyPayload,
    hash,
  );
  return deepFreeze({
    ...readyPayload,
    evidenceSha256,
  });
}

export async function coreHsmeDenseStudentRepresentationResultV1Digest(
  raw:CoreHsmeDenseStudentRepresentationResultV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=normalizeRepresentationResult(raw);
  return digest(
    CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_DIGEST_DOMAIN,
    representationResultPayload(result),
    hash,
  );
}

function buildRepresentationRequest(
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  launch:HsmeDenseStudentLaunchSpecV1,
  receiptEvidenceSha256:string,
  preflightEvidenceSha256:string,
  launchSpecSha256:string,
):CoreHsmeDenseStudentRepresentationRequestV1{
  if(
    receipt.stagedCheckpointSha256==='UNKNOWN'
    ||receipt.stagedCheckpointBytes==='UNKNOWN'
    ||receipt.checkpointMetadataSha256==='UNKNOWN'
  ){
    fail(
      'hsme_representation_checkpoint_unresolved',
      'completed receipt checkpoint identity must be resolved',
    );
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_REPRESENTATION_REQUEST_V1_SCHEMA,
    receiptEvidenceSha256,
    preflightEvidenceSha256,
    launchSpecSha256,
    candidateId:launch.candidateId,
    activeParametersMillions:launch.activeParametersMillions,
    targetStepCount:launch.targetStepCount,
    repositoryCommitSha:launch.repositoryCommitSha,
    immutableEnvironmentSha256:launch.immutableEnvironmentSha256,
    checkpointSha256:receipt.stagedCheckpointSha256,
    checkpointBytes:receipt.stagedCheckpointBytes,
    checkpointMetadataSha256:receipt.checkpointMetadataSha256,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    exportSpec:fixedExportSpec(),
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  });
}

function fixedExportSpec():HsmeDenseStudentRepresentationExportSpecV1{
  return Object.freeze({
    format:HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1,
    formatVersion:HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1,
    precision:HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1,
    architectureFamily:'COMPACT_DIT',
    checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
  });
}

function normalizeRepresentationResult(
  raw:unknown,
):CoreHsmeDenseStudentRepresentationResultV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'state',
    'receiptEvidenceSha256',
    'preflightEvidenceSha256',
    'launchSpecSha256',
    'checkpointSha256',
    'checkpointMetadataSha256',
    'exportAttemptId',
    'exportSpec',
    'networkPolicy',
    'cacheModelInputPolicy',
    'stdoutEvidenceSha256',
    'stderrEvidenceSha256',
    'artifact',
    'exporterResultSha256',
  ],'representationResult');

  if(record.schemaVersion!==CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1_SCHEMA){
    fail('hsme_representation_result_schema','representation result schema unsupported');
  }
  const state=enumValue(
    record.state,
    [
      'REPRESENTATION_EXPORT_ATTEMPT_FAILED',
      'REPRESENTATION_EXPORT_ATTEMPT_COMPLETED',
    ] as const,
    'representationResult.state',
  );
  const exportSpec=normalizeExportSpec(record.exportSpec);
  const artifact=record.artifact===null
    ?null
    :normalizeArtifact(record.artifact);

  return deepFreeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1_SCHEMA,
    state,
    receiptEvidenceSha256:sha256(
      record.receiptEvidenceSha256,
      'representationResult.receiptEvidenceSha256',
    ),
    preflightEvidenceSha256:sha256(
      record.preflightEvidenceSha256,
      'representationResult.preflightEvidenceSha256',
    ),
    launchSpecSha256:sha256(
      record.launchSpecSha256,
      'representationResult.launchSpecSha256',
    ),
    checkpointSha256:sha256(
      record.checkpointSha256,
      'representationResult.checkpointSha256',
    ),
    checkpointMetadataSha256:sha256(
      record.checkpointMetadataSha256,
      'representationResult.checkpointMetadataSha256',
    ),
    exportAttemptId:identifier(
      record.exportAttemptId,
      'representationResult.exportAttemptId',
      200,
    ),
    exportSpec,
    networkPolicy:exactLiteral(
      record.networkPolicy,
      'SEALED_INPUTS_ONLY',
      'representationResult.networkPolicy',
    ),
    cacheModelInputPolicy:exactLiteral(
      record.cacheModelInputPolicy,
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
      'representationResult.cacheModelInputPolicy',
    ),
    stdoutEvidenceSha256:sha256(
      record.stdoutEvidenceSha256,
      'representationResult.stdoutEvidenceSha256',
    ),
    stderrEvidenceSha256:sha256(
      record.stderrEvidenceSha256,
      'representationResult.stderrEvidenceSha256',
    ),
    artifact,
    exporterResultSha256:sha256(
      record.exporterResultSha256,
      'representationResult.exporterResultSha256',
    ),
  });
}

function normalizeExportSpec(raw:unknown):HsmeDenseStudentRepresentationExportSpecV1{
  const record=exactRecord(raw,[
    'format',
    'formatVersion',
    'precision',
    'architectureFamily',
    'checkpointSerializationPolicy',
  ],'exportSpec');
  return Object.freeze({
    format:exactLiteral(
      record.format,
      HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1,
      'exportSpec.format',
    ),
    formatVersion:exactLiteral(
      record.formatVersion,
      HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1,
      'exportSpec.formatVersion',
    ),
    precision:exactLiteral(
      record.precision,
      HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1,
      'exportSpec.precision',
    ),
    architectureFamily:exactLiteral(
      record.architectureFamily,
      'COMPACT_DIT',
      'exportSpec.architectureFamily',
    ),
    checkpointSerializationPolicy:exactLiteral(
      record.checkpointSerializationPolicy,
      'SAFETENSORS_ATOMIC_STAGING_ONLY',
      'exportSpec.checkpointSerializationPolicy',
    ),
  });
}

function normalizeArtifact(raw:unknown):CoreHsmeDenseStudentRepresentationArtifactV1{
  const record=exactRecord(raw,[
    'representationArtifactSha256',
    'representationBytes',
    'representationMetadataSha256',
    'components',
    'exportToolchainSha256',
    'resourceEvidence',
  ],'representationResult.artifact');
  const componentRecord=exactRecord(record.components,[
    'modelConfigSha256',
    'tokenizerSha256',
    'textConditionerSha256',
    'imageEncoderSha256',
    'vaeSha256',
    'schedulerConfigSha256',
  ],'representationResult.artifact.components');
  const components=Object.freeze({
    modelConfigSha256:sha256(
      componentRecord.modelConfigSha256,
      'representationResult.artifact.components.modelConfigSha256',
    ),
    tokenizerSha256:shaOrNone(
      componentRecord.tokenizerSha256,
      'representationResult.artifact.components.tokenizerSha256',
    ),
    textConditionerSha256:shaOrNone(
      componentRecord.textConditionerSha256,
      'representationResult.artifact.components.textConditionerSha256',
    ),
    imageEncoderSha256:shaOrNone(
      componentRecord.imageEncoderSha256,
      'representationResult.artifact.components.imageEncoderSha256',
    ),
    vaeSha256:shaOrNone(
      componentRecord.vaeSha256,
      'representationResult.artifact.components.vaeSha256',
    ),
    schedulerConfigSha256:sha256(
      componentRecord.schedulerConfigSha256,
      'representationResult.artifact.components.schedulerConfigSha256',
    ),
  });

  const resourceEvidence=record.resourceEvidence===null
    ?null
    :normalizeResourceEvidence(record.resourceEvidence);

  return Object.freeze({
    representationArtifactSha256:sha256(
      record.representationArtifactSha256,
      'representationResult.artifact.representationArtifactSha256',
    ),
    representationBytes:safeInteger(
      record.representationBytes,
      'representationResult.artifact.representationBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    representationMetadataSha256:sha256(
      record.representationMetadataSha256,
      'representationResult.artifact.representationMetadataSha256',
    ),
    components,
    exportToolchainSha256:sha256(
      record.exportToolchainSha256,
      'representationResult.artifact.exportToolchainSha256',
    ),
    resourceEvidence,
  });
}

function normalizeResourceEvidence(
  raw:unknown,
):HsmeDenseStudentRepresentationResourceEvidenceV1{
  const record=exactRecord(raw,[
    'peakMemoryBytes',
    'maxResidentBytes',
    'maxPrefetchBytes',
    'resourceEvidenceSha256',
  ],'representationResult.artifact.resourceEvidence');
  const peakMemoryBytes=safeInteger(
    record.peakMemoryBytes,
    'resourceEvidence.peakMemoryBytes',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maxResidentBytes=safeInteger(
    record.maxResidentBytes,
    'resourceEvidence.maxResidentBytes',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maxPrefetchBytes=safeInteger(
    record.maxPrefetchBytes,
    'resourceEvidence.maxPrefetchBytes',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if(maxResidentBytes>peakMemoryBytes||maxPrefetchBytes>peakMemoryBytes){
    fail(
      'hsme_representation_resource_bounds',
      'resident/prefetch budgets cannot exceed peak memory',
    );
  }
  return Object.freeze({
    peakMemoryBytes,
    maxResidentBytes,
    maxPrefetchBytes,
    resourceEvidenceSha256:sha256(
      record.resourceEvidenceSha256,
      'resourceEvidence.resourceEvidenceSha256',
    ),
  });
}

function representationResultPayload(
  value:CoreHsmeDenseStudentRepresentationResultV1,
):Omit<CoreHsmeDenseStudentRepresentationResultV1,'exporterResultSha256'>{
  return {
    schemaVersion:value.schemaVersion,
    state:value.state,
    receiptEvidenceSha256:value.receiptEvidenceSha256,
    preflightEvidenceSha256:value.preflightEvidenceSha256,
    launchSpecSha256:value.launchSpecSha256,
    checkpointSha256:value.checkpointSha256,
    checkpointMetadataSha256:value.checkpointMetadataSha256,
    exportAttemptId:value.exportAttemptId,
    exportSpec:value.exportSpec,
    networkPolicy:value.networkPolicy,
    cacheModelInputPolicy:value.cacheModelInputPolicy,
    stdoutEvidenceSha256:value.stdoutEvidenceSha256,
    stderrEvidenceSha256:value.stderrEvidenceSha256,
    artifact:value.artifact,
  };
}

function validateReceiptPreflightBinding(
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  preflight:HsmeDenseStudentTrainingPreflightV1,
  launch:HsmeDenseStudentLaunchSpecV1,
  blockers:string[],
):void{
  if(receipt.preflightEvidenceSha256!==preflight.preflightEvidenceSha256){
    blockers.push('REPRESENTATION_RECEIPT_PREFLIGHT_BINDING_MISMATCH');
  }
  if(
    receipt.launchSpecSha256!==preflight.launchSpecSha256
    ||receipt.launchSpecSha256!==launch.launchSpecSha256
  ){
    blockers.push('REPRESENTATION_RECEIPT_LAUNCH_BINDING_MISMATCH');
  }
  if(receipt.requestEvidenceSha256!==preflight.requestEvidenceSha256){
    blockers.push('REPRESENTATION_RECEIPT_REQUEST_BINDING_MISMATCH');
  }
  if(receipt.admissionEvidenceSha256!==preflight.admissionEvidenceSha256){
    blockers.push('REPRESENTATION_RECEIPT_ADMISSION_BINDING_MISMATCH');
  }
  if(receipt.toolchainManifestSha256!==preflight.toolchainManifestSha256){
    blockers.push('REPRESENTATION_RECEIPT_TOOLCHAIN_BINDING_MISMATCH');
  }
  if(receipt.backend===null||!sameBackend(receipt.backend,launch.backend)){
    blockers.push('REPRESENTATION_RECEIPT_BACKEND_BINDING_MISMATCH');
  }
  if(receipt.outputStagingAuthorityId!==launch.outputStagingAuthorityId){
    blockers.push('REPRESENTATION_RECEIPT_STAGING_AUTHORITY_MISMATCH');
  }
  if(receipt.outputStagingPolicySha256!==launch.outputStagingPolicySha256){
    blockers.push('REPRESENTATION_RECEIPT_STAGING_POLICY_MISMATCH');
  }
  if(receipt.teacherDecisionSha256!==launch.teacherDecisionSha256){
    blockers.push('REPRESENTATION_RECEIPT_TEACHER_LINEAGE_MISMATCH');
  }
  if(receipt.reproductionEvidenceSha256!==launch.reproductionEvidenceSha256){
    blockers.push('REPRESENTATION_RECEIPT_REPRODUCTION_LINEAGE_MISMATCH');
  }
  if(receipt.corpusRootDigest!==launch.corpusRootDigest){
    blockers.push('REPRESENTATION_RECEIPT_CORPUS_LINEAGE_MISMATCH');
  }
  if(receipt.recipeDigest!==launch.recipeDigest){
    blockers.push('REPRESENTATION_RECEIPT_RECIPE_LINEAGE_MISMATCH');
  }
  if(receipt.inputCheckpointSha256!==launch.checkpointSha256){
    blockers.push('REPRESENTATION_RECEIPT_INPUT_CHECKPOINT_MISMATCH');
  }
  if(receipt.resumeCheckpointSha256!==launch.resumeCheckpointSha256){
    blockers.push('REPRESENTATION_RECEIPT_RESUME_CHECKPOINT_MISMATCH');
  }
  if(
    receipt.stagedCheckpointSha256==='UNKNOWN'
    ||receipt.stagedCheckpointBytes==='UNKNOWN'
    ||receipt.checkpointMetadataSha256==='UNKNOWN'
    ||receipt.runnerResultSha256==='UNKNOWN'
  ){
    blockers.push('REPRESENTATION_RECEIPT_CHECKPOINT_EVIDENCE_INCOMPLETE');
  }
}

function validateResultBinding(
  result:CoreHsmeDenseStudentRepresentationResultV1,
  request:CoreHsmeDenseStudentRepresentationRequestV1,
  blockers:string[],
):void{
  if(result.receiptEvidenceSha256!==request.receiptEvidenceSha256){
    blockers.push('REPRESENTATION_RESULT_RECEIPT_BINDING_MISMATCH');
  }
  if(result.preflightEvidenceSha256!==request.preflightEvidenceSha256){
    blockers.push('REPRESENTATION_RESULT_PREFLIGHT_BINDING_MISMATCH');
  }
  if(result.launchSpecSha256!==request.launchSpecSha256){
    blockers.push('REPRESENTATION_RESULT_LAUNCH_BINDING_MISMATCH');
  }
  if(result.checkpointSha256!==request.checkpointSha256){
    blockers.push('REPRESENTATION_RESULT_CHECKPOINT_BINDING_MISMATCH');
  }
  if(result.checkpointMetadataSha256!==request.checkpointMetadataSha256){
    blockers.push('REPRESENTATION_RESULT_CHECKPOINT_METADATA_MISMATCH');
  }
  if(!sameExportSpec(result.exportSpec,request.exportSpec)){
    blockers.push('REPRESENTATION_RESULT_EXPORT_SPEC_MISMATCH');
  }
  if(
    result.networkPolicy!==request.networkPolicy
    ||result.cacheModelInputPolicy!==request.cacheModelInputPolicy
  ){
    blockers.push('REPRESENTATION_RESULT_SEALED_INPUT_POLICY_MISMATCH');
  }
}

function buildPackDescriptorCandidate(
  launch:HsmeDenseStudentLaunchSpecV1,
  artifact:CoreHsmeDenseStudentRepresentationArtifactV1,
):HsmePackDescriptorV1{
  if(artifact.resourceEvidence===null){
    fail(
      'hsme_representation_pack_resource_missing',
      'pack candidate requires measured resource evidence',
    );
  }
  const suffix=artifact.representationArtifactSha256.slice(0,16);
  const modelId='hsme-rd-'+launch.candidateId;
  const version='rep-'+suffix;
  return normalizeHsmePackDescriptorV1({
    schemaVersion:HSME_PACK_V1_SCHEMA,
    packId:modelId,
    packVersion:version,
    capabilities:['RND_DENSE_STUDENT_REPRESENTATION'],
    roots:[{
      role:'BASE',
      modelId,
      version,
      sha256:artifact.representationArtifactSha256,
    }],
    routing:{
      mode:'SHARED_ONLY',
      maxActiveExperts:0,
    },
    resources:{
      peakMemoryBytes:artifact.resourceEvidence.peakMemoryBytes,
      maxResidentBytes:artifact.resourceEvidence.maxResidentBytes,
      maxPrefetchBytes:artifact.resourceEvidence.maxPrefetchBytes,
    },
  });
}

function valuesFromSource(
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  launch:HsmeDenseStudentLaunchSpecV1,
  digests:{
    receiptEvidenceSha256:string|'UNKNOWN';
    preflightEvidenceSha256:string|'UNKNOWN';
    launchSpecSha256:string|'UNKNOWN';
  },
):PartialEvidenceValues{
  return {
    receiptEvidenceSha256:digests.receiptEvidenceSha256,
    preflightEvidenceSha256:digests.preflightEvidenceSha256,
    launchSpecSha256:digests.launchSpecSha256,
    candidateId:launch.candidateId,
    architectureFamily:'COMPACT_DIT',
    activeParametersMillions:launch.activeParametersMillions,
    targetStepCount:launch.targetStepCount,
    repositoryCommitSha:launch.repositoryCommitSha,
    immutableEnvironmentSha256:launch.immutableEnvironmentSha256,
    stagedCheckpointSha256:valueOrUnknown(receipt.stagedCheckpointSha256),
    stagedCheckpointBytes:receipt.stagedCheckpointBytes,
    checkpointMetadataSha256:valueOrUnknown(receipt.checkpointMetadataSha256),
    teacherDecisionSha256:launch.teacherDecisionSha256,
    reproductionEvidenceSha256:launch.reproductionEvidenceSha256,
    corpusRootDigest:launch.corpusRootDigest,
    recipeDigest:launch.recipeDigest,
    inputCheckpointSha256:launch.checkpointSha256,
    resumeCheckpointSha256:launch.resumeCheckpointSha256,
    exportSpec:fixedExportSpec(),
  };
}

function valuesFromResult(
  result:CoreHsmeDenseStudentRepresentationResultV1,
):PartialEvidenceValues{
  return {
    exportAttemptId:result.exportAttemptId,
    exportSpec:result.exportSpec,
    exporterResultSha256:result.exporterResultSha256,
    ...(result.artifact?{
      representationArtifactSha256:result.artifact.representationArtifactSha256,
      representationBytes:result.artifact.representationBytes,
      representationMetadataSha256:result.artifact.representationMetadataSha256,
      components:result.artifact.components,
      exportToolchainSha256:result.artifact.exportToolchainSha256,
      resourceEvidence:result.artifact.resourceEvidence,
    }:{}),
  };
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

function preflightAuthorityWidened(
  value:HsmeDenseStudentTrainingPreflightV1,
):boolean{
  return value.processSpawned!==false
    ||value.trainingStarted!==false
    ||value.checkpointWritten!==false
    ||value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.winnerSelectionAllowed!==false;
}

function launchAuthorityWidened(value:HsmeDenseStudentLaunchSpecV1):boolean{
  return value.processSpawned!==false
    ||value.trainingStarted!==false
    ||value.checkpointWritten!==false
    ||value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
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

type PartialEvidenceValues=Partial<Omit<
  HsmeDenseStudentRepresentationEvidenceV1,
  'schemaVersion'|'state'|'blockers'|'evidenceSha256'|
  'checkpointPromotionAllowed'|'modelInstallAllowed'|'modelFleetPromotionAllowed'|
  'durableModelFleetPromotionAllowed'|'productionAuthorityGranted'|
  'providerAuthorityGranted'|'billingAuthorityGranted'|
  'projectArtifactMutationAllowed'|'aeeExecutionAuthorityGranted'|
  'winnerSelectionAllowed'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialEvidenceValues={},
):HsmeDenseStudentRepresentationEvidenceV1{
  return terminal('REPRESENTATION_INVALID',blockers,values);
}

function blocked(
  blockers:readonly string[],
  values:PartialEvidenceValues={},
):HsmeDenseStudentRepresentationEvidenceV1{
  return terminal('REPRESENTATION_BLOCKED',blockers,values);
}

function exportFailed(
  blockers:readonly string[],
  values:PartialEvidenceValues={},
):HsmeDenseStudentRepresentationEvidenceV1{
  return terminal('REPRESENTATION_EXPORT_FAILED',blockers,values);
}

function terminal(
  state:'REPRESENTATION_INVALID'|'REPRESENTATION_BLOCKED'|'REPRESENTATION_EXPORT_FAILED',
  blockers:readonly string[],
  values:PartialEvidenceValues,
):HsmeDenseStudentRepresentationEvidenceV1{
  return Object.freeze({
    schemaVersion:HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    receiptEvidenceSha256:values.receiptEvidenceSha256??'UNKNOWN',
    preflightEvidenceSha256:values.preflightEvidenceSha256??'UNKNOWN',
    launchSpecSha256:values.launchSpecSha256??'UNKNOWN',
    candidateId:values.candidateId??'UNKNOWN',
    architectureFamily:values.architectureFamily??'UNKNOWN',
    activeParametersMillions:values.activeParametersMillions??'UNKNOWN',
    targetStepCount:values.targetStepCount??'UNKNOWN',
    repositoryCommitSha256:
      undefined as never,
    repositoryCommitSha:values.repositoryCommitSha??'UNKNOWN',
    immutableEnvironmentSha256:values.immutableEnvironmentSha256??'UNKNOWN',
    stagedCheckpointSha256:values.stagedCheckpointSha256??'UNKNOWN',
    stagedCheckpointBytes:values.stagedCheckpointBytes??'UNKNOWN',
    checkpointMetadataSha256:values.checkpointMetadataSha256??'UNKNOWN',
    teacherDecisionSha256:values.teacherDecisionSha256??'UNKNOWN',
    reproductionEvidenceSha256:values.reproductionEvidenceSha256??'UNKNOWN',
    corpusRootDigest:values.corpusRootDigest??'UNKNOWN',
    recipeDigest:values.recipeDigest??'UNKNOWN',
    inputCheckpointSha256:values.inputCheckpointSha256??'UNKNOWN',
    resumeCheckpointSha256:values.resumeCheckpointSha256??'UNKNOWN',
    exportAttemptId:values.exportAttemptId??'UNKNOWN',
    exportSpec:values.exportSpec??null,
    representationArtifactSha256:values.representationArtifactSha256??'UNKNOWN',
    representationBytes:values.representationBytes??'UNKNOWN',
    representationMetadataSha256:values.representationMetadataSha256??'UNKNOWN',
    components:values.components??null,
    exportToolchainSha256:values.exportToolchainSha256??'UNKNOWN',
    resourceEvidence:values.resourceEvidence??null,
    exporterResultSha256:values.exporterResultSha256??'UNKNOWN',
    packCandidateState:values.packCandidateState??'PACK_CANDIDATE_UNAVAILABLE',
    packDescriptor:values.packDescriptor??null,
    packDescriptorSha256:values.packDescriptorSha256??'UNKNOWN',
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function sameExportSpec(
  a:HsmeDenseStudentRepresentationExportSpecV1,
  b:HsmeDenseStudentRepresentationExportSpecV1,
):boolean{
  return a.format===b.format
    &&a.formatVersion===b.formatVersion
    &&a.precision===b.precision
    &&a.architectureFamily===b.architectureFamily
    &&a.checkpointSerializationPolicy===b.checkpointSerializationPolicy;
}

function sameBackend(
  a:{backendClass:string;providerId:string;accountId:string;executionEnvironmentId:string},
  b:{backendClass:string;providerId:string;accountId:string;executionEnvironmentId:string},
):boolean{
  return a.backendClass===b.backendClass
    &&a.providerId===b.providerId
    &&a.accountId===b.accountId
    &&a.executionEnvironmentId===b.executionEnvironmentId;
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_representation_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_representation_exact_schema',
      path+' has unknown or missing fields',
    );
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_representation_enum',path+' is unsupported');
  }
  return raw as T[number];
}

function exactLiteral<T extends string>(
  raw:unknown,
  expected:T,
  path:string,
):T{
  if(raw!==expected){
    fail('hsme_representation_literal',path+' must equal '+expected);
  }
  return expected;
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||raw.trim()!==raw
    ||!IDENTIFIER.test(raw)
  ){
    fail('hsme_representation_identifier',path+' is invalid');
  }
  return raw;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_representation_hash',path+' must be lowercase SHA-256');
  }
  return raw;
}

function shaOrNone(raw:unknown,path:string):string|'NONE'{
  return raw==='NONE'?'NONE':sha256(raw,path);
}

function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_representation_integer',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return typeof value==='string'&&HEX64.test(value)?value:'UNKNOWN';
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
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
      'hsme_representation_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

function errorCodeSuffix(error:unknown):string{
  if(error&&typeof error==='object'&&'code' in error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='string'&&code.length>0)return ':'+code;
  }
  return '';
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

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function fail(code:string,message:string):never{
  throw new HsmeDenseStudentRepresentationV1Error(code,message);
}

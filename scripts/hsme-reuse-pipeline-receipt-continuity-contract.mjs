import {
  domainDigest,
} from './plan-hsme-reuse-evidence-pipeline.mjs';

export const HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1';
export const HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-receipt-continuity:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const GIT_OID=/^[0-9a-f]{40,64}$/;
const FIELDS=Object.freeze([
  'schemaVersion',
  'sourceSpecFileSha256',
  'targetSpecFileSha256',
  'pinApplicationSha256',
  'patchCandidateSha256',
  'approvalSha256',
  'receiptSha256',
  'sourceReceiptFileSha256',
  'stageId',
  'stageKind',
  'repositoryCommitSha',
  'stageDefinitionSha256',
  'argvSha256',
  'continuityState',
  'outputTrustState',
  'externalPinCreated',
  'semanticEvidenceAuthorityGranted',
  'decisionMutationAllowed',
  'candidateSelectionAllowed',
  'winnerSelectionAllowed',
  'reuseAdvanceAllowed',
  'fullStudentEscalationAllowed',
  'trainingRunStartAllowed',
  'trainingOrDistillationAllowed',
  'modelInstallAllowed',
  'modelFleetPromotionAllowed',
  'productionAuthorityGranted',
  'providerAuthorityGranted',
  'billingAuthorityGranted',
  'projectArtifactMutationAllowed',
  'aeeExecutionAuthorityGranted',
  'durableModelFleetPromotionAllowed',
  'continuitySha256',
]);

export class HsmeReusePipelineReceiptContinuityContractError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineReceiptContinuityContractError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineReceiptContinuityContractError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_continuity_record_invalid',path+' must be an object');
  }
  return value;
}

function exactRecord(value,allowed,path){
  const record=object(value,path);
  const actual=Object.keys(record).sort();
  const expected=[...allowed].sort();
  if(
    actual.length!==expected.length
    ||actual.some((key,index)=>key!==expected[index])
  ){
    fail('hsme_reuse_continuity_shape_invalid',path+' fields differ from schema');
  }
  return record;
}

function text(value,path,max=8192){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.includes('\u0000')
    ||value.includes('\r')
    ||value.includes('\n')
  ){
    fail('hsme_reuse_continuity_text_invalid',path+' is invalid');
  }
  return value;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_continuity_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

function gitOid(value,path){
  const result=text(value,path,64);
  if(!GIT_OID.test(result)){
    fail('hsme_reuse_continuity_git_oid_invalid',path+' must be git object id');
  }
  return result;
}

function falseValue(value,path){
  if(value!==false){
    fail('hsme_reuse_continuity_authority_invalid',path+' must remain false');
  }
  return false;
}

export function normalizeHsmeReusePipelineReceiptContinuityV1(raw){
  const record=exactRecord(raw,FIELDS,'continuity');
  if(record.schemaVersion!==HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1_SCHEMA){
    fail('hsme_reuse_continuity_schema_invalid','continuity schema invalid');
  }
  if(record.continuityState!=='STAGE_DEFINITION_INVARIANT'){
    fail('hsme_reuse_continuity_state_invalid','continuity state invalid');
  }
  if(record.outputTrustState!=='OBSERVED_NOT_PIN_AUTHORITY'){
    fail('hsme_reuse_continuity_output_trust_invalid','output trust state invalid');
  }
  return Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1_SCHEMA,
    sourceSpecFileSha256:hash(
      record.sourceSpecFileSha256,
      'continuity.sourceSpecFileSha256',
    ),
    targetSpecFileSha256:hash(
      record.targetSpecFileSha256,
      'continuity.targetSpecFileSha256',
    ),
    pinApplicationSha256:hash(
      record.pinApplicationSha256,
      'continuity.pinApplicationSha256',
    ),
    patchCandidateSha256:hash(
      record.patchCandidateSha256,
      'continuity.patchCandidateSha256',
    ),
    approvalSha256:hash(record.approvalSha256,'continuity.approvalSha256'),
    receiptSha256:hash(record.receiptSha256,'continuity.receiptSha256'),
    sourceReceiptFileSha256:hash(
      record.sourceReceiptFileSha256,
      'continuity.sourceReceiptFileSha256',
    ),
    stageId:text(record.stageId,'continuity.stageId',160),
    stageKind:text(record.stageKind,'continuity.stageKind',64),
    repositoryCommitSha:gitOid(
      record.repositoryCommitSha,
      'continuity.repositoryCommitSha',
    ),
    stageDefinitionSha256:hash(
      record.stageDefinitionSha256,
      'continuity.stageDefinitionSha256',
    ),
    argvSha256:hash(record.argvSha256,'continuity.argvSha256'),
    continuityState:'STAGE_DEFINITION_INVARIANT',
    outputTrustState:'OBSERVED_NOT_PIN_AUTHORITY',
    externalPinCreated:falseValue(
      record.externalPinCreated,
      'continuity.externalPinCreated',
    ),
    semanticEvidenceAuthorityGranted:falseValue(
      record.semanticEvidenceAuthorityGranted,
      'continuity.semanticEvidenceAuthorityGranted',
    ),
    decisionMutationAllowed:falseValue(
      record.decisionMutationAllowed,
      'continuity.decisionMutationAllowed',
    ),
    candidateSelectionAllowed:falseValue(
      record.candidateSelectionAllowed,
      'continuity.candidateSelectionAllowed',
    ),
    winnerSelectionAllowed:falseValue(
      record.winnerSelectionAllowed,
      'continuity.winnerSelectionAllowed',
    ),
    reuseAdvanceAllowed:falseValue(
      record.reuseAdvanceAllowed,
      'continuity.reuseAdvanceAllowed',
    ),
    fullStudentEscalationAllowed:falseValue(
      record.fullStudentEscalationAllowed,
      'continuity.fullStudentEscalationAllowed',
    ),
    trainingRunStartAllowed:falseValue(
      record.trainingRunStartAllowed,
      'continuity.trainingRunStartAllowed',
    ),
    trainingOrDistillationAllowed:falseValue(
      record.trainingOrDistillationAllowed,
      'continuity.trainingOrDistillationAllowed',
    ),
    modelInstallAllowed:falseValue(
      record.modelInstallAllowed,
      'continuity.modelInstallAllowed',
    ),
    modelFleetPromotionAllowed:falseValue(
      record.modelFleetPromotionAllowed,
      'continuity.modelFleetPromotionAllowed',
    ),
    productionAuthorityGranted:falseValue(
      record.productionAuthorityGranted,
      'continuity.productionAuthorityGranted',
    ),
    providerAuthorityGranted:falseValue(
      record.providerAuthorityGranted,
      'continuity.providerAuthorityGranted',
    ),
    billingAuthorityGranted:falseValue(
      record.billingAuthorityGranted,
      'continuity.billingAuthorityGranted',
    ),
    projectArtifactMutationAllowed:falseValue(
      record.projectArtifactMutationAllowed,
      'continuity.projectArtifactMutationAllowed',
    ),
    aeeExecutionAuthorityGranted:falseValue(
      record.aeeExecutionAuthorityGranted,
      'continuity.aeeExecutionAuthorityGranted',
    ),
    durableModelFleetPromotionAllowed:falseValue(
      record.durableModelFleetPromotionAllowed,
      'continuity.durableModelFleetPromotionAllowed',
    ),
    continuitySha256:hash(record.continuitySha256,'continuity.continuitySha256'),
  });
}

export function hsmeReusePipelineReceiptContinuityPayloadV1(continuity){
  const payload={...continuity};
  delete payload.continuitySha256;
  return payload;
}

export function hsmeReusePipelineReceiptContinuityV1Digest(raw){
  const normalized=normalizeHsmeReusePipelineReceiptContinuityV1(raw);
  return domainDigest(
    HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_DIGEST_DOMAIN,
    hsmeReusePipelineReceiptContinuityPayloadV1(normalized),
  );
}

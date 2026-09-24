import {
  HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
  hsmeDenseBaselinePersistenceIntentV1Digest,
  type HsmeDenseBaselinePersistenceIntentV1,
} from './HsmeDenseBaselinePersistenceIntentV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1' as const;
export const CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:dense-baseline-commit-result:v1\0' as const;
export const HSME_DENSE_BASELINE_COMMIT_RECEIPT_V1_SCHEMA =
  'BERS_HSME_DENSE_BASELINE_COMMIT_RECEIPT_V1' as const;
export const HSME_DENSE_BASELINE_COMMIT_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-commit-receipt:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type CoreHsmeDenseBaselineCommitRequestV1=Readonly<{
  persistenceIntentSha256:string;
  approvalEvidenceSha256:string;
  canonicalPath:typeof HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH;
  expectedCurrentDecisionSha256:string;
  expectedCurrentFileSha256:string;
  nextDecisionSha256:string;
  nextFileSha256:string;
  nextCanonicalFileText:string;
  nextCanonicalFileBytes:Uint8Array;
  nextFileBytes:number;
}>;

export interface CoreHsmeDenseBaselineCommitPortV1{
  commitExactCanonicalBaseline(
    request:CoreHsmeDenseBaselineCommitRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmeDenseBaselineCommitResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1_SCHEMA;
  state:
    |'CANONICAL_BASELINE_COMMIT_APPLIED'
    |'CANONICAL_BASELINE_COMMIT_ALREADY_APPLIED'
    |'CANONICAL_BASELINE_COMMIT_STALE_BLOCKED';
  persistenceIntentSha256:string;
  canonicalPath:typeof HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH;
  expectedCurrentFileSha256:string;
  requestedNextFileSha256:string;
  requestedNextBytes:number;
  observedBeforeFileSha256:string;
  observedAfterFileSha256:string;
  writePerformed:boolean;
  atomicSameDirectoryReplace:boolean;
  noSymlinkTraversal:true;
  durabilityAttested:boolean;
  commitAttemptId:string;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
  hostResultSha256:string;
}>;

export interface HsmeDenseBaselineCommitIntentOriginVerifierV1{
  verifyPersistenceIntent(
    intent:HsmeDenseBaselinePersistenceIntentV1,
    expectedIntentSha256:string,
  ):Promise<boolean>;
}

export interface CoreHsmeDenseBaselineCommitResultOriginVerifierV1{
  verifyCommitResult(
    result:CoreHsmeDenseBaselineCommitResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseBaselineCommitReceiptV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_BASELINE_COMMIT_RECEIPT_V1_SCHEMA;
  state:
    |'CANONICAL_BASELINE_PERSISTENCE_INVALID'
    |'CANONICAL_BASELINE_PERSISTENCE_STALE_BLOCKED'
    |'CANONICAL_BASELINE_PERSISTED_NOT_PROMOTED'
    |'CANONICAL_BASELINE_ALREADY_PERSISTED_NOT_PROMOTED';
  blockers:readonly string[];
  persistenceIntentSha256:string|'UNKNOWN';
  approvalEvidenceSha256:string|'UNKNOWN';
  canonicalPath:typeof HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH;
  expectedCurrentDecisionSha256:string|'UNKNOWN';
  expectedCurrentFileSha256:string|'UNKNOWN';
  nextDecisionSha256:string|'UNKNOWN';
  nextFileSha256:string|'UNKNOWN';
  observedBeforeFileSha256:string|'UNKNOWN';
  observedAfterFileSha256:string|'UNKNOWN';
  hostResultSha256:string|'UNKNOWN';
  writePerformed:boolean;
  receiptEvidenceSha256:string|'UNKNOWN';
  furtherFileMutationAllowed:false;
  trainingExecutionAllowed:false;
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

export class HsmeDenseBaselineCommitReceiptV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseBaselineCommitReceiptV1Error';
    this.code=code;
  }
}

export function normalizeCoreHsmeDenseBaselineCommitResultV1(
  raw:unknown,
):CoreHsmeDenseBaselineCommitResultV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'state',
    'persistenceIntentSha256',
    'canonicalPath',
    'expectedCurrentFileSha256',
    'requestedNextFileSha256',
    'requestedNextBytes',
    'observedBeforeFileSha256',
    'observedAfterFileSha256',
    'writePerformed',
    'atomicSameDirectoryReplace',
    'noSymlinkTraversal',
    'durabilityAttested',
    'commitAttemptId',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
    'hostResultSha256',
  ],'commitResult');

  if(record.schemaVersion!==CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1_SCHEMA){
    fail('hsme_dense_baseline_commit_result_schema','host result schema unsupported');
  }
  if(record.canonicalPath!==HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH){
    fail('hsme_dense_baseline_commit_result_path','host result canonical path mismatch');
  }
  const state=enumValue(
    record.state,
    [
      'CANONICAL_BASELINE_COMMIT_APPLIED',
      'CANONICAL_BASELINE_COMMIT_ALREADY_APPLIED',
      'CANONICAL_BASELINE_COMMIT_STALE_BLOCKED',
    ] as const,
    'commitResult.state',
  );
  const requestedNextBytes=safeInteger(
    record.requestedNextBytes,
    'commitResult.requestedNextBytes',
    1,
    10_000_000,
  );
  if(typeof record.writePerformed!=='boolean'){
    fail('hsme_dense_baseline_commit_result_value','commitResult.writePerformed must be boolean');
  }
  if(typeof record.atomicSameDirectoryReplace!=='boolean'){
    fail(
      'hsme_dense_baseline_commit_result_value',
      'commitResult.atomicSameDirectoryReplace must be boolean',
    );
  }
  if(record.noSymlinkTraversal!==true){
    fail(
      'hsme_dense_baseline_commit_result_symlink',
      'commitResult.noSymlinkTraversal must be true',
    );
  }
  if(typeof record.durabilityAttested!=='boolean'){
    fail(
      'hsme_dense_baseline_commit_result_value',
      'commitResult.durabilityAttested must be boolean',
    );
  }
  assertHostNoAuthority(record);

  return deepFreeze({
    schemaVersion:CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1_SCHEMA,
    state,
    persistenceIntentSha256:sha256(
      record.persistenceIntentSha256,
      'commitResult.persistenceIntentSha256',
    ),
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentFileSha256:sha256(
      record.expectedCurrentFileSha256,
      'commitResult.expectedCurrentFileSha256',
    ),
    requestedNextFileSha256:sha256(
      record.requestedNextFileSha256,
      'commitResult.requestedNextFileSha256',
    ),
    requestedNextBytes,
    observedBeforeFileSha256:sha256(
      record.observedBeforeFileSha256,
      'commitResult.observedBeforeFileSha256',
    ),
    observedAfterFileSha256:sha256(
      record.observedAfterFileSha256,
      'commitResult.observedAfterFileSha256',
    ),
    writePerformed:record.writePerformed,
    atomicSameDirectoryReplace:record.atomicSameDirectoryReplace,
    noSymlinkTraversal:true,
    durabilityAttested:record.durabilityAttested,
    commitAttemptId:boundedString(
      record.commitAttemptId,
      'commitResult.commitAttemptId',
      180,
    ),
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(
      record.hostResultSha256,
      'commitResult.hostResultSha256',
    ),
  });
}

export async function coreHsmeDenseBaselineCommitResultV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=normalizeCoreHsmeDenseBaselineCommitResultV1(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function commitHsmeDenseBaselinePersistenceIntentV1(
  intent:HsmeDenseBaselinePersistenceIntentV1,
  expectedIntentSha256:string,
  intentOrigin:HsmeDenseBaselineCommitIntentOriginVerifierV1,
  commitPort:CoreHsmeDenseBaselineCommitPortV1,
  hostResultOrigin:CoreHsmeDenseBaselineCommitResultOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseBaselineCommitReceiptV1>{
  if(
    intent.state!=='PERSISTENCE_INTENT_READY_NOT_COMMITTED'
    ||intent.blockers.length!==0
    ||intent.nextCanonicalJson===null
    ||intent.persistenceIntentSha256==='UNKNOWN'
    ||intent.approvalEvidenceSha256==='UNKNOWN'
    ||intent.expectedCurrentDecisionSha256==='UNKNOWN'
    ||intent.expectedCurrentFileSha256==='UNKNOWN'
    ||intent.nextDecisionSha256==='UNKNOWN'
    ||intent.nextFileSha256==='UNKNOWN'
  ){
    return invalid(['CANONICAL_BASELINE_COMMIT_READY_INTENT_REQUIRED']);
  }
  if(intentAuthorityWidened(intent)){
    return invalid(['CANONICAL_BASELINE_COMMIT_INTENT_AUTHORITY_WIDENING']);
  }

  let persistenceIntentSha256:string;
  try{
    persistenceIntentSha256=
      await hsmeDenseBaselinePersistenceIntentV1Digest(intent,hash);
  }catch{
    return invalid(['CANONICAL_BASELINE_COMMIT_INTENT_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedIntentSha256)
    ||persistenceIntentSha256!==expectedIntentSha256
    ||persistenceIntentSha256!==intent.persistenceIntentSha256
  ){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_INTENT_REHASH_MISMATCH'],
      fromIntent(intent,persistenceIntentSha256),
    );
  }
  if(!await verify(
    ()=>intentOrigin.verifyPersistenceIntent(intent,persistenceIntentSha256),
  )){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_INTENT_ORIGIN_UNVERIFIED'],
      fromIntent(intent,persistenceIntentSha256),
    );
  }

  const nextCanonicalFileText=intent.nextCanonicalJson+'\n';
  const nextCanonicalFileBytes=new TextEncoder().encode(nextCanonicalFileText);
  let derivedNextFileSha256:string;
  try{
    derivedNextFileSha256=await rawSha256(nextCanonicalFileBytes,hash);
  }catch{
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_NEXT_BYTES_REHASH_INVALID'],
      fromIntent(intent,persistenceIntentSha256),
    );
  }
  if(derivedNextFileSha256!==intent.nextFileSha256){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_NEXT_BYTES_DIGEST_MISMATCH'],
      fromIntent(intent,persistenceIntentSha256),
    );
  }

  const request:CoreHsmeDenseBaselineCommitRequestV1=Object.freeze({
    persistenceIntentSha256,
    approvalEvidenceSha256:intent.approvalEvidenceSha256,
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentDecisionSha256:intent.expectedCurrentDecisionSha256,
    expectedCurrentFileSha256:intent.expectedCurrentFileSha256,
    nextDecisionSha256:intent.nextDecisionSha256,
    nextFileSha256:intent.nextFileSha256,
    nextCanonicalFileText,
    nextCanonicalFileBytes,
    nextFileBytes:nextCanonicalFileBytes.byteLength,
  });

  let rawHostResult:unknown;
  try{
    rawHostResult=await commitPort.commitExactCanonicalBaseline(request);
  }catch{
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_HOST_CALL_FAILED'],
      fromIntent(intent,persistenceIntentSha256),
    );
  }

  let hostResult:CoreHsmeDenseBaselineCommitResultV1;
  let hostResultSha256:string;
  try{
    hostResult=normalizeCoreHsmeDenseBaselineCommitResultV1(rawHostResult);
    hostResultSha256=await coreHsmeDenseBaselineCommitResultV1Digest(
      hostResult,
      hash,
    );
  }catch{
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_HOST_RESULT_INVALID'],
      fromIntent(intent,persistenceIntentSha256),
    );
  }
  if(hostResultSha256!==hostResult.hostResultSha256){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_HOST_RESULT_REHASH_MISMATCH'],
      {
        ...fromIntent(intent,persistenceIntentSha256),
        hostResultSha256,
        observedBeforeFileSha256:hostResult.observedBeforeFileSha256,
        observedAfterFileSha256:hostResult.observedAfterFileSha256,
        writePerformed:hostResult.writePerformed,
      },
    );
  }
  if(!await verify(
    ()=>hostResultOrigin.verifyCommitResult(hostResult,hostResultSha256),
  )){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_HOST_RESULT_ORIGIN_UNVERIFIED'],
      {
        ...fromIntent(intent,persistenceIntentSha256),
        hostResultSha256,
        observedBeforeFileSha256:hostResult.observedBeforeFileSha256,
        observedAfterFileSha256:hostResult.observedAfterFileSha256,
        writePerformed:hostResult.writePerformed,
      },
    );
  }

  if(
    hostResult.persistenceIntentSha256!==persistenceIntentSha256
    ||hostResult.canonicalPath!==HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH
    ||hostResult.expectedCurrentFileSha256!==intent.expectedCurrentFileSha256
    ||hostResult.requestedNextFileSha256!==intent.nextFileSha256
    ||hostResult.requestedNextBytes!==nextCanonicalFileBytes.byteLength
    ||hostAuthorityWidened(hostResult)
  ){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_HOST_RESULT_BINDING_MISMATCH'],
      {
        ...fromIntent(intent,persistenceIntentSha256),
        hostResultSha256,
        observedBeforeFileSha256:hostResult.observedBeforeFileSha256,
        observedAfterFileSha256:hostResult.observedAfterFileSha256,
        writePerformed:hostResult.writePerformed,
      },
    );
  }

  const common:ResolvedOutput={
    persistenceIntentSha256,
    approvalEvidenceSha256:intent.approvalEvidenceSha256,
    expectedCurrentDecisionSha256:intent.expectedCurrentDecisionSha256,
    expectedCurrentFileSha256:intent.expectedCurrentFileSha256,
    nextDecisionSha256:intent.nextDecisionSha256,
    nextFileSha256:intent.nextFileSha256,
    hostResultSha256,
    observedBeforeFileSha256:hostResult.observedBeforeFileSha256,
    observedAfterFileSha256:hostResult.observedAfterFileSha256,
    writePerformed:hostResult.writePerformed,
  };

  if(hostResult.state==='CANONICAL_BASELINE_COMMIT_STALE_BLOCKED'){
    if(
      hostResult.writePerformed
      ||hostResult.atomicSameDirectoryReplace
      ||hostResult.durabilityAttested
      ||hostResult.observedBeforeFileSha256===intent.expectedCurrentFileSha256
      ||hostResult.observedBeforeFileSha256===intent.nextFileSha256
      ||hostResult.observedAfterFileSha256!==hostResult.observedBeforeFileSha256
    ){
      return invalid(
        ['CANONICAL_BASELINE_COMMIT_STALE_RESULT_INCONSISTENT'],
        common,
      );
    }
    return stale(
      ['CANONICAL_BASELINE_COMMIT_STALE_CURRENT_FILE'],
      common,
    );
  }

  if(hostResult.state==='CANONICAL_BASELINE_COMMIT_APPLIED'){
    if(
      !hostResult.writePerformed
      ||!hostResult.atomicSameDirectoryReplace
      ||!hostResult.durabilityAttested
      ||hostResult.observedBeforeFileSha256!==intent.expectedCurrentFileSha256
      ||hostResult.observedAfterFileSha256!==intent.nextFileSha256
    ){
      return invalid(
        ['CANONICAL_BASELINE_COMMIT_APPLIED_RESULT_INCONSISTENT'],
        common,
      );
    }
    return success(
      'CANONICAL_BASELINE_PERSISTED_NOT_PROMOTED',
      common,
      hash,
    );
  }

  if(
    hostResult.writePerformed
    ||hostResult.atomicSameDirectoryReplace
    ||hostResult.durabilityAttested
    ||hostResult.observedBeforeFileSha256!==intent.nextFileSha256
    ||hostResult.observedAfterFileSha256!==intent.nextFileSha256
  ){
    return invalid(
      ['CANONICAL_BASELINE_COMMIT_ALREADY_RESULT_INCONSISTENT'],
      common,
    );
  }
  return success(
    'CANONICAL_BASELINE_ALREADY_PERSISTED_NOT_PROMOTED',
    common,
    hash,
  );
}

export async function hsmeDenseBaselineCommitReceiptV1Digest(
  receipt:HsmeDenseBaselineCommitReceiptV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    receipt.state!=='CANONICAL_BASELINE_PERSISTED_NOT_PROMOTED'
    &&receipt.state!=='CANONICAL_BASELINE_ALREADY_PERSISTED_NOT_PROMOTED'
  ){
    fail(
      'hsme_dense_baseline_commit_receipt_digest_state',
      'only successful persistence receipts are digestible',
    );
  }
  if(receipt.receiptEvidenceSha256==='UNKNOWN'){
    fail(
      'hsme_dense_baseline_commit_receipt_digest_missing',
      'successful persistence receipt digest is missing',
    );
  }
  const {receiptEvidenceSha256:_ignored,...payload}=receipt;
  return digest(
    HSME_DENSE_BASELINE_COMMIT_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

async function success(
  state:
    |'CANONICAL_BASELINE_PERSISTED_NOT_PROMOTED'
    |'CANONICAL_BASELINE_ALREADY_PERSISTED_NOT_PROMOTED',
  values:ResolvedOutput,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseBaselineCommitReceiptV1>{
  const payload={
    schemaVersion:HSME_DENSE_BASELINE_COMMIT_RECEIPT_V1_SCHEMA,
    state,
    blockers:Object.freeze([] as string[]),
    ...values,
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    ...receiptAuthorityBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_DENSE_BASELINE_COMMIT_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,receiptEvidenceSha256});
}

type PartialOutput=Partial<Pick<
  HsmeDenseBaselineCommitReceiptV1,
  'persistenceIntentSha256'
  |'approvalEvidenceSha256'
  |'expectedCurrentDecisionSha256'
  |'expectedCurrentFileSha256'
  |'nextDecisionSha256'
  |'nextFileSha256'
  |'observedBeforeFileSha256'
  |'observedAfterFileSha256'
  |'hostResultSha256'
  |'writePerformed'
>>;

type ResolvedOutput=Required<Pick<
  HsmeDenseBaselineCommitReceiptV1,
  'persistenceIntentSha256'
  |'approvalEvidenceSha256'
  |'expectedCurrentDecisionSha256'
  |'expectedCurrentFileSha256'
  |'nextDecisionSha256'
  |'nextFileSha256'
  |'observedBeforeFileSha256'
  |'observedAfterFileSha256'
  |'hostResultSha256'
  |'writePerformed'
>>;

function fromIntent(
  intent:HsmeDenseBaselinePersistenceIntentV1,
  persistenceIntentSha256:string,
):PartialOutput{
  return {
    persistenceIntentSha256,
    approvalEvidenceSha256:intent.approvalEvidenceSha256,
    expectedCurrentDecisionSha256:intent.expectedCurrentDecisionSha256,
    expectedCurrentFileSha256:intent.expectedCurrentFileSha256,
    nextDecisionSha256:intent.nextDecisionSha256,
    nextFileSha256:intent.nextFileSha256,
  };
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeDenseBaselineCommitReceiptV1{
  return terminal('CANONICAL_BASELINE_PERSISTENCE_INVALID',blockers,values);
}

function stale(
  blockers:readonly string[],
  values:PartialOutput,
):HsmeDenseBaselineCommitReceiptV1{
  return terminal(
    'CANONICAL_BASELINE_PERSISTENCE_STALE_BLOCKED',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'CANONICAL_BASELINE_PERSISTENCE_INVALID'
    |'CANONICAL_BASELINE_PERSISTENCE_STALE_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeDenseBaselineCommitReceiptV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_BASELINE_COMMIT_RECEIPT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    persistenceIntentSha256:values.persistenceIntentSha256??'UNKNOWN',
    approvalEvidenceSha256:values.approvalEvidenceSha256??'UNKNOWN',
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentDecisionSha256:
      values.expectedCurrentDecisionSha256??'UNKNOWN',
    expectedCurrentFileSha256:values.expectedCurrentFileSha256??'UNKNOWN',
    nextDecisionSha256:values.nextDecisionSha256??'UNKNOWN',
    nextFileSha256:values.nextFileSha256??'UNKNOWN',
    observedBeforeFileSha256:values.observedBeforeFileSha256??'UNKNOWN',
    observedAfterFileSha256:values.observedAfterFileSha256??'UNKNOWN',
    hostResultSha256:values.hostResultSha256??'UNKNOWN',
    writePerformed:values.writePerformed??false,
    receiptEvidenceSha256:'UNKNOWN',
    ...receiptAuthorityBoundary(),
  });
}

function intentAuthorityWidened(
  value:HsmeDenseBaselinePersistenceIntentV1,
):boolean{
  return value.canonicalDecisionPersistAllowed!==false
    ||value.fileMutationAllowed!==false
    ||value.trainingExecutionAllowed!==false
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

function hostAuthorityWidened(
  value:CoreHsmeDenseBaselineCommitResultV1,
):boolean{
  return value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function assertHostNoAuthority(record:Record<string,unknown>):void{
  for(const field of Object.keys(hostAuthorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_dense_baseline_commit_result_authority',
        'commitResult.'+field+' must remain false',
      );
    }
  }
}

function hostAuthorityBoundary(){
  return Object.freeze({
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

function receiptAuthorityBoundary(){
  return Object.freeze({
    furtherFileMutationAllowed:false as const,
    trainingExecutionAllowed:false as const,
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_dense_baseline_commit_result_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_dense_baseline_commit_result_schema',
      path+' contains unknown or missing fields',
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
    fail('hsme_dense_baseline_commit_result_value',path+' is unsupported');
  }
  return raw as T[number];
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_dense_baseline_commit_result_value',
      path+' must be a safe integer',
    );
  }
  return raw as number;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_dense_baseline_commit_result_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_dense_baseline_commit_result_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_dense_baseline_commit_result_value',path+' is invalid');
  }
  return value;
}

async function rawSha256(
  bytes:Uint8Array,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(bytes);
  if(!HEX64.test(result)){
    fail(
      'hsme_dense_baseline_commit_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  return rawSha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
    hash,
  );
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
      if(!(child instanceof Uint8Array)){
        deepFreeze(child);
      }
    }
  }
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeDenseBaselineCommitReceiptV1Error(code,message);
}

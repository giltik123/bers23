import {
  hsmeDenseStudentSelectedBaselineFinalizationV1Digest,
  type HsmeDenseStudentSelectedBaselineFinalizationV1,
} from './HsmeDenseStudentSelectedBaselineFinalizationV1.ts';
import {
  hsmeDenseBaselineFinalizationV1Digest,
} from './HsmeDenseBaselineFinalizationV1.ts';
import {
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
  serializeHsmeDenseBaselineDecisionV1,
  type HsmeDenseBaselineDecisionV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1_SCHEMA =
  'BERS_HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1' as const;
export const HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-persistence-approval:v1\0' as const;
export const HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1_SCHEMA =
  'BERS_HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1' as const;
export const HSME_DENSE_BASELINE_PERSISTENCE_INTENT_DIGEST_DOMAIN =
  'bers:hsme:dense-baseline-persistence-intent:v1\0' as const;
export const HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH =
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeDenseBaselinePersistenceApprovalV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1_SCHEMA;
  selectedBaselineFinalizationSha256:string;
  sourceDecisionSha256:string;
  decisionCandidateSha256:string;
  canonicalPath:typeof HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH;
  expectedCurrentFileSha256:string;
  expectedNextDecisionSha256:string;
  expectedNextFileSha256:string;
  reviewState:'APPROVED';
  approvalId:string;
  canonicalDecisionPersistAllowed:false;
  fileMutationAllowed:false;
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

export interface HsmeDenseBaselinePersistenceSelectedOriginVerifierV1{
  verifySelectedBaselineFinalization(
    selected:HsmeDenseStudentSelectedBaselineFinalizationV1,
    expectedSelectedSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseBaselinePersistenceSourceOriginVerifierV1{
  verifySourceDecision(
    decision:HsmeDenseBaselineDecisionV1,
    expectedDecisionSha256:string,
  ):Promise<boolean>;
}

export interface HsmeDenseBaselinePersistenceApprovalOriginVerifierV1{
  verifyPersistenceApproval(
    approval:HsmeDenseBaselinePersistenceApprovalV1,
    expectedApprovalSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseBaselinePersistenceIntentV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1_SCHEMA;
  state:
    |'PERSISTENCE_INTENT_INVALID'
    |'PERSISTENCE_INTENT_BLOCKED'
    |'PERSISTENCE_INTENT_READY_NOT_COMMITTED';
  blockers:readonly string[];
  selectedBaselineFinalizationSha256:string|'UNKNOWN';
  approvalEvidenceSha256:string|'UNKNOWN';
  canonicalPath:typeof HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH;
  expectedCurrentDecisionSha256:string|'UNKNOWN';
  expectedCurrentFileSha256:string|'UNKNOWN';
  nextDecisionSha256:string|'UNKNOWN';
  nextFileSha256:string|'UNKNOWN';
  nextCanonicalJson:string|null;
  persistenceIntentSha256:string|'UNKNOWN';
  canonicalDecisionPersistAllowed:false;
  fileMutationAllowed:false;
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

export class HsmeDenseBaselinePersistenceIntentV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseBaselinePersistenceIntentV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseBaselinePersistenceApprovalV1(
  raw:unknown,
):HsmeDenseBaselinePersistenceApprovalV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'selectedBaselineFinalizationSha256',
    'sourceDecisionSha256',
    'decisionCandidateSha256',
    'canonicalPath',
    'expectedCurrentFileSha256',
    'expectedNextDecisionSha256',
    'expectedNextFileSha256',
    'reviewState',
    'approvalId',
    'canonicalDecisionPersistAllowed',
    'fileMutationAllowed',
    'trainingExecutionAllowed',
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'approval');
  if(record.schemaVersion!==HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1_SCHEMA){
    fail('hsme_dense_persistence_approval_schema','approval schema unsupported');
  }
  if(record.canonicalPath!==HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH){
    fail('hsme_dense_persistence_approval_path','approval canonical path mismatch');
  }
  if(record.reviewState!=='APPROVED'){
    fail('hsme_dense_persistence_approval_review','approval reviewState must be APPROVED');
  }
  for(const field of authorityFields()){
    if(record[field]!==false){
      fail('hsme_dense_persistence_approval_authority','approval.'+field+' must remain false');
    }
  }
  return deepFreeze({
    schemaVersion:HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1_SCHEMA,
    selectedBaselineFinalizationSha256:sha256(record.selectedBaselineFinalizationSha256,'approval.selectedBaselineFinalizationSha256'),
    sourceDecisionSha256:sha256(record.sourceDecisionSha256,'approval.sourceDecisionSha256'),
    decisionCandidateSha256:sha256(record.decisionCandidateSha256,'approval.decisionCandidateSha256'),
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentFileSha256:sha256(record.expectedCurrentFileSha256,'approval.expectedCurrentFileSha256'),
    expectedNextDecisionSha256:sha256(record.expectedNextDecisionSha256,'approval.expectedNextDecisionSha256'),
    expectedNextFileSha256:sha256(record.expectedNextFileSha256,'approval.expectedNextFileSha256'),
    reviewState:'APPROVED',
    approvalId:boundedString(record.approvalId,'approval.approvalId',160),
    ...authorityBoundary(),
  });
}

export async function hsmeDenseBaselinePersistenceApprovalV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const approval=normalizeHsmeDenseBaselinePersistenceApprovalV1(raw);
  return digest(HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_DIGEST_DOMAIN,approval,hash);
}

export async function proveHsmeDenseBaselinePersistenceIntentV1(
  selected:HsmeDenseStudentSelectedBaselineFinalizationV1,
  expectedSelectedFinalizationSha256:string,
  selectedOrigin:HsmeDenseBaselinePersistenceSelectedOriginVerifierV1,
  rawSourceDecision:unknown,
  expectedSourceDecisionSha256:string,
  sourceOrigin:HsmeDenseBaselinePersistenceSourceOriginVerifierV1,
  currentCanonicalFileBytes:Uint8Array,
  expectedCurrentFileSha256:string,
  rawApproval:unknown,
  expectedApprovalSha256:string,
  approvalOrigin:HsmeDenseBaselinePersistenceApprovalOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseBaselinePersistenceIntentV1>{
  if(
    selected.state!=='SELECTED_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED'
    ||selected.blockers.length!==0
    ||selected.finalization===null
    ||selected.finalization.decisionCandidate===null
  ){
    return blocked(['PERSISTENCE_INTENT_READY_SELECTED_FINALIZATION_REQUIRED']);
  }
  if(selectedAuthorityWidened(selected)){
    return invalid(['PERSISTENCE_INTENT_SELECTED_AUTHORITY_WIDENING']);
  }

  let selectedBaselineFinalizationSha256:string;
  try{
    selectedBaselineFinalizationSha256=
      await hsmeDenseStudentSelectedBaselineFinalizationV1Digest(selected,hash);
  }catch{
    return invalid(['PERSISTENCE_INTENT_SELECTED_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedSelectedFinalizationSha256)
    ||selectedBaselineFinalizationSha256!==expectedSelectedFinalizationSha256
    ||selectedBaselineFinalizationSha256!==selected.evidenceSha256
  ){
    return invalid(
      ['PERSISTENCE_INTENT_SELECTED_REHASH_MISMATCH'],
      {selectedBaselineFinalizationSha256},
    );
  }
  if(!await verify(()=>selectedOrigin.verifySelectedBaselineFinalization(
    selected,
    selectedBaselineFinalizationSha256,
  ))){
    return invalid(
      ['PERSISTENCE_INTENT_SELECTED_ORIGIN_UNVERIFIED'],
      {selectedBaselineFinalizationSha256},
    );
  }

  const finalization=selected.finalization;
  let denseBaselineFinalizationSha256:string;
  try{
    denseBaselineFinalizationSha256=
      await hsmeDenseBaselineFinalizationV1Digest(finalization,hash);
  }catch{
    return invalid(
      ['PERSISTENCE_INTENT_FINALIZATION_REHASH_INVALID'],
      {selectedBaselineFinalizationSha256},
    );
  }
  if(
    denseBaselineFinalizationSha256!==selected.denseBaselineFinalizationSha256
    ||denseBaselineFinalizationSha256!==finalization.finalizationEvidenceSha256
    ||finalization.state!=='DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED'
    ||finalization.disposition!=='ADVANCE'
    ||finalization.blockers.length!==0
    ||finalization.decisionCandidate===null
    ||!HEX64.test(finalization.decisionCandidateSha256)
    ||finalizationAuthorityWidened(finalization)
    ||finalization.representationEvidenceSha256!==selected.representationEvidenceSha256
    ||finalization.stepMatrixEvidenceSha256!==selected.stepMatrixEvidenceSha256
    ||finalization.dualBudgetProjectionSha256!==selected.dualBudgetProjectionSha256
  ){
    return invalid(
      ['PERSISTENCE_INTENT_FINALIZATION_BINDING_INVALID'],
      {selectedBaselineFinalizationSha256},
    );
  }

  let sourceDecision:HsmeDenseBaselineDecisionV1;
  let sourceDecisionSha256:string;
  try{
    sourceDecision=normalizeHsmeDenseBaselineDecisionV1(rawSourceDecision);
    sourceDecisionSha256=await hsmeDenseBaselineDecisionV1Digest(sourceDecision,hash);
  }catch{
    return invalid(
      ['PERSISTENCE_INTENT_SOURCE_DECISION_INVALID'],
      {selectedBaselineFinalizationSha256},
    );
  }
  if(
    !HEX64.test(expectedSourceDecisionSha256)
    ||sourceDecisionSha256!==expectedSourceDecisionSha256
    ||sourceDecisionSha256!==finalization.sourceDecisionSha256
  ){
    return invalid(
      ['PERSISTENCE_INTENT_SOURCE_DECISION_DIGEST_MISMATCH'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
      },
    );
  }
  if(!await verify(()=>sourceOrigin.verifySourceDecision(
    sourceDecision,
    sourceDecisionSha256,
  ))){
    return invalid(
      ['PERSISTENCE_INTENT_SOURCE_DECISION_ORIGIN_UNVERIFIED'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
      },
    );
  }

  if(
    !(currentCanonicalFileBytes instanceof Uint8Array)
    ||currentCanonicalFileBytes.byteLength===0
    ||!HEX64.test(expectedCurrentFileSha256)
  ){
    return invalid(
      ['PERSISTENCE_INTENT_CURRENT_FILE_INPUT_INVALID'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
      },
    );
  }
  const currentFileSha256=await rawSha256(currentCanonicalFileBytes,hash);
  if(currentFileSha256!==expectedCurrentFileSha256){
    return invalid(
      ['PERSISTENCE_INTENT_CURRENT_FILE_SHA_MISMATCH'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
      },
    );
  }

  let rawNormalized:HsmeDenseBaselineDecisionV1;
  let rawNormalizedSha256:string;
  try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(currentCanonicalFileBytes);
    rawNormalized=normalizeHsmeDenseBaselineDecisionV1(JSON.parse(text));
    rawNormalizedSha256=await hsmeDenseBaselineDecisionV1Digest(rawNormalized,hash);
  }catch{
    return invalid(
      ['PERSISTENCE_INTENT_CURRENT_FILE_PARSE_INVALID'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
      },
    );
  }
  if(
    rawNormalizedSha256!==sourceDecisionSha256
    ||serializeHsmeDenseBaselineDecisionV1(rawNormalized)!==
      serializeHsmeDenseBaselineDecisionV1(sourceDecision)
  ){
    return invalid(
      ['PERSISTENCE_INTENT_CURRENT_FILE_SEMANTIC_MISMATCH'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
      },
    );
  }

  let decisionCandidate:HsmeDenseBaselineDecisionV1;
  let decisionCandidateSha256:string;
  try{
    decisionCandidate=normalizeHsmeDenseBaselineDecisionV1(finalization.decisionCandidate);
    decisionCandidateSha256=
      await hsmeDenseBaselineDecisionV1Digest(decisionCandidate,hash);
  }catch{
    return invalid(
      ['PERSISTENCE_INTENT_DECISION_CANDIDATE_INVALID'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
      },
    );
  }
  if(
    decisionCandidate.decisionStatus!=='BASELINE_PINNED'
    ||decisionCandidateSha256!==finalization.decisionCandidateSha256
  ){
    return invalid(
      ['PERSISTENCE_INTENT_DECISION_CANDIDATE_DIGEST_MISMATCH'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
        nextDecisionSha256:decisionCandidateSha256,
      },
    );
  }

  const nextCanonicalJson=serializeHsmeDenseBaselineDecisionV1(decisionCandidate);
  const nextFileSha256=await rawSha256(
    new TextEncoder().encode(nextCanonicalJson+'\n'),
    hash,
  );

  let approval:HsmeDenseBaselinePersistenceApprovalV1;
  let approvalEvidenceSha256:string;
  try{
    approval=normalizeHsmeDenseBaselinePersistenceApprovalV1(rawApproval);
    approvalEvidenceSha256=
      await hsmeDenseBaselinePersistenceApprovalV1Digest(approval,hash);
  }catch{
    return invalid(
      ['PERSISTENCE_INTENT_APPROVAL_INVALID'],
      {
        selectedBaselineFinalizationSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
        nextDecisionSha256:decisionCandidateSha256,
        nextFileSha256,
      },
    );
  }
  if(
    !HEX64.test(expectedApprovalSha256)
    ||approvalEvidenceSha256!==expectedApprovalSha256
  ){
    return invalid(
      ['PERSISTENCE_INTENT_APPROVAL_DIGEST_MISMATCH'],
      {
        selectedBaselineFinalizationSha256,
        approvalEvidenceSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
        nextDecisionSha256:decisionCandidateSha256,
        nextFileSha256,
      },
    );
  }
  if(!await verify(()=>approvalOrigin.verifyPersistenceApproval(
    approval,
    approvalEvidenceSha256,
  ))){
    return invalid(
      ['PERSISTENCE_INTENT_APPROVAL_ORIGIN_UNVERIFIED'],
      {
        selectedBaselineFinalizationSha256,
        approvalEvidenceSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
        nextDecisionSha256:decisionCandidateSha256,
        nextFileSha256,
      },
    );
  }

  if(
    approval.selectedBaselineFinalizationSha256!==selectedBaselineFinalizationSha256
    ||approval.sourceDecisionSha256!==sourceDecisionSha256
    ||approval.decisionCandidateSha256!==decisionCandidateSha256
    ||approval.canonicalPath!==HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH
    ||approval.expectedCurrentFileSha256!==currentFileSha256
    ||approval.expectedNextDecisionSha256!==decisionCandidateSha256
    ||approval.expectedNextFileSha256!==nextFileSha256
  ){
    return invalid(
      ['PERSISTENCE_INTENT_APPROVAL_BINDING_MISMATCH'],
      {
        selectedBaselineFinalizationSha256,
        approvalEvidenceSha256,
        expectedCurrentDecisionSha256:sourceDecisionSha256,
        expectedCurrentFileSha256:currentFileSha256,
        nextDecisionSha256:decisionCandidateSha256,
        nextFileSha256,
      },
    );
  }

  const payload={
    schemaVersion:HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1_SCHEMA,
    state:'PERSISTENCE_INTENT_READY_NOT_COMMITTED' as const,
    blockers:Object.freeze([] as string[]),
    selectedBaselineFinalizationSha256,
    approvalEvidenceSha256,
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentDecisionSha256:sourceDecisionSha256,
    expectedCurrentFileSha256:currentFileSha256,
    nextDecisionSha256:decisionCandidateSha256,
    nextFileSha256,
    nextCanonicalJson,
    ...authorityBoundary(),
  };
  const persistenceIntentSha256=await digest(
    HSME_DENSE_BASELINE_PERSISTENCE_INTENT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,persistenceIntentSha256});
}

export async function hsmeDenseBaselinePersistenceIntentV1Digest(
  value:HsmeDenseBaselinePersistenceIntentV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    value.state!=='PERSISTENCE_INTENT_READY_NOT_COMMITTED'
    ||value.persistenceIntentSha256==='UNKNOWN'
    ||value.selectedBaselineFinalizationSha256==='UNKNOWN'
    ||value.approvalEvidenceSha256==='UNKNOWN'
    ||value.expectedCurrentDecisionSha256==='UNKNOWN'
    ||value.expectedCurrentFileSha256==='UNKNOWN'
    ||value.nextDecisionSha256==='UNKNOWN'
    ||value.nextFileSha256==='UNKNOWN'
    ||value.nextCanonicalJson===null
  ){
    fail('hsme_dense_persistence_intent_digest_state','only READY_NOT_COMMITTED intent is digestible');
  }
  const {persistenceIntentSha256:_ignored,...payload}=value;
  return digest(HSME_DENSE_BASELINE_PERSISTENCE_INTENT_DIGEST_DOMAIN,payload,hash);
}

function selectedAuthorityWidened(
  value:HsmeDenseStudentSelectedBaselineFinalizationV1,
):boolean{
  return value.trainingExecutionAllowed!==false
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

function finalizationAuthorityWidened(
  value:NonNullable<HsmeDenseStudentSelectedBaselineFinalizationV1['finalization']>,
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
    canonicalDecisionPersistAllowed:false as const,
    fileMutationAllowed:false as const,
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

function authorityFields():readonly string[]{
  return Object.freeze(Object.keys(authorityBoundary()));
}

type PartialOutput=Partial<Pick<
  HsmeDenseBaselinePersistenceIntentV1,
  'selectedBaselineFinalizationSha256'
  |'approvalEvidenceSha256'
  |'expectedCurrentDecisionSha256'
  |'expectedCurrentFileSha256'
  |'nextDecisionSha256'
  |'nextFileSha256'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeDenseBaselinePersistenceIntentV1{
  return terminal('PERSISTENCE_INTENT_INVALID',blockers,values);
}

function blocked(
  blockers:readonly string[],
):HsmeDenseBaselinePersistenceIntentV1{
  return terminal('PERSISTENCE_INTENT_BLOCKED',blockers,{});
}

function terminal(
  state:'PERSISTENCE_INTENT_INVALID'|'PERSISTENCE_INTENT_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeDenseBaselinePersistenceIntentV1{
  return deepFreeze({
    schemaVersion:HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    selectedBaselineFinalizationSha256:
      values.selectedBaselineFinalizationSha256??'UNKNOWN',
    approvalEvidenceSha256:values.approvalEvidenceSha256??'UNKNOWN',
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentDecisionSha256:
      values.expectedCurrentDecisionSha256??'UNKNOWN',
    expectedCurrentFileSha256:values.expectedCurrentFileSha256??'UNKNOWN',
    nextDecisionSha256:values.nextDecisionSha256??'UNKNOWN',
    nextFileSha256:values.nextFileSha256??'UNKNOWN',
    nextCanonicalJson:null,
    persistenceIntentSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

async function rawSha256(
  bytes:Uint8Array,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(bytes);
  if(!HEX64.test(result)){
    fail('hsme_dense_persistence_hash_port','hash port must return lowercase SHA-256');
  }
  return result;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  return rawSha256(new TextEncoder().encode(domain+JSON.stringify(value)),hash);
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_dense_persistence_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_dense_persistence_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_dense_persistence_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_dense_persistence_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_dense_persistence_value',path+' is invalid');
  }
  return value;
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
  throw new HsmeDenseBaselinePersistenceIntentV1Error(code,message);
}

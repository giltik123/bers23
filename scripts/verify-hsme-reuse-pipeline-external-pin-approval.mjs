#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_V1_SCHEMA,
  buildHsmeReusePipelineExternalPinRequest,
} from './build-hsme-reuse-pipeline-external-pin-request.mjs';

export const HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1';
export const HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-external-pin-approval:v1\0';
export const HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFICATION_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFICATION_V1';
export const HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_V1';
export const HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-spec-pin-patch-candidate:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const APPROVAL_FIELDS=Object.freeze([
  'schemaVersion',
  'requestSha256',
  'requestStageId',
  'requestedExternalPinSha256',
  'specFileSha256',
  'decision',
  'approvalAuthorityId',
  'approvalEvidenceSha256',
  'semanticEvidenceReviewed',
  'specMutationPerformed',
  'stageExecutionAuthorized',
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
]);

export class HsmeReusePipelineExternalPinApprovalError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineExternalPinApprovalError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineExternalPinApprovalError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_pin_approval_record_invalid',path+' must be an object');
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
    fail(
      'hsme_reuse_pin_approval_shape_invalid',
      path+' fields differ from exact schema',
    );
  }
  return record;
}

function text(value,path,max=8192){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.trim()!==value
    ||value.includes('\u0000')
    ||value.includes('\r')
    ||value.includes('\n')
  ){
    fail('hsme_reuse_pin_approval_text_invalid',path+' is invalid');
  }
  return value;
}

function identifier(value,path){
  const result=text(value,path,160);
  if(!IDENTIFIER.test(result)){
    fail('hsme_reuse_pin_approval_identifier_invalid',path+' is invalid');
  }
  return result;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_pin_approval_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

function falseValue(value,path){
  if(value!==false){
    fail('hsme_reuse_pin_approval_authority_invalid',path+' must remain false');
  }
  return false;
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_pin_approval_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_pin_approval_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

export function normalizeHsmeReusePipelineExternalPinApprovalV1(raw){
  const record=exactRecord(raw,APPROVAL_FIELDS,'approval');
  if(record.schemaVersion!==HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1_SCHEMA){
    fail('hsme_reuse_pin_approval_schema_invalid','approval schema invalid');
  }
  if(record.decision!=='APPROVED'&&record.decision!=='REJECTED'){
    fail('hsme_reuse_pin_approval_decision_invalid','approval decision invalid');
  }
  if(record.semanticEvidenceReviewed!==true){
    fail(
      'hsme_reuse_pin_approval_review_missing',
      'external approval must attest semanticEvidenceReviewed=true',
    );
  }

  return Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1_SCHEMA,
    requestSha256:hash(record.requestSha256,'approval.requestSha256'),
    requestStageId:text(record.requestStageId,'approval.requestStageId',160),
    requestedExternalPinSha256:hash(
      record.requestedExternalPinSha256,
      'approval.requestedExternalPinSha256',
    ),
    specFileSha256:hash(record.specFileSha256,'approval.specFileSha256'),
    decision:record.decision,
    approvalAuthorityId:identifier(
      record.approvalAuthorityId,
      'approval.approvalAuthorityId',
    ),
    approvalEvidenceSha256:hash(
      record.approvalEvidenceSha256,
      'approval.approvalEvidenceSha256',
    ),
    semanticEvidenceReviewed:true,
    specMutationPerformed:falseValue(
      record.specMutationPerformed,
      'approval.specMutationPerformed',
    ),
    stageExecutionAuthorized:falseValue(
      record.stageExecutionAuthorized,
      'approval.stageExecutionAuthorized',
    ),
    semanticEvidenceAuthorityGranted:falseValue(
      record.semanticEvidenceAuthorityGranted,
      'approval.semanticEvidenceAuthorityGranted',
    ),
    decisionMutationAllowed:falseValue(
      record.decisionMutationAllowed,
      'approval.decisionMutationAllowed',
    ),
    candidateSelectionAllowed:falseValue(
      record.candidateSelectionAllowed,
      'approval.candidateSelectionAllowed',
    ),
    winnerSelectionAllowed:falseValue(
      record.winnerSelectionAllowed,
      'approval.winnerSelectionAllowed',
    ),
    reuseAdvanceAllowed:falseValue(
      record.reuseAdvanceAllowed,
      'approval.reuseAdvanceAllowed',
    ),
    fullStudentEscalationAllowed:falseValue(
      record.fullStudentEscalationAllowed,
      'approval.fullStudentEscalationAllowed',
    ),
    trainingRunStartAllowed:falseValue(
      record.trainingRunStartAllowed,
      'approval.trainingRunStartAllowed',
    ),
    trainingOrDistillationAllowed:falseValue(
      record.trainingOrDistillationAllowed,
      'approval.trainingOrDistillationAllowed',
    ),
    modelInstallAllowed:falseValue(
      record.modelInstallAllowed,
      'approval.modelInstallAllowed',
    ),
    modelFleetPromotionAllowed:falseValue(
      record.modelFleetPromotionAllowed,
      'approval.modelFleetPromotionAllowed',
    ),
    productionAuthorityGranted:falseValue(
      record.productionAuthorityGranted,
      'approval.productionAuthorityGranted',
    ),
    providerAuthorityGranted:falseValue(
      record.providerAuthorityGranted,
      'approval.providerAuthorityGranted',
    ),
    billingAuthorityGranted:falseValue(
      record.billingAuthorityGranted,
      'approval.billingAuthorityGranted',
    ),
    projectArtifactMutationAllowed:falseValue(
      record.projectArtifactMutationAllowed,
      'approval.projectArtifactMutationAllowed',
    ),
    aeeExecutionAuthorityGranted:falseValue(
      record.aeeExecutionAuthorityGranted,
      'approval.aeeExecutionAuthorityGranted',
    ),
    durableModelFleetPromotionAllowed:falseValue(
      record.durableModelFleetPromotionAllowed,
      'approval.durableModelFleetPromotionAllowed',
    ),
  });
}

export function hsmeReusePipelineExternalPinApprovalV1Digest(raw){
  const approval=normalizeHsmeReusePipelineExternalPinApprovalV1(raw);
  return domainDigest(
    HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_DIGEST_DOMAIN,
    approval,
  );
}

function requestShape(raw){
  const request=object(raw,'request');
  if(request.schemaVersion!==HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_V1_SCHEMA){
    fail('hsme_reuse_pin_approval_request_schema_invalid','request schema invalid');
  }
  if(
    request.requestState!=='AWAITING_EXTERNAL_APPROVAL'
    ||request.externalApprovalRequired!==true
    ||request.pinAccepted!==false
    ||request.specMutationAllowed!==false
    ||request.externalPinCreated!==false
    ||request.semanticEvidenceAuthorityGranted!==false
  ){
    fail(
      'hsme_reuse_pin_approval_request_state_invalid',
      'request is not an unaccepted external approval checkpoint',
    );
  }
  return request;
}

function escapePointerToken(value){
  return String(value).replaceAll('~','~0').replaceAll('/','~1');
}

function resolvePatchTarget(spec,request){
  const stageId=text(request.stageId,'request.stageId',160);
  const stageKind=text(request.stageKind,'request.stageKind',64);
  if(stageKind==='CAPABILITY_PROOF'){
    if(!stageId.startsWith('capability:')){
      fail('hsme_reuse_pin_approval_patch_stage_invalid','capability stage id invalid');
    }
    const rawId=stageId.slice('capability:'.length);
    if(!Array.isArray(spec.capabilityProofs)){
      fail('hsme_reuse_pin_approval_patch_collection_invalid','capabilityProofs missing');
    }
    const indexes=spec.capabilityProofs
      .map((value,index)=>value?.stageId===rawId?index:-1)
      .filter(index=>index>=0);
    if(indexes.length!==1){
      fail(
        'hsme_reuse_pin_approval_patch_target_ambiguous',
        'capability stage must resolve exactly once in raw spec',
      );
    }
    const index=indexes[0];
    const entry=object(spec.capabilityProofs[index],'spec.capabilityProofs['+index+']');
    return Object.freeze({
      collection:'capabilityProofs',
      entryStageId:rawId,
      jsonPointer:'/capabilityProofs/'+index+'/expectedOriginIndexSha256',
      oldValue:entry.expectedOriginIndexSha256??null,
    });
  }

  if(stageKind==='CANDIDATE_ASSEMBLY'){
    if(!stageId.startsWith('assembly:')){
      fail('hsme_reuse_pin_approval_patch_stage_invalid','assembly stage id invalid');
    }
    const rawId=stageId.slice('assembly:'.length);
    if(!Array.isArray(spec.candidateAssemblies)){
      fail(
        'hsme_reuse_pin_approval_patch_collection_invalid',
        'candidateAssemblies missing',
      );
    }
    const indexes=spec.candidateAssemblies
      .map((value,index)=>value?.stageId===rawId?index:-1)
      .filter(index=>index>=0);
    if(indexes.length!==1){
      fail(
        'hsme_reuse_pin_approval_patch_target_ambiguous',
        'assembly stage must resolve exactly once in raw spec',
      );
    }
    const index=indexes[0];
    const entry=object(
      spec.candidateAssemblies[index],
      'spec.candidateAssemblies['+index+']',
    );
    return Object.freeze({
      collection:'candidateAssemblies',
      entryStageId:rawId,
      jsonPointer:'/candidateAssemblies/'+index+'/expectedOriginIndexSha256',
      oldValue:entry.expectedOriginIndexSha256??null,
    });
  }

  if(stageKind==='OUTCOME_MATERIALIZATION'&&stageId==='outcome-materialization'){
    const outcome=object(spec.outcome,'spec.outcome');
    return Object.freeze({
      collection:'outcome',
      entryStageId:'outcome-materialization',
      jsonPointer:'/outcome/expectedOriginIndexSha256',
      oldValue:outcome.expectedOriginIndexSha256??null,
    });
  }

  fail(
    'hsme_reuse_pin_approval_patch_stage_unsupported',
    'stage kind cannot receive an external pin patch',
  );
}

function patchCandidate({specLoaded,request,approval,approvalSha256,target}){
  if(target.oldValue!==null){
    fail(
      'hsme_reuse_pin_approval_patch_old_value_invalid',
      'patch target old value must remain null',
    );
  }
  const payload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_V1_SCHEMA,
    originalSpecFileSha256:specLoaded.fileSha256,
    stageId:request.stageId,
    stageKind:request.stageKind,
    collection:target.collection,
    entryStageId:target.entryStageId,
    jsonPointer:target.jsonPointer,
    oldValue:null,
    newValue:request.requestedExternalPinSha256,
    requestSha256:request.requestSha256,
    approvalSha256,
    approvalAuthorityId:approval.approvalAuthorityId,
    approvalEvidenceSha256:approval.approvalEvidenceSha256,
    patchState:'READY_FOR_EXPLICIT_APPLICATION',
    specMutationPerformed:false,
    automaticApplicationAllowed:false,
    stageExecutionAuthorized:false,
    externalPinCreated:false,
    semanticEvidenceAuthorityGranted:false,
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    winnerSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    trainingRunStartAllowed:false,
    trainingOrDistillationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
  });
  const patchCandidateSha256=domainDigest(
    HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_DIGEST_DOMAIN,
    payload,
  );
  return Object.freeze({...payload,patchCandidateSha256});
}

export async function verifyHsmeReusePipelineExternalPinApproval({
  requestPath,
  approvalPath,
  expectedApprovalSha256,
  specPath,
  manifestPath,
  digestPath,
  resumePlanPath,
  resumeDigestPath,
  receiptPaths,
  repoRoot,
}){
  if(!HEX64.test(expectedApprovalSha256||'')){
    fail(
      'hsme_reuse_pin_approval_expected_digest_invalid',
      'independent expectedApprovalSha256 is required',
    );
  }

  const [
    requestLoaded,
    approvalLoaded,
    specLoaded,
  ]=await Promise.all([
    readJson(requestPath,'pin request'),
    readJson(approvalPath,'external approval'),
    readJson(specPath,'pipeline spec'),
  ]);

  const request=requestShape(requestLoaded.value);
  const approval=normalizeHsmeReusePipelineExternalPinApprovalV1(
    approvalLoaded.value,
  );
  if(!canonicalFileBytes(approval).equals(approvalLoaded.bytes)){
    fail(
      'hsme_reuse_pin_approval_not_canonical',
      'external approval file must use canonical JSON bytes',
    );
  }
  const approvalSha256=hsmeReusePipelineExternalPinApprovalV1Digest(approval);
  if(approvalSha256!==expectedApprovalSha256){
    fail(
      'hsme_reuse_pin_approval_digest_mismatch',
      'external approval digest differs from independently supplied digest',
    );
  }

  const rebuilt=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath,
    digestPath,
    resumePlanPath,
    resumeDigestPath,
    receiptPaths,
    stageId:request.stageId,
    repoRoot,
  });
  if(!rebuilt.files.request.equals(requestLoaded.bytes)){
    fail(
      'hsme_reuse_pin_approval_request_stale',
      'supplied pin request differs from current deterministic request',
    );
  }

  if(
    request.specFileSha256!==specLoaded.fileSha256
    ||request.specFileSha256!==approval.specFileSha256
  ){
    fail(
      'hsme_reuse_pin_approval_spec_binding_drift',
      'spec raw SHA-256 differs across request, approval or current spec',
    );
  }
  if(
    approval.requestSha256!==request.requestSha256
    ||approval.requestStageId!==request.stageId
    ||approval.requestedExternalPinSha256!==request.requestedExternalPinSha256
  ){
    fail(
      'hsme_reuse_pin_approval_request_binding_drift',
      'approval differs from exact current pin request',
    );
  }

  const target=resolvePatchTarget(specLoaded.value,request);
  let patch=null;
  let verificationState;
  if(approval.decision==='APPROVED'){
    patch=patchCandidate({
      specLoaded,
      request,
      approval,
      approvalSha256,
      target,
    });
    verificationState='APPROVED_EXTERNAL_DIGEST_VERIFIED';
  }else{
    verificationState='REJECTED_EXTERNAL_DIGEST_VERIFIED';
  }

  const verificationPayload=Object.freeze({
    schemaVersion:
      HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFICATION_V1_SCHEMA,
    verificationState,
    decision:approval.decision,
    requestFileSha256:requestLoaded.fileSha256,
    requestSha256:request.requestSha256,
    approvalFileSha256:approvalLoaded.fileSha256,
    approvalSha256,
    approvalAuthorityId:approval.approvalAuthorityId,
    approvalEvidenceSha256:approval.approvalEvidenceSha256,
    specFileSha256:specLoaded.fileSha256,
    stageId:request.stageId,
    requestedExternalPinSha256:request.requestedExternalPinSha256,
    patchCandidateSha256:patch?.patchCandidateSha256??null,
    specMutationPerformed:false,
    automaticApplicationAllowed:false,
    stageExecutionAuthorized:false,
    externalPinCreated:false,
    semanticEvidenceAuthorityGranted:false,
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    winnerSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    trainingRunStartAllowed:false,
    trainingOrDistillationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
  });
  const verificationSha256=domainDigest(
    'bers:hsme:reuse-pipeline-external-pin-approval-verification:v1\0',
    verificationPayload,
  );
  const verification=Object.freeze({
    ...verificationPayload,
    verificationSha256,
  });

  return Object.freeze({
    approval,
    verification,
    patchCandidate:patch,
    files:Object.freeze({
      verification:canonicalFileBytes(verification),
      patchCandidate:patch?canonicalFileBytes(patch):null,
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const receipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_pin_approval_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt'){
      receipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_pin_approval_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--request',
    '--approval',
    '--expected-approval-sha256',
    '--spec',
    '--manifest',
    '--manifest-digest',
    '--resume-plan',
    '--resume-digest',
    '--repo-root',
    '--verification-output',
    '--patch-candidate-output',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_pin_approval_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    request:single.get('--request'),
    approval:single.get('--approval'),
    expectedApprovalSha256:single.get('--expected-approval-sha256'),
    spec:single.get('--spec'),
    manifest:single.get('--manifest'),
    manifestDigest:single.get('--manifest-digest'),
    resumePlan:single.get('--resume-plan'),
    resumeDigest:single.get('--resume-digest'),
    repoRoot:single.get('--repo-root'),
    verificationOutput:single.get('--verification-output'),
    patchCandidateOutput:single.get('--patch-candidate-output'),
    receipts:Object.freeze(receipts),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await verifyHsmeReusePipelineExternalPinApproval({
    requestPath:args.request,
    approvalPath:args.approval,
    expectedApprovalSha256:args.expectedApprovalSha256,
    specPath:args.spec,
    manifestPath:args.manifest,
    digestPath:args.manifestDigest,
    resumePlanPath:args.resumePlan,
    resumeDigestPath:args.resumeDigest,
    receiptPaths:args.receipts,
    repoRoot:args.repoRoot,
  });

  await writeFile(
    resolve(args.verificationOutput),
    result.files.verification,
    {flag:'wx'},
  );
  if(result.files.patchCandidate){
    await writeFile(
      resolve(args.patchCandidateOutput),
      result.files.patchCandidate,
      {flag:'wx'},
    );
  }

  process.stdout.write(JSON.stringify({
    schemaVersion:
      HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFICATION_V1_SCHEMA,
    verificationState:result.verification.verificationState,
    approvalSha256:result.verification.approvalSha256,
    patchCandidateSha256:result.verification.patchCandidateSha256,
    specMutationPerformed:false,
    automaticApplicationAllowed:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFIER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_pin_approval_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

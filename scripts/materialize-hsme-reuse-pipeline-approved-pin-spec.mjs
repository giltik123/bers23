#!/usr/bin/env node
import {access, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  canonicalFileBytes,
  canonicalValue,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFICATION_V1_SCHEMA,
  HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_V1_SCHEMA,
  verifyHsmeReusePipelineExternalPinApproval,
} from './verify-hsme-reuse-pipeline-external-pin-approval.mjs';

export const HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1';
export const HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-spec-pin-application:v1\0';

const HEX64=/^[0-9a-f]{64}$/;

export class HsmeReusePipelineApprovedPinSpecMaterializerError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineApprovedPinSpecMaterializerError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineApprovedPinSpecMaterializerError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_pin_apply_record_invalid',path+' must be an object');
  }
  return value;
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
    fail('hsme_reuse_pin_apply_text_invalid',path+' is invalid');
  }
  return value;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_pin_apply_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_pin_apply_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_pin_apply_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

async function exists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    fail('hsme_reuse_pin_apply_access_failed',path+': '+error.message);
  }
}

function escapePointer(value){
  return String(value).replaceAll('~','~0').replaceAll('/','~1');
}

function semanticDiffPaths(left,right,path=''){
  if(Object.is(left,right))return [];
  const leftArray=Array.isArray(left);
  const rightArray=Array.isArray(right);
  if(leftArray||rightArray){
    if(!leftArray||!rightArray||left.length!==right.length){
      return [path||'/'];
    }
    const out=[];
    for(let index=0;index<left.length;index+=1){
      out.push(...semanticDiffPaths(
        left[index],
        right[index],
        path+'/'+index,
      ));
    }
    return out;
  }
  const leftObject=left!==null&&typeof left==='object';
  const rightObject=right!==null&&typeof right==='object';
  if(leftObject||rightObject){
    if(!leftObject||!rightObject)return [path||'/'];
    const keys=[...new Set([...Object.keys(left),...Object.keys(right)])].sort();
    const out=[];
    for(const key of keys){
      if(!Object.hasOwn(left,key)||!Object.hasOwn(right,key)){
        out.push(path+'/'+escapePointer(key));
        continue;
      }
      out.push(...semanticDiffPaths(
        left[key],
        right[key],
        path+'/'+escapePointer(key),
      ));
    }
    return out;
  }
  return [path||'/'];
}

function resolvePatchTarget(spec,patch){
  const collection=text(patch.collection,'patch.collection',64);
  const entryStageId=text(patch.entryStageId,'patch.entryStageId',160);
  const pointer=text(patch.jsonPointer,'patch.jsonPointer',512);

  if(collection==='capabilityProofs'){
    if(!Array.isArray(spec.capabilityProofs)){
      fail('hsme_reuse_pin_apply_collection_invalid','capabilityProofs missing');
    }
    const indexes=spec.capabilityProofs
      .map((value,index)=>value?.stageId===entryStageId?index:-1)
      .filter(index=>index>=0);
    if(indexes.length!==1){
      fail('hsme_reuse_pin_apply_target_ambiguous','capability patch target ambiguous');
    }
    const index=indexes[0];
    const expected='/capabilityProofs/'+index+'/expectedOriginIndexSha256';
    if(pointer!==expected){
      fail('hsme_reuse_pin_apply_pointer_mismatch','capability patch pointer drift');
    }
    const entry=object(spec.capabilityProofs[index],'spec.capabilityProofs['+index+']');
    return Object.freeze({collection,index,entry,pointer:expected});
  }

  if(collection==='candidateAssemblies'){
    if(!Array.isArray(spec.candidateAssemblies)){
      fail('hsme_reuse_pin_apply_collection_invalid','candidateAssemblies missing');
    }
    const indexes=spec.candidateAssemblies
      .map((value,index)=>value?.stageId===entryStageId?index:-1)
      .filter(index=>index>=0);
    if(indexes.length!==1){
      fail('hsme_reuse_pin_apply_target_ambiguous','assembly patch target ambiguous');
    }
    const index=indexes[0];
    const expected='/candidateAssemblies/'+index+'/expectedOriginIndexSha256';
    if(pointer!==expected){
      fail('hsme_reuse_pin_apply_pointer_mismatch','assembly patch pointer drift');
    }
    const entry=object(
      spec.candidateAssemblies[index],
      'spec.candidateAssemblies['+index+']',
    );
    return Object.freeze({collection,index,entry,pointer:expected});
  }

  if(collection==='outcome'){
    if(entryStageId!=='outcome-materialization'){
      fail('hsme_reuse_pin_apply_target_invalid','outcome stage id invalid');
    }
    const entry=object(spec.outcome,'spec.outcome');
    const expected='/outcome/expectedOriginIndexSha256';
    if(pointer!==expected){
      fail('hsme_reuse_pin_apply_pointer_mismatch','outcome patch pointer drift');
    }
    return Object.freeze({collection,index:null,entry,pointer:expected});
  }

  fail('hsme_reuse_pin_apply_collection_unsupported','unsupported patch collection');
}

function applyTarget(spec,target,newValue){
  const output=structuredClone(spec);
  if(target.collection==='capabilityProofs'){
    output.capabilityProofs[target.index].expectedOriginIndexSha256=newValue;
  }else if(target.collection==='candidateAssemblies'){
    output.candidateAssemblies[target.index].expectedOriginIndexSha256=newValue;
  }else{
    output.outcome.expectedOriginIndexSha256=newValue;
  }
  return output;
}

function requireVerifiedArtifacts(verification,patch){
  const v=object(verification,'verification');
  const p=object(patch,'patchCandidate');
  if(
    v.schemaVersion!==
      HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_VERIFICATION_V1_SCHEMA
    ||v.verificationState!=='APPROVED_EXTERNAL_DIGEST_VERIFIED'
    ||v.decision!=='APPROVED'
  ){
    fail(
      'hsme_reuse_pin_apply_verification_not_approved',
      'verification must be independently verified APPROVED',
    );
  }
  if(
    p.schemaVersion!==HSME_REUSE_PIPELINE_SPEC_PIN_PATCH_CANDIDATE_V1_SCHEMA
    ||p.patchState!=='READY_FOR_EXPLICIT_APPLICATION'
  ){
    fail(
      'hsme_reuse_pin_apply_patch_not_ready',
      'patch candidate is not READY_FOR_EXPLICIT_APPLICATION',
    );
  }
  if(
    v.patchCandidateSha256!==p.patchCandidateSha256
    ||v.requestSha256!==p.requestSha256
    ||v.approvalSha256!==p.approvalSha256
    ||v.stageId!==p.stageId
  ){
    fail(
      'hsme_reuse_pin_apply_artifact_binding_drift',
      'verification and patch candidate bindings differ',
    );
  }
  if(
    v.specMutationPerformed!==false
    ||v.automaticApplicationAllowed!==false
    ||v.stageExecutionAuthorized!==false
    ||v.externalPinCreated!==false
    ||p.specMutationPerformed!==false
    ||p.automaticApplicationAllowed!==false
    ||p.stageExecutionAuthorized!==false
    ||p.externalPinCreated!==false
  ){
    fail(
      'hsme_reuse_pin_apply_input_authority_invalid',
      'verification or patch candidate already claims application authority',
    );
  }
}

export async function materializeHsmeReusePipelineApprovedPinSpec({
  sourceSpecPath,
  requestPath,
  approvalPath,
  expectedApprovalSha256,
  verificationPath,
  patchCandidatePath,
  manifestPath,
  digestPath,
  resumePlanPath,
  resumeDigestPath,
  receiptPaths,
  repoRoot,
  outputSpecPath,
  applicationPath,
}){
  const sourcePath=resolve(sourceSpecPath);
  const outputPath=resolve(outputSpecPath);
  const recordPath=resolve(applicationPath);
  if(outputPath===sourcePath){
    fail(
      'hsme_reuse_pin_apply_source_overwrite_forbidden',
      'output spec path must differ from source spec path',
    );
  }
  if(recordPath===sourcePath||recordPath===outputPath){
    fail(
      'hsme_reuse_pin_apply_output_collision',
      'application/spec paths must be distinct',
    );
  }
  if(await exists(outputPath)||await exists(recordPath)){
    fail(
      'hsme_reuse_pin_apply_output_exists',
      'output spec and application paths must not already exist',
    );
  }

  const [
    sourceSpec,
    suppliedVerification,
    suppliedPatch,
  ]=await Promise.all([
    readJson(sourcePath,'source spec'),
    readJson(verificationPath,'approval verification'),
    readJson(patchCandidatePath,'patch candidate'),
  ]);
  requireVerifiedArtifacts(
    suppliedVerification.value,
    suppliedPatch.value,
  );

  const reverified=await verifyHsmeReusePipelineExternalPinApproval({
    requestPath,
    approvalPath,
    expectedApprovalSha256,
    specPath:sourcePath,
    manifestPath,
    digestPath,
    resumePlanPath,
    resumeDigestPath,
    receiptPaths,
    repoRoot,
  });
  if(!reverified.files.verification.equals(suppliedVerification.bytes)){
    fail(
      'hsme_reuse_pin_apply_verification_stale',
      'supplied approval verification differs from current revalidation',
    );
  }
  if(
    !reverified.files.patchCandidate
    ||!reverified.files.patchCandidate.equals(suppliedPatch.bytes)
  ){
    fail(
      'hsme_reuse_pin_apply_patch_stale',
      'supplied patch candidate differs from current revalidation',
    );
  }

  const patch=reverified.patchCandidate;
  if(sourceSpec.fileSha256!==patch.originalSpecFileSha256){
    fail(
      'hsme_reuse_pin_apply_source_spec_drift',
      'source spec raw SHA differs from approved patch source',
    );
  }
  if(patch.oldValue!==null){
    fail(
      'hsme_reuse_pin_apply_old_value_invalid',
      'approved patch old value must be null',
    );
  }
  const newValue=hash(patch.newValue,'patch.newValue');
  if(newValue!==reverified.verification.requestedExternalPinSha256){
    fail(
      'hsme_reuse_pin_apply_new_value_drift',
      'patch new value differs from approved external pin digest',
    );
  }

  const target=resolvePatchTarget(sourceSpec.value,patch);
  if((target.entry.expectedOriginIndexSha256??null)!==null){
    fail(
      'hsme_reuse_pin_apply_target_already_pinned',
      'source spec target is no longer null',
    );
  }

  const outputSpec=applyTarget(sourceSpec.value,target,newValue);
  const differences=semanticDiffPaths(sourceSpec.value,outputSpec);
  if(differences.length!==1||differences[0]!==target.pointer){
    fail(
      'hsme_reuse_pin_apply_semantic_diff_invalid',
      'materialized spec must change exactly the approved JSON pointer',
    );
  }
  const outputSpecBytes=canonicalFileBytes(outputSpec);
  const reparsed=JSON.parse(outputSpecBytes.toString('utf8'));
  const reparsedDiff=semanticDiffPaths(sourceSpec.value,reparsed);
  if(reparsedDiff.length!==1||reparsedDiff[0]!==target.pointer){
    fail(
      'hsme_reuse_pin_apply_reparse_diff_invalid',
      'reparsed output spec semantic diff is not exactly the approved target',
    );
  }
  const reparsedTarget=resolvePatchTarget(reparsed,patch);
  if(reparsedTarget.entry.expectedOriginIndexSha256!==newValue){
    fail(
      'hsme_reuse_pin_apply_output_pin_invalid',
      'output spec does not contain exact approved pin digest',
    );
  }

  const outputSpecFileSha256=sha256Bytes(outputSpecBytes);
  const applicationPayload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA,
    applicationState:'PIN_MATERIALIZED_NEW_SPEC',
    sourceSpecPath:sourcePath,
    sourceSpecFileSha256:sourceSpec.fileSha256,
    outputSpecPath:outputPath,
    outputSpecFileSha256,
    requestSha256:reverified.verification.requestSha256,
    approvalSha256:reverified.verification.approvalSha256,
    patchCandidateSha256:patch.patchCandidateSha256,
    stageId:patch.stageId,
    stageKind:patch.stageKind,
    jsonPointer:target.pointer,
    appliedExternalPinSha256:newValue,
    sourceSpecMutated:false,
    replanRequired:true,
    automaticContinuationAllowed:false,
    stageExecutionAuthorized:false,
    externalPinCreated:true,
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
  const applicationSha256=domainDigest(
    HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN,
    applicationPayload,
  );
  const application=Object.freeze({
    ...applicationPayload,
    applicationSha256,
  });

  return Object.freeze({
    outputSpec,
    application,
    files:Object.freeze({
      outputSpec:outputSpecBytes,
      application:canonicalFileBytes(application),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const receipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_pin_apply_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt'){
      receipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_pin_apply_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--source-spec',
    '--request',
    '--approval',
    '--expected-approval-sha256',
    '--verification',
    '--patch-candidate',
    '--manifest',
    '--manifest-digest',
    '--resume-plan',
    '--resume-digest',
    '--repo-root',
    '--output-spec',
    '--application-output',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_pin_apply_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    sourceSpec:single.get('--source-spec'),
    request:single.get('--request'),
    approval:single.get('--approval'),
    expectedApprovalSha256:single.get('--expected-approval-sha256'),
    verification:single.get('--verification'),
    patchCandidate:single.get('--patch-candidate'),
    manifest:single.get('--manifest'),
    manifestDigest:single.get('--manifest-digest'),
    resumePlan:single.get('--resume-plan'),
    resumeDigest:single.get('--resume-digest'),
    repoRoot:single.get('--repo-root'),
    outputSpec:single.get('--output-spec'),
    applicationOutput:single.get('--application-output'),
    receipts:Object.freeze(receipts),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await materializeHsmeReusePipelineApprovedPinSpec({
    sourceSpecPath:args.sourceSpec,
    requestPath:args.request,
    approvalPath:args.approval,
    expectedApprovalSha256:args.expectedApprovalSha256,
    verificationPath:args.verification,
    patchCandidatePath:args.patchCandidate,
    manifestPath:args.manifest,
    digestPath:args.manifestDigest,
    resumePlanPath:args.resumePlan,
    resumeDigestPath:args.resumeDigest,
    receiptPaths:args.receipts,
    repoRoot:args.repoRoot,
    outputSpecPath:args.outputSpec,
    applicationPath:args.applicationOutput,
  });

  await writeFile(
    resolve(args.outputSpec),
    result.files.outputSpec,
    {flag:'wx'},
  );
  await writeFile(
    resolve(args.applicationOutput),
    result.files.application,
    {flag:'wx'},
  );

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA,
    applicationState:result.application.applicationState,
    outputSpecFileSha256:result.application.outputSpecFileSha256,
    appliedExternalPinSha256:result.application.appliedExternalPinSha256,
    applicationSha256:result.application.applicationSha256,
    sourceSpecMutated:false,
    replanRequired:true,
    automaticContinuationAllowed:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_APPROVED_PIN_SPEC_MATERIALIZER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_pin_apply_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
  bindStageInputs,
  findStage,
  loadVerifiedManifest,
  readRepositoryIdentity,
  validateRepoRuntime,
  validateStageProgram,
} from './run-hsme-reuse-pipeline-stage.mjs';

export const HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1';
export const HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-receipt-carry-forward:v1\0';

const HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1';
const HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-spec-pin-application:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const GIT_OID=/^[0-9a-f]{40,64}$/;

const RECEIPT_FIELDS=Object.freeze([
  'schemaVersion',
  'manifestSha256',
  'manifestFileSha256',
  'specFileSha256',
  'stageId',
  'stageKind',
  'argvSha256',
  'stageDefinitionSha256',
  'repositoryCommitSha',
  'trackedTreeClean',
  'stageScriptSha256',
  'nodeResolutionHookSha256',
  'inputs',
  'stdoutSha256',
  'stderrSha256',
  'stdoutBytes',
  'stderrBytes',
  'outputs',
  'executionState',
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
  'receiptSha256',
]);

const APPLICATION_FIELDS=Object.freeze([
  'schemaVersion',
  'applicationState',
  'sourceSpecPath',
  'sourceSpecFileSha256',
  'outputSpecPath',
  'outputSpecFileSha256',
  'requestSha256',
  'approvalSha256',
  'patchCandidateSha256',
  'stageId',
  'stageKind',
  'jsonPointer',
  'appliedExternalPinSha256',
  'sourceSpecMutated',
  'replanRequired',
  'automaticContinuationAllowed',
  'stageExecutionAuthorized',
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
  'applicationSha256',
]);

export class HsmeReusePipelineReceiptCarryForwardError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineReceiptCarryForwardError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineReceiptCarryForwardError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_carry_record_invalid',path+' must be an object');
  }
  return value;
}

function exactRecord(value,fields,path){
  const record=object(value,path);
  const actual=Object.keys(record).sort();
  const expected=[...fields].sort();
  if(
    actual.length!==expected.length
    ||actual.some((key,index)=>key!==expected[index])
  ){
    fail('hsme_reuse_carry_shape_invalid',path+' fields differ from exact schema');
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
    fail('hsme_reuse_carry_text_invalid',path+' is invalid');
  }
  return value;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_carry_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

function gitOid(value,path){
  const result=text(value,path,64);
  if(!GIT_OID.test(result)){
    fail('hsme_reuse_carry_git_oid_invalid',path+' must be lowercase git oid');
  }
  return result;
}

function integer(value,path){
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_reuse_carry_integer_invalid',path+' must be a non-negative safe integer');
  }
  return value;
}

function array(value,path,max=256){
  if(!Array.isArray(value)||value.length>max){
    fail('hsme_reuse_carry_array_invalid',path+' must be a bounded array');
  }
  return value;
}

function requireFalseBoundary(value,label){
  const record=object(value,label);
  for(const field of [
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
  ]){
    if(record[field]!==false){
      fail('hsme_reuse_carry_authority_invalid',label+'.'+field+' must remain false');
    }
  }
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_carry_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_carry_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

function normalizeBindings(value,path,{outputs=false}={}){
  const entries=array(value,path,256).map((raw,index)=>{
    const entry=object(raw,path+'['+index+']');
    const expected=outputs
      ?['path','fileSha256','bytes']
      :['path','fileSha256'];
    const keys=Object.keys(entry).sort();
    if(keys.length!==expected.length||keys.some((key,i)=>key!==[...expected].sort()[i])){
      fail('hsme_reuse_carry_binding_shape_invalid',path+'['+index+'] shape invalid');
    }
    const normalized={
      path:resolve(text(entry.path,path+'['+index+'].path')),
      fileSha256:hash(entry.fileSha256,path+'['+index+'].fileSha256'),
    };
    if(outputs)normalized.bytes=integer(entry.bytes,path+'['+index+'].bytes');
    return Object.freeze(normalized);
  });
  if(new Set(entries.map(value=>value.path)).size!==entries.length){
    fail('hsme_reuse_carry_binding_duplicate',path+' paths must be unique');
  }
  return Object.freeze(entries);
}

function normalizeReceipt(raw){
  const receipt=exactRecord(raw,RECEIPT_FIELDS,'receipt');
  if(receipt.schemaVersion!==HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA){
    fail('hsme_reuse_carry_receipt_schema_invalid','carry-forward requires exact V2 receipt');
  }
  if(
    receipt.executionState!=='SUCCEEDED'
    ||receipt.outputTrustState!=='OBSERVED_NOT_PIN_AUTHORITY'
    ||receipt.externalPinCreated!==false
    ||receipt.trackedTreeClean!==true
  ){
    fail('hsme_reuse_carry_receipt_state_invalid','source receipt state is not carry-forward eligible');
  }
  requireFalseBoundary(receipt,'receipt');
  return Object.freeze({
    ...receipt,
    manifestSha256:hash(receipt.manifestSha256,'receipt.manifestSha256'),
    manifestFileSha256:hash(receipt.manifestFileSha256,'receipt.manifestFileSha256'),
    specFileSha256:hash(receipt.specFileSha256,'receipt.specFileSha256'),
    stageId:text(receipt.stageId,'receipt.stageId',160),
    stageKind:text(receipt.stageKind,'receipt.stageKind',64),
    argvSha256:hash(receipt.argvSha256,'receipt.argvSha256'),
    stageDefinitionSha256:hash(receipt.stageDefinitionSha256,'receipt.stageDefinitionSha256'),
    repositoryCommitSha:gitOid(receipt.repositoryCommitSha,'receipt.repositoryCommitSha'),
    stageScriptSha256:hash(receipt.stageScriptSha256,'receipt.stageScriptSha256'),
    nodeResolutionHookSha256:hash(
      receipt.nodeResolutionHookSha256,
      'receipt.nodeResolutionHookSha256',
    ),
    inputs:normalizeBindings(receipt.inputs,'receipt.inputs'),
    stdoutSha256:hash(receipt.stdoutSha256,'receipt.stdoutSha256'),
    stderrSha256:hash(receipt.stderrSha256,'receipt.stderrSha256'),
    stdoutBytes:integer(receipt.stdoutBytes,'receipt.stdoutBytes'),
    stderrBytes:integer(receipt.stderrBytes,'receipt.stderrBytes'),
    outputs:normalizeBindings(receipt.outputs,'receipt.outputs',{outputs:true}),
    receiptSha256:hash(receipt.receiptSha256,'receipt.receiptSha256'),
  });
}

function receiptPayload(receipt){
  const payload={...receipt};
  delete payload.receiptSha256;
  return payload;
}

function applicationPayload(application){
  const payload={...application};
  delete payload.applicationSha256;
  return payload;
}

function normalizeApplication(raw){
  const application=exactRecord(raw,APPLICATION_FIELDS,'application');
  if(
    application.schemaVersion!==HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA
    ||application.applicationState!=='PIN_MATERIALIZED_NEW_SPEC'
    ||application.sourceSpecMutated!==false
    ||application.replanRequired!==true
    ||application.automaticContinuationAllowed!==false
    ||application.stageExecutionAuthorized!==false
    ||application.externalPinCreated!==true
  ){
    fail('hsme_reuse_carry_application_state_invalid','pin application state invalid');
  }
  requireFalseBoundary(application,'application');
  return Object.freeze({
    ...application,
    sourceSpecPath:resolve(text(application.sourceSpecPath,'application.sourceSpecPath')),
    sourceSpecFileSha256:hash(
      application.sourceSpecFileSha256,
      'application.sourceSpecFileSha256',
    ),
    outputSpecPath:resolve(text(application.outputSpecPath,'application.outputSpecPath')),
    outputSpecFileSha256:hash(
      application.outputSpecFileSha256,
      'application.outputSpecFileSha256',
    ),
    requestSha256:hash(application.requestSha256,'application.requestSha256'),
    approvalSha256:hash(application.approvalSha256,'application.approvalSha256'),
    patchCandidateSha256:hash(
      application.patchCandidateSha256,
      'application.patchCandidateSha256',
    ),
    stageId:text(application.stageId,'application.stageId',160),
    stageKind:text(application.stageKind,'application.stageKind',64),
    jsonPointer:text(application.jsonPointer,'application.jsonPointer',512),
    appliedExternalPinSha256:hash(
      application.appliedExternalPinSha256,
      'application.appliedExternalPinSha256',
    ),
    applicationSha256:hash(application.applicationSha256,'application.applicationSha256'),
  });
}

function escapePointer(value){
  return String(value).replaceAll('~','~0').replaceAll('/','~1');
}

function semanticDiffPaths(left,right,path=''){
  if(Object.is(left,right))return [];
  const la=Array.isArray(left);
  const ra=Array.isArray(right);
  if(la||ra){
    if(!la||!ra||left.length!==right.length)return [path||'/'];
    const out=[];
    for(let index=0;index<left.length;index+=1){
      out.push(...semanticDiffPaths(left[index],right[index],path+'/'+index));
    }
    return out;
  }
  const lo=left!==null&&typeof left==='object';
  const ro=right!==null&&typeof right==='object';
  if(lo||ro){
    if(!lo||!ro)return [path||'/'];
    const keys=[...new Set([...Object.keys(left),...Object.keys(right)])].sort();
    const out=[];
    for(const key of keys){
      if(!Object.hasOwn(left,key)||!Object.hasOwn(right,key)){
        out.push(path+'/'+escapePointer(key));
      }else{
        out.push(...semanticDiffPaths(left[key],right[key],path+'/'+escapePointer(key)));
      }
    }
    return out;
  }
  return [path||'/'];
}

function pointerValue(root,pointer){
  if(!pointer.startsWith('/')){
    fail('hsme_reuse_carry_pointer_invalid','application pointer must be JSON pointer');
  }
  let current=root;
  for(const token of pointer.slice(1).split('/')){
    const key=token.replaceAll('~1','/').replaceAll('~0','~');
    if(current===null||typeof current!=='object'||!Object.hasOwn(current,key)){
      fail('hsme_reuse_carry_pointer_missing','application pointer does not resolve');
    }
    current=current[key];
  }
  return current;
}

function derivePatchedStage(spec,pointer){
  const parts=pointer.split('/').slice(1).map(
    token=>token.replaceAll('~1','/').replaceAll('~0','~'),
  );
  if(parts[0]==='capabilityProofs'&&parts.length===3&&parts[2]==='expectedOriginIndexSha256'){
    const index=Number(parts[1]);
    const entry=spec.capabilityProofs?.[index];
    if(!Number.isSafeInteger(index)||!entry?.stageId){
      fail('hsme_reuse_carry_pointer_stage_invalid','capability pointer stage invalid');
    }
    return Object.freeze({
      stageId:'capability:'+entry.stageId,
      stageKind:'CAPABILITY_PROOF',
    });
  }
  if(parts[0]==='candidateAssemblies'&&parts.length===3&&parts[2]==='expectedOriginIndexSha256'){
    const index=Number(parts[1]);
    const entry=spec.candidateAssemblies?.[index];
    if(!Number.isSafeInteger(index)||!entry?.stageId){
      fail('hsme_reuse_carry_pointer_stage_invalid','assembly pointer stage invalid');
    }
    return Object.freeze({
      stageId:'assembly:'+entry.stageId,
      stageKind:'CANDIDATE_ASSEMBLY',
    });
  }
  if(
    parts.length===2
    &&parts[0]==='outcome'
    &&parts[1]==='expectedOriginIndexSha256'
  ){
    return Object.freeze({
      stageId:'outcome-materialization',
      stageKind:'OUTCOME_MATERIALIZATION',
    });
  }
  fail('hsme_reuse_carry_pointer_stage_unsupported','pin application pointer unsupported');
}

function transitiveDependsOn(manifest,stageId,targetId){
  const stages=array(manifest.stages,'manifest.stages',128);
  const byId=new Map(stages.map(stage=>[stage.stageId,stage]));
  const seen=new Set();
  const visit=id=>{
    if(seen.has(id))return false;
    seen.add(id);
    const stage=byId.get(id);
    if(!stage)return false;
    for(const dependency of array(stage.dependencies,'stage.dependencies',128)){
      if(dependency===targetId||visit(dependency))return true;
    }
    return false;
  };
  return visit(stageId);
}

async function validateReceiptOutputs(receipt){
  for(const output of receipt.outputs){
    const loaded=await readFile(output.path).catch(error=>{
      fail('hsme_reuse_carry_output_read_failed',output.path+': '+error.message);
    });
    if(
      loaded.length!==output.bytes
      ||sha256Bytes(loaded)!==output.fileSha256
    ){
      fail('hsme_reuse_carry_output_drift','receipt output bytes changed: '+output.path);
    }
    try{
      JSON.parse(loaded.toString('utf8'));
    }catch(error){
      fail('hsme_reuse_carry_output_json_invalid',output.path+': '+error.message);
    }
  }
}

async function verifySourceReceipt({
  loadedReceipt,
  sourceManifest,
  repository,
  repoRoot,
}){
  if(!canonicalFileBytes(loadedReceipt.value).equals(loadedReceipt.bytes)){
    fail('hsme_reuse_carry_receipt_not_canonical','source receipt bytes are not canonical');
  }
  const receipt=normalizeReceipt(loadedReceipt.value);
  const receiptSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
    receiptPayload(receipt),
  );
  if(receiptSha256!==receipt.receiptSha256){
    fail('hsme_reuse_carry_receipt_digest_mismatch','source receipt self digest mismatch');
  }
  if(
    receipt.manifestSha256!==sourceManifest.manifestSha256
    ||receipt.manifestFileSha256!==sourceManifest.manifestFileSha256
    ||receipt.specFileSha256!==sourceManifest.manifest.specFileSha256
  ){
    fail('hsme_reuse_carry_receipt_manifest_drift','source receipt manifest/spec binding drift');
  }
  if(receipt.repositoryCommitSha!==repository.repositoryCommitSha){
    fail('hsme_reuse_carry_repository_commit_drift','source receipt repository commit drift');
  }

  const stage=findStage(sourceManifest.manifest,receipt.stageId);
  if(stage.kind!==receipt.stageKind||stage.status!=='READY'||stage.localStatus!=='READY'){
    fail('hsme_reuse_carry_source_stage_invalid','source receipt stage is not READY and matching');
  }
  const program=validateStageProgram(stage);
  const runtime=await validateRepoRuntime(repoRoot,program.allowed.script);
  if(
    runtime.repositoryCommitSha!==repository.repositoryCommitSha
    ||runtime.trackedTreeClean!==true
    ||runtime.scriptSha256!==receipt.stageScriptSha256
    ||runtime.hookSha256!==receipt.nodeResolutionHookSha256
  ){
    fail('hsme_reuse_carry_runtime_code_drift','source receipt runtime code binding drift');
  }

  const inputs=bindStageInputs(sourceManifest.manifest,stage);
  if(JSON.stringify(inputs)!==JSON.stringify(receipt.inputs)){
    fail('hsme_reuse_carry_source_input_drift','source receipt inputs differ from source manifest');
  }
  const argvSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
    {stageId:stage.stageId,kind:stage.kind,env:stage.env,argv:stage.argv},
  );
  const stageDefinitionSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
    {
      stageId:stage.stageId,
      kind:stage.kind,
      env:stage.env,
      argv:stage.argv,
      inputs,
      outputs:stage.outputs,
    },
  );
  if(
    argvSha256!==receipt.argvSha256
    ||stageDefinitionSha256!==receipt.stageDefinitionSha256
  ){
    fail('hsme_reuse_carry_source_definition_drift','source stage definition differs from receipt');
  }
  const outputPaths=array(stage.outputs,'stage.outputs',64).map(value=>resolve(value));
  if(
    outputPaths.length!==receipt.outputs.length
    ||outputPaths.some((path,index)=>path!==receipt.outputs[index].path)
  ){
    fail('hsme_reuse_carry_source_output_set_drift','source receipt output set drift');
  }
  await validateReceiptOutputs(receipt);
  return Object.freeze({receipt,stage,inputs,argvSha256,stageDefinitionSha256});
}

async function computeCarryForward({
  sourceManifestPath,
  sourceDigestPath,
  sourceReceiptPath,
  pinApplicationPath,
  sourceSpecPath,
  outputSpecPath,
  currentManifestPath,
  currentDigestPath,
  repoRoot,
}){
  const [
    sourceManifest,
    currentManifest,
    loadedReceipt,
    loadedApplication,
    sourceSpec,
    outputSpec,
  ]=await Promise.all([
    loadVerifiedManifest(resolve(sourceManifestPath),resolve(sourceDigestPath)),
    loadVerifiedManifest(resolve(currentManifestPath),resolve(currentDigestPath)),
    readJson(sourceReceiptPath,'source receipt'),
    readJson(pinApplicationPath,'pin application'),
    readJson(sourceSpecPath,'source spec'),
    readJson(outputSpecPath,'output spec'),
  ]);

  const repository=await readRepositoryIdentity(resolve(repoRoot));
  if(repository.trackedTreeClean!==true){
    fail('hsme_reuse_carry_repository_dirty','tracked repository tree is dirty');
  }

  const application=normalizeApplication(loadedApplication.value);
  if(!canonicalFileBytes(application).equals(loadedApplication.bytes)){
    fail('hsme_reuse_carry_application_not_canonical','pin application bytes are not canonical');
  }
  const applicationSha256=domainDigest(
    HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN,
    applicationPayload(application),
  );
  if(applicationSha256!==application.applicationSha256){
    fail('hsme_reuse_carry_application_digest_mismatch','pin application self digest mismatch');
  }

  if(
    resolve(sourceSpecPath)!==application.sourceSpecPath
    ||resolve(outputSpecPath)!==application.outputSpecPath
    ||sourceSpec.fileSha256!==application.sourceSpecFileSha256
    ||outputSpec.fileSha256!==application.outputSpecFileSha256
  ){
    fail('hsme_reuse_carry_application_spec_binding_drift','pin application spec path/SHA binding drift');
  }
  if(
    sourceManifest.manifest.specFileSha256!==sourceSpec.fileSha256
    ||currentManifest.manifest.specFileSha256!==outputSpec.fileSha256
  ){
    fail('hsme_reuse_carry_manifest_spec_binding_drift','old/new manifest spec binding drift');
  }
  if(!canonicalFileBytes(outputSpec.value).equals(outputSpec.bytes)){
    fail('hsme_reuse_carry_output_spec_not_canonical','materialized output spec must be canonical');
  }

  const diff=semanticDiffPaths(sourceSpec.value,outputSpec.value);
  if(diff.length!==1||diff[0]!==application.jsonPointer){
    fail('hsme_reuse_carry_spec_diff_invalid','old/new spec diff is not exactly approved pin pointer');
  }
  if(pointerValue(sourceSpec.value,application.jsonPointer)!==null){
    fail('hsme_reuse_carry_source_pin_not_null','source spec approved pin target must be null');
  }
  if(pointerValue(outputSpec.value,application.jsonPointer)!==application.appliedExternalPinSha256){
    fail('hsme_reuse_carry_output_pin_drift','output spec does not contain applied external pin');
  }

  const patched=derivePatchedStage(sourceSpec.value,application.jsonPointer);
  if(
    patched.stageId!==application.stageId
    ||patched.stageKind!==application.stageKind
  ){
    fail('hsme_reuse_carry_patched_stage_binding_drift','pin application stage binding drift');
  }

  const source=await verifySourceReceipt({
    loadedReceipt,
    sourceManifest,
    repository,
    repoRoot:resolve(repoRoot),
  });
  if(source.receipt.stageId===patched.stageId){
    fail('hsme_reuse_carry_patched_stage_forbidden','patched stage cannot be carried forward');
  }

  const currentStage=findStage(currentManifest.manifest,source.receipt.stageId);
  if(
    currentStage.kind!==source.receipt.stageKind
    ||currentStage.status!=='READY'
    ||currentStage.localStatus!=='READY'
  ){
    fail('hsme_reuse_carry_current_stage_invalid','carried stage is not READY under new manifest');
  }
  if(transitiveDependsOn(currentManifest.manifest,currentStage.stageId,patched.stageId)){
    fail(
      'hsme_reuse_carry_patched_dependency_forbidden',
      'stage transitively depends on the newly patched stage',
    );
  }

  const currentProgram=validateStageProgram(currentStage);
  const currentRuntime=await validateRepoRuntime(repoRoot,currentProgram.allowed.script);
  if(
    currentRuntime.repositoryCommitSha!==source.receipt.repositoryCommitSha
    ||currentRuntime.scriptSha256!==source.receipt.stageScriptSha256
    ||currentRuntime.hookSha256!==source.receipt.nodeResolutionHookSha256
  ){
    fail('hsme_reuse_carry_current_runtime_drift','new manifest runtime code differs from source receipt');
  }

  const currentInputs=bindStageInputs(currentManifest.manifest,currentStage);
  const currentArgvSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
    {
      stageId:currentStage.stageId,
      kind:currentStage.kind,
      env:currentStage.env,
      argv:currentStage.argv,
    },
  );
  const currentStageDefinitionSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
    {
      stageId:currentStage.stageId,
      kind:currentStage.kind,
      env:currentStage.env,
      argv:currentStage.argv,
      inputs:currentInputs,
      outputs:currentStage.outputs,
    },
  );
  if(
    currentArgvSha256!==source.receipt.argvSha256
    ||currentStageDefinitionSha256!==source.receipt.stageDefinitionSha256
    ||JSON.stringify(currentInputs)!==JSON.stringify(source.receipt.inputs)
  ){
    fail('hsme_reuse_carry_current_definition_drift','new manifest stage definition/input binding drift');
  }
  const currentOutputPaths=array(currentStage.outputs,'currentStage.outputs',64).map(value=>resolve(value));
  if(
    currentOutputPaths.length!==source.receipt.outputs.length
    ||currentOutputPaths.some((path,index)=>path!==source.receipt.outputs[index].path)
  ){
    fail('hsme_reuse_carry_current_output_set_drift','new manifest output paths differ from source receipt');
  }
  await validateReceiptOutputs(source.receipt);

  const payload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1_SCHEMA,
    carryForwardState:'UNCHANGED_STAGE_OBSERVED',
    sourceManifestPath:resolve(sourceManifestPath),
    sourceManifestDigestPath:resolve(sourceDigestPath),
    sourceManifestSha256:sourceManifest.manifestSha256,
    sourceManifestFileSha256:sourceManifest.manifestFileSha256,
    sourceSpecPath:resolve(sourceSpecPath),
    sourceSpecFileSha256:sourceSpec.fileSha256,
    currentManifestPath:resolve(currentManifestPath),
    currentManifestSha256:currentManifest.manifestSha256,
    currentManifestFileSha256:currentManifest.manifestFileSha256,
    currentSpecPath:resolve(outputSpecPath),
    currentSpecFileSha256:outputSpec.fileSha256,
    pinApplicationPath:resolve(pinApplicationPath),
    pinApplicationFileSha256:loadedApplication.fileSha256,
    pinApplicationSha256:application.applicationSha256,
    patchedStageId:patched.stageId,
    patchedStageKind:patched.stageKind,
    sourceReceiptPath:resolve(sourceReceiptPath),
    sourceReceiptFileSha256:loadedReceipt.fileSha256,
    sourceReceiptSha256:source.receipt.receiptSha256,
    stageId:source.receipt.stageId,
    stageKind:source.receipt.stageKind,
    argvSha256:source.receipt.argvSha256,
    stageDefinitionSha256:source.receipt.stageDefinitionSha256,
    repositoryCommitSha:source.receipt.repositoryCommitSha,
    stageScriptSha256:source.receipt.stageScriptSha256,
    nodeResolutionHookSha256:source.receipt.nodeResolutionHookSha256,
    inputs:source.receipt.inputs,
    outputs:source.receipt.outputs,
    sourceReceiptExecutionPreserved:true,
    stageReexecuted:false,
    receiptChainDepth:1,
    completionEvidenceKind:'CARRY_FORWARD_PROOF',
    outputTrustState:'OBSERVED_NOT_PIN_AUTHORITY',
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
  const carryForwardProofSha256=domainDigest(
    HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_DIGEST_DOMAIN,
    payload,
  );
  return Object.freeze({
    proof:Object.freeze({...payload,carryForwardProofSha256}),
    currentManifest,
  });
}

export async function buildHsmeReusePipelineReceiptCarryForward(args){
  const result=await computeCarryForward(args);
  return Object.freeze({
    proof:result.proof,
    files:Object.freeze({proof:canonicalFileBytes(result.proof)}),
  });
}

export async function verifyHsmeReusePipelineReceiptCarryForward({
  proofPath,
  currentManifestPath,
  currentDigestPath,
  repoRoot=process.cwd(),
}){
  const loaded=await readJson(proofPath,'carry-forward proof');
  if(!canonicalFileBytes(loaded.value).equals(loaded.bytes)){
    fail('hsme_reuse_carry_proof_not_canonical','carry-forward proof bytes are not canonical');
  }
  const proof=object(loaded.value,'proof');
  if(proof.schemaVersion!==HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1_SCHEMA){
    fail('hsme_reuse_carry_proof_schema_invalid','carry-forward proof schema invalid');
  }
  if(
    proof.carryForwardState!=='UNCHANGED_STAGE_OBSERVED'
    ||proof.sourceReceiptExecutionPreserved!==true
    ||proof.stageReexecuted!==false
    ||proof.receiptChainDepth!==1
    ||proof.completionEvidenceKind!=='CARRY_FORWARD_PROOF'
    ||proof.outputTrustState!=='OBSERVED_NOT_PIN_AUTHORITY'
    ||proof.externalPinCreated!==false
  ){
    fail('hsme_reuse_carry_proof_state_invalid','carry-forward proof state invalid');
  }
  requireFalseBoundary(proof,'proof');
  const suppliedDigest=hash(
    proof.carryForwardProofSha256,
    'proof.carryForwardProofSha256',
  );
  const payload={...proof};
  delete payload.carryForwardProofSha256;
  if(
    domainDigest(HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_DIGEST_DOMAIN,payload)
    !==suppliedDigest
  ){
    fail('hsme_reuse_carry_proof_digest_mismatch','carry-forward proof self digest mismatch');
  }
  if(
    resolve(currentManifestPath)!==resolve(text(proof.currentManifestPath,'proof.currentManifestPath'))
  ){
    fail('hsme_reuse_carry_current_manifest_path_drift','current manifest path differs from proof');
  }

  const recomputed=await computeCarryForward({
    sourceManifestPath:text(proof.sourceManifestPath,'proof.sourceManifestPath'),
    sourceDigestPath:text(
      proof.sourceManifestDigestPath,
      'proof.sourceManifestDigestPath',
    ),
    sourceReceiptPath:text(proof.sourceReceiptPath,'proof.sourceReceiptPath'),
    pinApplicationPath:text(proof.pinApplicationPath,'proof.pinApplicationPath'),
    sourceSpecPath:text(proof.sourceSpecPath,'proof.sourceSpecPath'),
    outputSpecPath:text(proof.currentSpecPath,'proof.currentSpecPath'),
    currentManifestPath,
    currentDigestPath,
    repoRoot,
  });

  if(!canonicalFileBytes(recomputed.proof).equals(loaded.bytes)){
    fail('hsme_reuse_carry_proof_stale','carry-forward proof differs from current recomputation');
  }
  return recomputed.proof;
}

function parseArgs(argv){
  const args=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined||args.has(key)){
      fail('hsme_reuse_carry_cli_invalid','arguments must be unique --key value pairs');
    }
    args.set(key,value);
  }
  for(const key of [
    '--source-manifest',
    '--source-manifest-digest',
    '--source-receipt',
    '--pin-application',
    '--source-spec',
    '--output-spec',
    '--current-manifest',
    '--current-manifest-digest',
    '--repo-root',
    '--output',
  ]){
    if(!args.has(key))fail('hsme_reuse_carry_cli_invalid','missing '+key);
  }
  return Object.freeze({
    sourceManifest:args.get('--source-manifest'),
    sourceManifestDigest:args.get('--source-manifest-digest'),
    sourceReceipt:args.get('--source-receipt'),
    pinApplication:args.get('--pin-application'),
    sourceSpec:args.get('--source-spec'),
    outputSpec:args.get('--output-spec'),
    currentManifest:args.get('--current-manifest'),
    currentManifestDigest:args.get('--current-manifest-digest'),
    repoRoot:args.get('--repo-root'),
    output:args.get('--output'),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await buildHsmeReusePipelineReceiptCarryForward({
    sourceManifestPath:args.sourceManifest,
    sourceDigestPath:args.sourceManifestDigest,
    sourceReceiptPath:args.sourceReceipt,
    pinApplicationPath:args.pinApplication,
    sourceSpecPath:args.sourceSpec,
    outputSpecPath:args.outputSpec,
    currentManifestPath:args.currentManifest,
    currentDigestPath:args.currentManifestDigest,
    repoRoot:args.repoRoot,
  });
  await writeFile(resolve(args.output),result.files.proof,{flag:'wx'});
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1_SCHEMA,
    stageId:result.proof.stageId,
    carryForwardState:result.proof.carryForwardState,
    carryForwardProofSha256:result.proof.carryForwardProofSha256,
    stageReexecuted:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write((error.code||'hsme_reuse_carry_failed')+': '+error.message+'\n');
    process.exitCode=1;
  });
}

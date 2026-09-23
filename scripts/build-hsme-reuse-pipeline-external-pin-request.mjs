#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
  bindStageInputs,
  findStage,
  loadVerifiedManifest,
} from './run-hsme-reuse-pipeline-stage.mjs';
import {
  HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1_SCHEMA,
  HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA,
  planHsmeReusePipelineResume,
} from './plan-hsme-reuse-pipeline-resume.mjs';

export const HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_V1';
export const HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-external-pin-request:v1\0';

const HEX64=/^[0-9a-f]{64}$/;

export class HsmeReusePipelineExternalPinRequestError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineExternalPinRequestError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineExternalPinRequestError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_pin_request_record_invalid',path+' must be an object');
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
    fail('hsme_reuse_pin_request_text_invalid',path+' is invalid');
  }
  return value;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_pin_request_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_pin_request_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_pin_request_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

function verifySuppliedResumeShape(plan,digest){
  const p=object(plan,'resumePlan');
  const d=object(digest,'resumeDigest');
  if(p.schemaVersion!==HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA){
    fail('hsme_reuse_pin_request_resume_schema_invalid','resume plan schema invalid');
  }
  if(d.schemaVersion!==HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1_SCHEMA){
    fail('hsme_reuse_pin_request_resume_digest_schema_invalid','resume digest schema invalid');
  }
  if(
    p.plannerExecutesStages!==false
    ||p.receiptsGrantSemanticTrust!==false
    ||p.externalPinsAutoTrusted!==false
  ){
    fail(
      'hsme_reuse_pin_request_resume_boundary_invalid',
      'resume plan trust boundary widened',
    );
  }
}

function findResumeStage(plan,stageId){
  const requested=text(stageId,'stageId',160);
  if(!Array.isArray(plan.stages)){
    fail('hsme_reuse_pin_request_stages_invalid','resume plan stages must be an array');
  }
  const matches=plan.stages.filter(value=>value?.stageId===requested);
  if(matches.length!==1){
    fail(
      'hsme_reuse_pin_request_stage_lookup_invalid',
      'stageId must resolve exactly once in resume plan',
    );
  }
  const stage=object(matches[0],'resumeStage');
  if(stage.resumeState!=='EXTERNAL_PIN_REQUIRED'){
    fail(
      'hsme_reuse_pin_request_stage_not_pin_blocked',
      'stage must be exactly EXTERNAL_PIN_REQUIRED',
    );
  }
  if(!Array.isArray(stage.outputsPresent)||stage.outputsPresent.some(Boolean)){
    fail(
      'hsme_reuse_pin_request_stage_outputs_present',
      'pin-blocked stage cannot already have declared outputs',
    );
  }
  if(!Array.isArray(stage.dependencies)){
    fail(
      'hsme_reuse_pin_request_dependencies_invalid',
      'resume stage dependencies must be an array',
    );
  }
  for(const dependencyId of stage.dependencies){
    const dependency=plan.stages.find(value=>value?.stageId===dependencyId);
    if(!dependency||dependency.resumeState!=='COMPLETED_OBSERVED'){
      fail(
        'hsme_reuse_pin_request_dependency_not_completed',
        'dependency lacks verified COMPLETED_OBSERVED receipt: '+dependencyId,
      );
    }
  }
  return stage;
}

function originIndexPath(stage){
  if(!Array.isArray(stage.argv)){
    fail('hsme_reuse_pin_request_stage_argv_invalid','manifest stage argv must be an array');
  }
  const positions=[];
  for(let index=0;index<stage.argv.length;index+=1){
    if(stage.argv[index]==='--origin-index')positions.push(index);
  }
  if(
    positions.length!==1
    ||positions[0]+1>=stage.argv.length
  ){
    fail(
      'hsme_reuse_pin_request_origin_argument_invalid',
      'stage must contain exactly one --origin-index value',
    );
  }
  return resolve(text(stage.argv[positions[0]+1],'stage.originIndexPath'));
}

function manifestInputBinding(manifest,path){
  if(!Array.isArray(manifest.inputs)){
    fail('hsme_reuse_pin_request_manifest_inputs_invalid','manifest inputs must be an array');
  }
  const matches=manifest.inputs.filter(value=>resolve(value?.path||'')===path);
  if(matches.length!==1){
    fail(
      'hsme_reuse_pin_request_origin_input_lookup_invalid',
      'origin-index path must resolve exactly once in manifest inputs',
    );
  }
  const entry=object(matches[0],'manifestOriginInput');
  if(entry.state!=='PRESENT'){
    fail(
      'hsme_reuse_pin_request_origin_input_missing',
      'origin-index input must be PRESENT',
    );
  }
  return Object.freeze({
    path,
    fileSha256:hash(entry.fileSha256,'manifestOriginInput.fileSha256'),
  });
}

export async function buildHsmeReusePipelineExternalPinRequest({
  manifestPath,
  digestPath,
  resumePlanPath,
  resumeDigestPath,
  receiptPaths,
  stageId,
  repoRoot,
}){
  const [
    suppliedPlan,
    suppliedDigest,
    verifiedManifest,
  ]=await Promise.all([
    readJson(resumePlanPath,'resume plan'),
    readJson(resumeDigestPath,'resume digest'),
    loadVerifiedManifest(resolve(manifestPath),resolve(digestPath)),
  ]);
  verifySuppliedResumeShape(suppliedPlan.value,suppliedDigest.value);

  const fresh=await planHsmeReusePipelineResume({
    manifestPath,
    digestPath,
    receiptPaths,
    repoRoot,
  });
  if(!fresh.files.plan.equals(suppliedPlan.bytes)){
    fail(
      'hsme_reuse_pin_request_resume_plan_stale',
      'supplied resume plan differs from current recomputation',
    );
  }
  if(!fresh.files.digest.equals(suppliedDigest.bytes)){
    fail(
      'hsme_reuse_pin_request_resume_digest_stale',
      'supplied resume digest differs from current recomputation',
    );
  }

  const resumeStage=findResumeStage(fresh.plan,stageId);
  const stage=findStage(verifiedManifest.manifest,resumeStage.stageId);
  if(
    stage.status!=='EXTERNAL_PIN_REQUIRED'
    ||stage.localStatus!=='EXTERNAL_PIN_REQUIRED'
  ){
    fail(
      'hsme_reuse_pin_request_manifest_stage_state_invalid',
      'manifest stage must be globally and locally EXTERNAL_PIN_REQUIRED',
    );
  }
  if(stage.expectedExternalPinSha256!==null){
    fail(
      'hsme_reuse_pin_request_expected_pin_present',
      'stage already carries an expected external pin',
    );
  }
  const requestedExternalPinSha256=hash(
    stage.originIndexSemanticSha256,
    'stage.originIndexSemanticSha256',
  );

  const originPath=originIndexPath(stage);
  const originBinding=manifestInputBinding(verifiedManifest.manifest,originPath);
  const originBytes=await readFile(originPath).catch(error=>{
    fail(
      'hsme_reuse_pin_request_origin_file_read_failed',
      originPath+': '+error.message,
    );
  });
  if(sha256Bytes(originBytes)!==originBinding.fileSha256){
    fail(
      'hsme_reuse_pin_request_origin_file_drift',
      'origin-index raw bytes differ from manifest input binding',
    );
  }

  const inputs=bindStageInputs(verifiedManifest.manifest,stage);
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

  const payload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_V1_SCHEMA,
    specFileSha256:verifiedManifest.manifest.specFileSha256,
    manifestSha256:verifiedManifest.manifestSha256,
    manifestFileSha256:verifiedManifest.manifestFileSha256,
    resumePlanSha256:fresh.digest.planSha256,
    resumePlanFileSha256:fresh.digest.planFileSha256,
    repositoryCommitSha:fresh.plan.repositoryCommitSha,
    stageId:stage.stageId,
    stageKind:stage.kind,
    stageDefinitionSha256,
    originIndexPath:originPath,
    originIndexFileSha256:originBinding.fileSha256,
    requestedExternalPinSha256,
    requestState:'AWAITING_EXTERNAL_APPROVAL',
    externalApprovalRequired:true,
    pinAccepted:false,
    specMutationAllowed:false,
    plannerExecutesStages:false,
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
  const requestSha256=domainDigest(
    HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_DIGEST_DOMAIN,
    payload,
  );
  const request=Object.freeze({...payload,requestSha256});
  return Object.freeze({
    request,
    files:Object.freeze({
      request:canonicalFileBytes(request),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const receipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_pin_request_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt'){
      receipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_pin_request_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--manifest',
    '--manifest-digest',
    '--resume-plan',
    '--resume-digest',
    '--stage-id',
    '--repo-root',
    '--output',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_pin_request_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    manifest:single.get('--manifest'),
    manifestDigest:single.get('--manifest-digest'),
    resumePlan:single.get('--resume-plan'),
    resumeDigest:single.get('--resume-digest'),
    stageId:single.get('--stage-id'),
    repoRoot:single.get('--repo-root'),
    output:single.get('--output'),
    receipts:Object.freeze(receipts),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath:args.manifest,
    digestPath:args.manifestDigest,
    resumePlanPath:args.resumePlan,
    resumeDigestPath:args.resumeDigest,
    receiptPaths:args.receipts,
    stageId:args.stageId,
    repoRoot:args.repoRoot,
  });
  await writeFile(resolve(args.output),result.files.request,{flag:'wx'});
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_V1_SCHEMA,
    stageId:result.request.stageId,
    requestedExternalPinSha256:result.request.requestedExternalPinSha256,
    requestSha256:result.request.requestSha256,
    requestState:'AWAITING_EXTERNAL_APPROVAL',
    pinAccepted:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_EXTERNAL_PIN_REQUEST_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_pin_request_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

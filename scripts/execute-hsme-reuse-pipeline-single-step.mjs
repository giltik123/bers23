#!/usr/bin/env node
import {access, mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, relative, resolve} from 'node:path';

import {
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  executeHsmeReusePipelineStage,
} from './run-hsme-reuse-pipeline-stage.mjs';
import {
  HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1_SCHEMA,
  HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA,
  planHsmeReusePipelineResume,
} from './plan-hsme-reuse-pipeline-resume.mjs';

export const HSME_REUSE_PIPELINE_SINGLE_STEP_EXECUTION_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_SINGLE_STEP_EXECUTION_V1';
export const HSME_REUSE_PIPELINE_SINGLE_STEP_EXECUTION_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-single-step-execution:v1\0';

export class HsmeReusePipelineSingleStepError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineSingleStepError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineSingleStepError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_single_step_record_invalid',path+' must be an object');
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
    fail('hsme_reuse_single_step_text_invalid',path+' is invalid');
  }
  return value;
}

function isWithin(root,target){
  const rel=relative(root,target);
  return rel!==''&&!isAbsolute(rel)&&rel!=='..'
    &&!rel.startsWith('../')
    &&!rel.startsWith('..\\');
}

async function exists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    fail('hsme_reuse_single_step_access_failed',path+': '+error.message);
  }
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_single_step_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_single_step_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

async function validateSummaryPath(allowedOutputRoot,summaryPath){
  const root=await realpath(resolve(allowedOutputRoot)).catch(error=>{
    fail(
      'hsme_reuse_single_step_allowed_root_invalid',
      'allowed output root must already exist: '+error.message,
    );
  });
  const summary=resolve(summaryPath);
  const parent=await realpath(dirname(summary)).catch(error=>{
    fail(
      'hsme_reuse_single_step_summary_dir_invalid',
      'summary parent must already exist: '+error.message,
    );
  });
  if(!isWithin(root,summary)||!isWithin(root,parent)){
    fail(
      'hsme_reuse_single_step_summary_root_escape',
      'summary path escapes allowed output root',
    );
  }
  if(await exists(summary)){
    fail(
      'hsme_reuse_single_step_summary_exists',
      'summary path already exists',
    );
  }
  return Object.freeze({root,summary});
}

function requireResumePlanShape(plan,digest){
  const p=object(plan,'resumePlan');
  const d=object(digest,'resumeDigest');
  if(p.schemaVersion!==HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA){
    fail('hsme_reuse_single_step_resume_schema_invalid','resume plan schema invalid');
  }
  if(d.schemaVersion!==HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1_SCHEMA){
    fail('hsme_reuse_single_step_resume_digest_schema_invalid','resume digest schema invalid');
  }
  if(
    p.plannerExecutesStages!==false
    ||p.receiptsGrantSemanticTrust!==false
    ||p.externalPinsAutoTrusted!==false
  ){
    fail(
      'hsme_reuse_single_step_resume_boundary_invalid',
      'resume plan trust/execution boundary widened',
    );
  }
  return Object.freeze({plan:p,digest:d});
}

function selectExplicitReadyStage(plan,stageId){
  const requested=text(stageId,'stageId',160);
  if(!Array.isArray(plan.readyStageIds)||!plan.readyStageIds.includes(requested)){
    fail(
      'hsme_reuse_single_step_stage_not_ready',
      'explicit stageId is absent from verified readyStageIds',
    );
  }
  if(!Array.isArray(plan.stages)){
    fail('hsme_reuse_single_step_stages_invalid','resume plan stages must be an array');
  }
  const matches=plan.stages.filter(value=>value?.stageId===requested);
  if(matches.length!==1){
    fail(
      'hsme_reuse_single_step_stage_lookup_invalid',
      'stageId must resolve exactly once in resume plan',
    );
  }
  const stage=object(matches[0],'resumeStage');
  if(stage.resumeState!=='READY_TO_EXECUTE'){
    fail(
      'hsme_reuse_single_step_stage_state_invalid',
      'explicit stage must be READY_TO_EXECUTE',
    );
  }
  if(!Array.isArray(stage.outputsPresent)||stage.outputsPresent.some(Boolean)){
    fail(
      'hsme_reuse_single_step_stage_outputs_present',
      'READY_TO_EXECUTE stage cannot have existing declared outputs',
    );
  }
  if(!Array.isArray(stage.dependencies)){
    fail(
      'hsme_reuse_single_step_dependencies_invalid',
      'stage dependencies must be an array',
    );
  }
  for(const dependencyId of stage.dependencies){
    const dependency=plan.stages.find(value=>value?.stageId===dependencyId);
    if(!dependency||dependency.resumeState!=='COMPLETED_OBSERVED'){
      fail(
        'hsme_reuse_single_step_dependency_not_completed',
        'dependency lacks verified COMPLETED_OBSERVED receipt: '+dependencyId,
      );
    }
  }
  return stage;
}

export async function executeHsmeReusePipelineSingleStep({
  manifestPath,
  digestPath,
  resumePlanPath,
  resumeDigestPath,
  receiptPaths,
  stageId,
  repoRoot,
  allowedOutputRoot,
  receiptPath,
  summaryPath,
}){
  const [
    suppliedPlan,
    suppliedDigest,
  ]=await Promise.all([
    readJson(resumePlanPath,'resume plan'),
    readJson(resumeDigestPath,'resume digest'),
  ]);
  requireResumePlanShape(suppliedPlan.value,suppliedDigest.value);

  const fresh=await planHsmeReusePipelineResume({
    manifestPath,
    digestPath,
    receiptPaths,
    repoRoot,
  });
  if(!fresh.files.plan.equals(suppliedPlan.bytes)){
    fail(
      'hsme_reuse_single_step_resume_plan_stale',
      'supplied resume plan differs from fresh current recomputation',
    );
  }
  if(!fresh.files.digest.equals(suppliedDigest.bytes)){
    fail(
      'hsme_reuse_single_step_resume_digest_stale',
      'supplied resume digest differs from fresh current recomputation',
    );
  }

  const expectedPlanSha256=domainDigest(
    HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_DOMAIN,
    fresh.plan,
  );
  if(
    suppliedDigest.value.planSha256!==expectedPlanSha256
    ||suppliedDigest.value.planFileSha256!==suppliedPlan.fileSha256
  ){
    fail(
      'hsme_reuse_single_step_resume_digest_binding_invalid',
      'supplied resume digest does not bind supplied resume plan bytes',
    );
  }

  const stage=selectExplicitReadyStage(fresh.plan,stageId);
  const boundary=await validateSummaryPath(allowedOutputRoot,summaryPath);

  const receipt=await executeHsmeReusePipelineStage({
    manifestPath,
    digestPath,
    stageId:stage.stageId,
    allowedOutputRoot,
    receiptPath,
    repoRoot,
  });

  const receiptLoaded=await readJson(receiptPath,'new execution receipt');
  if(receiptLoaded.value.receiptSha256!==receipt.receiptSha256){
    fail(
      'hsme_reuse_single_step_receipt_binding_invalid',
      'stored runner receipt differs from returned receipt',
    );
  }

  const summaryPayload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_SINGLE_STEP_EXECUTION_V1_SCHEMA,
    resumePlanSha256:fresh.digest.planSha256,
    resumePlanFileSha256:fresh.digest.planFileSha256,
    manifestSha256:fresh.plan.manifestSha256,
    manifestFileSha256:fresh.plan.manifestFileSha256,
    repositoryCommitSha:fresh.plan.repositoryCommitSha,
    requestedStageId:stage.stageId,
    stageKind:stage.kind,
    receiptPath:receiptLoaded.path,
    receiptSha256:receipt.receiptSha256,
    receiptFileSha256:receiptLoaded.fileSha256,
    replanRequired:true,
    automaticContinuationAllowed:false,
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
  const executionSummarySha256=domainDigest(
    HSME_REUSE_PIPELINE_SINGLE_STEP_EXECUTION_DIGEST_DOMAIN,
    summaryPayload,
  );
  const summary=Object.freeze({
    ...summaryPayload,
    executionSummarySha256,
  });
  await writeFile(boundary.summary,canonicalFileBytes(summary),{flag:'wx'});

  return Object.freeze({
    receipt,
    summary,
    files:Object.freeze({
      summary:canonicalFileBytes(summary),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const receipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_single_step_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt-input'){
      receipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_single_step_cli_invalid','duplicate argument '+key);
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
    '--allowed-output-root',
    '--receipt-output',
    '--summary-output',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_single_step_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    manifest:single.get('--manifest'),
    manifestDigest:single.get('--manifest-digest'),
    resumePlan:single.get('--resume-plan'),
    resumeDigest:single.get('--resume-digest'),
    stageId:single.get('--stage-id'),
    repoRoot:single.get('--repo-root'),
    allowedOutputRoot:single.get('--allowed-output-root'),
    receiptOutput:single.get('--receipt-output'),
    summaryOutput:single.get('--summary-output'),
    receipts:Object.freeze(receipts),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  await mkdir(dirname(resolve(args.summaryOutput)),{recursive:false}).catch(()=>{});
  const result=await executeHsmeReusePipelineSingleStep({
    manifestPath:args.manifest,
    digestPath:args.manifestDigest,
    resumePlanPath:args.resumePlan,
    resumeDigestPath:args.resumeDigest,
    receiptPaths:args.receipts,
    stageId:args.stageId,
    repoRoot:args.repoRoot,
    allowedOutputRoot:args.allowedOutputRoot,
    receiptPath:args.receiptOutput,
    summaryPath:args.summaryOutput,
  });
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_SINGLE_STEP_EXECUTION_V1_SCHEMA,
    requestedStageId:result.summary.requestedStageId,
    receiptSha256:result.summary.receiptSha256,
    executionSummarySha256:result.summary.executionSummarySha256,
    replanRequired:true,
    automaticContinuationAllowed:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_SINGLE_STEP_COORDINATOR_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_single_step_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

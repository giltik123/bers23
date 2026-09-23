#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';

import {
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA,
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';

export const HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1';
export const HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-stage-execution-receipt:v1\0';
export const HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-stage-argv:v1\0';
export const HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-stage-definition:v1\0';

const MAX_CAPTURE_BYTES=1_048_576;
const DEFAULT_TIMEOUT_MS=300_000;

const ALLOWLIST=Object.freeze({
  QUALITY_PARETO:Object.freeze({
    script:'scripts/compile-hsme-foundation-quality-pareto-evidence.mjs',
    envKey:'HSME_FOUNDATION_QUALITY_PARETO_COMPILER_CLI',
  }),
  CAPABILITY_PROOF:Object.freeze({
    script:'scripts/compile-hsme-reuse-capability-proof.mjs',
    envKey:'HSME_REUSE_CAPABILITY_PROOF_COMPILER_CLI',
  }),
  CANDIDATE_ASSEMBLY:Object.freeze({
    script:'scripts/materialize-hsme-reuse-candidate-assembly.mjs',
    envKey:'HSME_REUSE_CANDIDATE_ASSEMBLY_MATERIALIZER_CLI',
  }),
  OUTCOME_ORIGIN_FREEZE:Object.freeze({
    script:'scripts/build-hsme-reuse-outcome-origin-index.mjs',
    envKey:'HSME_REUSE_OUTCOME_ORIGIN_BUILDER_CLI',
  }),
  OUTCOME_MATERIALIZATION:Object.freeze({
    script:'scripts/materialize-hsme-reuse-outcome-evidence.mjs',
    envKey:'HSME_REUSE_OUTCOME_MATERIALIZER_CLI',
  }),
});

export class HsmeReusePipelineStageRunnerError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineStageRunnerError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineStageRunnerError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_stage_runner_record_invalid',path+' must be an object');
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
    fail('hsme_reuse_stage_runner_text_invalid',path+' is invalid');
  }
  return value;
}

function array(value,path,max=128){
  if(!Array.isArray(value)||value.length>max){
    fail('hsme_reuse_stage_runner_array_invalid',path+' must be a bounded array');
  }
  return value;
}

function requireFalseBoundary(value,label){
  const record=object(value,label);
  for(const field of [
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
      fail(
        'hsme_reuse_stage_runner_authority_invalid',
        label+'.'+field+' must remain false',
      );
    }
  }
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_stage_runner_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_stage_runner_json_invalid',label+': '+error.message);
  }
  return Object.freeze({path,bytes,value});
}

async function loadVerifiedManifest(manifestPath,digestPath){
  const manifestLoaded=await readJson(manifestPath,'manifest');
  const digestLoaded=await readJson(digestPath,'manifest digest');
  const manifest=object(manifestLoaded.value,'manifest');
  const digest=object(digestLoaded.value,'manifestDigest');

  if(manifest.schemaVersion!==HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA){
    fail('hsme_reuse_stage_runner_manifest_schema_invalid','manifest schema invalid');
  }
  if(digest.schemaVersion!==HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA){
    fail('hsme_reuse_stage_runner_digest_schema_invalid','manifest digest schema invalid');
  }

  const canonical=canonicalFileBytes(manifest);
  if(!canonical.equals(manifestLoaded.bytes)){
    fail(
      'hsme_reuse_stage_runner_manifest_not_canonical',
      'manifest file bytes are not canonical planner bytes',
    );
  }
  const manifestFileSha256=sha256Bytes(canonical);
  if(manifestFileSha256!==digest.manifestFileSha256){
    fail(
      'hsme_reuse_stage_runner_manifest_file_digest_mismatch',
      'manifest raw file SHA-256 differs from digest sidecar',
    );
  }

  const manifestSha256=domainDigest(
    HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
    manifest,
  );
  if(manifestSha256!==digest.manifestSha256){
    fail(
      'hsme_reuse_stage_runner_manifest_semantic_digest_mismatch',
      'manifest semantic digest differs from digest sidecar',
    );
  }
  if(
    digest.specFileSha256!==manifest.specFileSha256
    ||digest.pipelineState!==manifest.pipelineState
  ){
    fail(
      'hsme_reuse_stage_runner_digest_binding_mismatch',
      'manifest digest sidecar binding drift',
    );
  }
  if(
    manifest.plannerExecutesStages!==false
    ||manifest.externalPinsAutoTrusted!==false
    ||digest.plannerExecutesStages!==false
    ||digest.externalPinsAutoTrusted!==false
  ){
    fail(
      'hsme_reuse_stage_runner_manifest_trust_boundary_invalid',
      'planner execution/trust boundary widened',
    );
  }

  requireFalseBoundary(manifest,'manifest');
  return Object.freeze({
    manifest,
    digest,
    manifestSha256,
    manifestFileSha256,
  });
}

function findStage(manifest,stageId){
  const stages=array(manifest.stages,'manifest.stages',128);
  const matches=stages.filter(stage=>stage?.stageId===stageId);
  if(matches.length!==1){
    fail(
      'hsme_reuse_stage_runner_stage_lookup_invalid',
      'stageId must resolve exactly once: '+stageId,
    );
  }
  return object(matches[0],'stage');
}

function validateReadyStage(manifest,stage){
  if(stage.status!=='READY'||stage.localStatus!=='READY'){
    fail(
      'hsme_reuse_stage_runner_stage_not_ready',
      'stage must be READY locally and globally',
    );
  }
  for(const [field,max] of [
    ['missingInputs',128],
    ['predecessorMissingInputs',128],
    ['blockedDependencies',128],
  ]){
    if(array(stage[field],'stage.'+field,max).length!==0){
      fail(
        'hsme_reuse_stage_runner_stage_blocked',
        'stage carries blockers in '+field,
      );
    }
  }

  const dependencies=array(stage.dependencies,'stage.dependencies',128);
  const stages=array(manifest.stages,'manifest.stages',128);
  for(const dependencyId of dependencies){
    const dependency=stages.find(value=>value?.stageId===dependencyId);
    if(!dependency||dependency.status!=='READY'){
      fail(
        'hsme_reuse_stage_runner_dependency_not_ready',
        'dependency is not READY: '+dependencyId,
      );
    }
  }
  requireFalseBoundary(stage,'stage');
}

function validateStageProgram(stage){
  const allowed=ALLOWLIST[stage.kind];
  if(!allowed){
    fail(
      'hsme_reuse_stage_runner_stage_kind_not_allowed',
      'stage kind is not allowlisted: '+stage.kind,
    );
  }

  const argv=array(stage.argv,'stage.argv',256).map(
    (value,index)=>text(value,'stage.argv['+index+']'),
  );
  if(argv.length<4||argv[0]!=='node'||argv[1]!==allowed.script){
    fail(
      'hsme_reuse_stage_runner_stage_script_mismatch',
      'manifest argv does not match hardcoded stage script',
    );
  }
  if(argv.some(value=>value.includes('<EXTERNAL_PIN_REQUIRED>'))){
    fail(
      'hsme_reuse_stage_runner_unresolved_pin_placeholder',
      'READY stage cannot contain external-pin placeholder',
    );
  }

  const env=object(stage.env,'stage.env');
  const envKeys=Object.keys(env).sort();
  if(
    envKeys.length!==1
    ||envKeys[0]!==allowed.envKey
    ||env[allowed.envKey]!=='1'
  ){
    fail(
      'hsme_reuse_stage_runner_stage_env_mismatch',
      'manifest env does not match hardcoded stage enable flag',
    );
  }

  const outputIndexes=[];
  for(let index=0;index<argv.length;index+=1){
    if(argv[index]==='--output-dir')outputIndexes.push(index);
  }
  if(
    outputIndexes.length!==1
    ||outputIndexes[0]+1>=argv.length
  ){
    fail(
      'hsme_reuse_stage_runner_output_dir_argument_invalid',
      'stage argv must contain exactly one --output-dir value',
    );
  }
  const outputDir=resolve(argv[outputIndexes[0]+1]);
  const outputs=array(stage.outputs,'stage.outputs',32).map(
    (value,index)=>resolve(text(value,'stage.outputs['+index+']')),
  );
  if(outputs.length<1){
    fail('hsme_reuse_stage_runner_outputs_empty','stage must declare outputs');
  }
  if(outputs.some(path=>dirname(path)!==outputDir)){
    fail(
      'hsme_reuse_stage_runner_output_dir_binding_mismatch',
      'declared outputs differ from argv --output-dir',
    );
  }

  return Object.freeze({allowed,argv,outputDir,outputs});
}

function isWithin(root,target){
  const rel=relative(root,target);
  return rel!==''&&!isAbsolute(rel)&&rel!=='..'
    &&!rel.startsWith('../')
    &&!rel.startsWith('..\\');
}

async function validateOutputBoundary({
  allowedOutputRoot,
  outputDir,
  outputs,
  receiptPath,
}){
  const root=await realpath(resolve(allowedOutputRoot)).catch(error=>{
    fail(
      'hsme_reuse_stage_runner_allowed_root_invalid',
      'allowed output root must already exist: '+error.message,
    );
  });
  const realOutputDir=await realpath(outputDir).catch(error=>{
    fail(
      'hsme_reuse_stage_runner_output_dir_missing',
      'stage output directory must already exist: '+error.message,
    );
  });
  if(!isWithin(root,realOutputDir)){
    fail(
      'hsme_reuse_stage_runner_output_root_escape',
      'stage output directory escapes allowed output root',
    );
  }

  for(const output of outputs){
    if(!isWithin(root,output)){
      fail(
        'hsme_reuse_stage_runner_output_root_escape',
        'declared output escapes allowed output root: '+output,
      );
    }
    if(await exists(output)){
      fail(
        'hsme_reuse_stage_runner_output_exists',
        'stage output already exists: '+output,
      );
    }
  }

  const receipt=resolve(receiptPath);
  const receiptParent=await realpath(dirname(receipt)).catch(error=>{
    fail(
      'hsme_reuse_stage_runner_receipt_dir_missing',
      'receipt parent must already exist: '+error.message,
    );
  });
  if(!isWithin(root,receipt)||!isWithin(root,receiptParent)){
    fail(
      'hsme_reuse_stage_runner_receipt_root_escape',
      'receipt path escapes allowed output root',
    );
  }
  if(await exists(receipt)){
    fail(
      'hsme_reuse_stage_runner_receipt_exists',
      'receipt already exists',
    );
  }

  return Object.freeze({root,realOutputDir,receipt});
}

async function validateRepoScript(repoRoot,script){
  const root=await realpath(resolve(repoRoot)).catch(error=>{
    fail(
      'hsme_reuse_stage_runner_repo_root_invalid',
      'repo root invalid: '+error.message,
    );
  });
  const scriptPath=await realpath(resolve(root,script)).catch(error=>{
    fail(
      'hsme_reuse_stage_runner_script_missing',
      'allowlisted script missing: '+error.message,
    );
  });
  if(!isWithin(root,scriptPath)){
    fail(
      'hsme_reuse_stage_runner_script_escape',
      'allowlisted script resolves outside repo root',
    );
  }
  return Object.freeze({root,scriptPath});
}

function childEnvironment(envKey){
  const env={};
  for(const [key,value] of Object.entries(process.env)){
    if(value===undefined)continue;
    if(key==='NODE_OPTIONS')continue;
    if(key.startsWith('HSME_'))continue;
    env[key]=value;
  }
  env[envKey]='1';
  return env;
}

function executeNodeStage({
  scriptPath,
  args,
  cwd,
  envKey,
  timeoutMs,
  maxCaptureBytes,
}){
  return new Promise((resolvePromise,rejectPromise)=>{
    const child=spawn(
      process.execPath,
      [scriptPath,...args],
      {
        cwd,
        env:childEnvironment(envKey),
        shell:false,
        stdio:['ignore','pipe','pipe'],
      },
    );

    let stdout=Buffer.alloc(0);
    let stderr=Buffer.alloc(0);
    let terminationReason=null;
    let settled=false;

    const terminate=reason=>{
      if(terminationReason===null)terminationReason=reason;
      try{child.kill('SIGKILL');}catch{}
    };

    const append=(current,chunk,stream)=>{
      const next=Buffer.concat([current,Buffer.from(chunk)]);
      if(next.length>maxCaptureBytes){
        terminate(stream+'_CAP_EXCEEDED');
        return next.subarray(0,maxCaptureBytes);
      }
      return next;
    };

    child.stdout.on('data',chunk=>{
      stdout=append(stdout,chunk,'STDOUT');
    });
    child.stderr.on('data',chunk=>{
      stderr=append(stderr,chunk,'STDERR');
    });

    const timer=setTimeout(()=>terminate('TIMEOUT'),timeoutMs);

    child.on('error',error=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      rejectPromise(new HsmeReusePipelineStageRunnerError(
        'hsme_reuse_stage_runner_spawn_failed',
        error.message,
      ));
    });

    child.on('close',(code,signal)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(terminationReason==='TIMEOUT'){
        rejectPromise(new HsmeReusePipelineStageRunnerError(
          'hsme_reuse_stage_runner_timeout',
          'stage execution exceeded timeout',
        ));
        return;
      }
      if(terminationReason==='STDOUT_CAP_EXCEEDED'||terminationReason==='STDERR_CAP_EXCEEDED'){
        rejectPromise(new HsmeReusePipelineStageRunnerError(
          'hsme_reuse_stage_runner_capture_cap_exceeded',
          terminationReason,
        ));
        return;
      }
      resolvePromise(Object.freeze({
        code,
        signal,
        stdout,
        stderr,
      }));
    });
  });
}

function bindStageInputs(manifest,stage){
  const manifestInputs=array(manifest.inputs,'manifest.inputs',512);
  const byPath=new Map();
  for(const entry of manifestInputs){
    const value=object(entry,'manifest.input');
    const path=text(value.path,'manifest.input.path');
    if(byPath.has(path)){
      fail(
        'hsme_reuse_stage_runner_manifest_input_duplicate',
        'manifest contains duplicate input path '+path,
      );
    }
    byPath.set(path,value);
  }

  return Object.freeze(array(stage.inputs,'stage.inputs',128).map((path,index)=>{
    const normalized=text(path,'stage.inputs['+index+']');
    const entry=byPath.get(normalized);
    if(
      !entry
      ||entry.state!=='PRESENT'
      ||typeof entry.fileSha256!=='string'
      ||!/^[0-9a-f]{64}$/.test(entry.fileSha256)
    ){
      fail(
        'hsme_reuse_stage_runner_stage_input_binding_invalid',
        'READY stage input is not PRESENT with raw SHA-256: '+normalized,
      );
    }
    return Object.freeze({
      path:normalized,
      fileSha256:entry.fileSha256,
    });
  }));
}

async function loadOutputFiles(outputs){
  const observed=[];
  for(const path of outputs){
    let bytes;
    try{
      bytes=await readFile(path);
    }catch(error){
      fail(
        'hsme_reuse_stage_runner_output_missing',
        path+': '+error.message,
      );
    }
    try{
      JSON.parse(bytes.toString('utf8'));
    }catch(error){
      fail(
        'hsme_reuse_stage_runner_output_json_invalid',
        path+': '+error.message,
      );
    }
    observed.push(Object.freeze({
      path,
      fileSha256:sha256Bytes(bytes),
      bytes:bytes.length,
    }));
  }
  return Object.freeze(observed);
}

export async function executeHsmeReusePipelineStage({
  manifestPath,
  digestPath,
  stageId,
  allowedOutputRoot,
  receiptPath,
  repoRoot=process.cwd(),
  timeoutMs=DEFAULT_TIMEOUT_MS,
  maxCaptureBytes=MAX_CAPTURE_BYTES,
}){
  text(stageId,'stageId',160);
  if(
    !Number.isSafeInteger(timeoutMs)
    ||timeoutMs<1
    ||timeoutMs>DEFAULT_TIMEOUT_MS
  ){
    fail(
      'hsme_reuse_stage_runner_timeout_invalid',
      'timeoutMs must be 1..'+DEFAULT_TIMEOUT_MS,
    );
  }
  if(
    !Number.isSafeInteger(maxCaptureBytes)
    ||maxCaptureBytes<1024
    ||maxCaptureBytes>MAX_CAPTURE_BYTES
  ){
    fail(
      'hsme_reuse_stage_runner_capture_limit_invalid',
      'maxCaptureBytes out of range',
    );
  }

  const verified=await loadVerifiedManifest(
    resolve(manifestPath),
    resolve(digestPath),
  );
  const stage=findStage(verified.manifest,stageId);
  validateReadyStage(verified.manifest,stage);
  const program=validateStageProgram(stage);
  const boundary=await validateOutputBoundary({
    allowedOutputRoot,
    outputDir:program.outputDir,
    outputs:program.outputs,
    receiptPath,
  });
  const repo=await validateRepoScript(repoRoot,program.allowed.script);

  const execution=await executeNodeStage({
    scriptPath:repo.scriptPath,
    args:program.argv.slice(2),
    cwd:repo.root,
    envKey:program.allowed.envKey,
    timeoutMs,
    maxCaptureBytes,
  });
  if(execution.code!==0||execution.signal!==null){
    fail(
      'hsme_reuse_stage_runner_child_failed',
      'stage exited with code '+String(execution.code)
      +' signal '+String(execution.signal),
    );
  }

  const outputs=await loadOutputFiles(program.outputs);
  const inputs=bindStageInputs(verified.manifest,stage);
  const argvSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
    {
      stageId:stage.stageId,
      kind:stage.kind,
      env:stage.env,
      argv:stage.argv,
    },
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

  const receiptPayload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA,
    manifestSha256:verified.manifestSha256,
    manifestFileSha256:verified.manifestFileSha256,
    specFileSha256:verified.manifest.specFileSha256,
    stageId:stage.stageId,
    stageKind:stage.kind,
    argvSha256,
    stageDefinitionSha256,
    inputs,
    stdoutSha256:sha256Bytes(execution.stdout),
    stderrSha256:sha256Bytes(execution.stderr),
    stdoutBytes:execution.stdout.length,
    stderrBytes:execution.stderr.length,
    outputs,
    executionState:'SUCCEEDED',
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
  const receiptSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
    receiptPayload,
  );
  const receipt=Object.freeze({...receiptPayload,receiptSha256});
  await writeFile(boundary.receipt,canonicalFileBytes(receipt),{flag:'wx'});
  return receipt;
}

async function exists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    fail('hsme_reuse_stage_runner_access_failed',path+': '+error.message);
  }
}

export async function runCli(argv=process.argv.slice(2)){
  const args=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined||args.has(key)){
      fail(
        'hsme_reuse_stage_runner_cli_invalid',
        'arguments must be unique --key value pairs',
      );
    }
    args.set(key,value);
  }
  for(const key of [
    '--manifest',
    '--manifest-digest',
    '--stage-id',
    '--allowed-output-root',
    '--receipt',
    '--repo-root',
  ]){
    if(!args.has(key)){
      fail('hsme_reuse_stage_runner_cli_invalid','missing '+key);
    }
  }

  const receipt=await executeHsmeReusePipelineStage({
    manifestPath:args.get('--manifest'),
    digestPath:args.get('--manifest-digest'),
    stageId:args.get('--stage-id'),
    allowedOutputRoot:args.get('--allowed-output-root'),
    receiptPath:args.get('--receipt'),
    repoRoot:args.get('--repo-root'),
  });

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA,
    stageId:receipt.stageId,
    stageKind:receipt.stageKind,
    executionState:receipt.executionState,
    receiptSha256:receipt.receiptSha256,
    outputTrustState:receipt.outputTrustState,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_STAGE_RUNNER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_stage_runner_failed')
      +': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

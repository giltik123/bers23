#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
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
import {
  verifyHsmeReusePipelineReceiptCarryForward,
} from './verify-hsme-reuse-pipeline-receipt-carry-forward.mjs';

export const HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_RESUME_PLAN_V1';
export const HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1';
export const HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-resume-plan:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const GIT_OID=/^[0-9a-f]{40,64}$/;

export class HsmeReusePipelineResumePlannerError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineResumePlannerError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineResumePlannerError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_resume_record_invalid',path+' must be an object');
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
    fail('hsme_reuse_resume_text_invalid',path+' is invalid');
  }
  return value;
}

function array(value,path,max=256){
  if(!Array.isArray(value)||value.length>max){
    fail('hsme_reuse_resume_array_invalid',path+' must be a bounded array');
  }
  return value;
}

function integer(value,path,min=0,max=Number.MAX_SAFE_INTEGER){
  if(!Number.isSafeInteger(value)||value<min||value>max){
    fail('hsme_reuse_resume_integer_invalid',path+' is invalid');
  }
  return value;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_resume_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

function gitOid(value,path){
  const result=text(value,path,64);
  if(!GIT_OID.test(result)){
    fail('hsme_reuse_resume_git_oid_invalid',path+' must be lowercase git object id');
  }
  return result;
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
      fail(
        'hsme_reuse_resume_authority_invalid',
        label+'.'+field+' must remain false',
      );
    }
  }
}

function exactKeys(value,allowed,path){
  const record=object(value,path);
  const actual=Object.keys(record).sort();
  const expected=[...allowed].sort();
  if(
    actual.length!==expected.length
    ||actual.some((key,index)=>key!==expected[index])
  ){
    fail(
      'hsme_reuse_resume_receipt_shape_invalid',
      path+' fields differ from exact V2 receipt shape',
    );
  }
  return record;
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_resume_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_resume_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

function normalizeBindingArray(value,path,{outputs=false}={}){
  const entries=array(value,path,256).map((raw,index)=>{
    const allowed=outputs
      ?['path','fileSha256','bytes']
      :['path','fileSha256'];
    const entry=exactKeys(raw,allowed,path+'['+index+']');
    const normalized={
      path:resolve(text(entry.path,path+'['+index+'].path')),
      fileSha256:hash(entry.fileSha256,path+'['+index+'].fileSha256'),
    };
    if(outputs){
      normalized.bytes=integer(
        entry.bytes,
        path+'['+index+'].bytes',
        0,
        Number.MAX_SAFE_INTEGER,
      );
    }
    return Object.freeze(normalized);
  });
  const keys=entries.map(value=>value.path);
  if(new Set(keys).size!==keys.length){
    fail('hsme_reuse_resume_binding_duplicate',path+' paths must be unique');
  }
  return Object.freeze(entries);
}

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

function normalizeReceipt(raw){
  const receipt=exactKeys(raw,RECEIPT_FIELDS,'receipt');
  if(receipt.schemaVersion!==HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA){
    fail(
      'hsme_reuse_resume_receipt_schema_invalid',
      'resume requires exact V2 execution receipt',
    );
  }
  if(receipt.executionState!=='SUCCEEDED'){
    fail('hsme_reuse_resume_receipt_execution_invalid','receipt must be SUCCEEDED');
  }
  if(receipt.outputTrustState!=='OBSERVED_NOT_PIN_AUTHORITY'){
    fail(
      'hsme_reuse_resume_receipt_trust_state_invalid',
      'receipt output trust state is invalid',
    );
  }
  if(receipt.externalPinCreated!==false){
    fail(
      'hsme_reuse_resume_receipt_external_pin_invalid',
      'receipt cannot create an external pin',
    );
  }
  if(receipt.trackedTreeClean!==true){
    fail(
      'hsme_reuse_resume_receipt_tree_state_invalid',
      'receipt must bind trackedTreeClean=true',
    );
  }
  requireFalseBoundary(receipt,'receipt');

  return Object.freeze({
    ...receipt,
    manifestSha256:hash(receipt.manifestSha256,'receipt.manifestSha256'),
    manifestFileSha256:hash(
      receipt.manifestFileSha256,
      'receipt.manifestFileSha256',
    ),
    specFileSha256:hash(receipt.specFileSha256,'receipt.specFileSha256'),
    stageId:text(receipt.stageId,'receipt.stageId',160),
    stageKind:text(receipt.stageKind,'receipt.stageKind',64),
    argvSha256:hash(receipt.argvSha256,'receipt.argvSha256'),
    stageDefinitionSha256:hash(
      receipt.stageDefinitionSha256,
      'receipt.stageDefinitionSha256',
    ),
    repositoryCommitSha:gitOid(
      receipt.repositoryCommitSha,
      'receipt.repositoryCommitSha',
    ),
    stageScriptSha256:hash(
      receipt.stageScriptSha256,
      'receipt.stageScriptSha256',
    ),
    nodeResolutionHookSha256:hash(
      receipt.nodeResolutionHookSha256,
      'receipt.nodeResolutionHookSha256',
    ),
    inputs:normalizeBindingArray(receipt.inputs,'receipt.inputs'),
    stdoutSha256:hash(receipt.stdoutSha256,'receipt.stdoutSha256'),
    stderrSha256:hash(receipt.stderrSha256,'receipt.stderrSha256'),
    stdoutBytes:integer(receipt.stdoutBytes,'receipt.stdoutBytes'),
    stderrBytes:integer(receipt.stderrBytes,'receipt.stderrBytes'),
    outputs:normalizeBindingArray(receipt.outputs,'receipt.outputs',{outputs:true}),
    receiptSha256:hash(receipt.receiptSha256,'receipt.receiptSha256'),
  });
}

function receiptPayload(receipt){
  const payload={...receipt};
  delete payload.receiptSha256;
  return payload;
}

async function verifyReceipt({
  loaded,
  verifiedManifest,
  repository,
  repoRoot,
  runtimeCache,
}){
  const canonical=canonicalFileBytes(loaded.value);
  if(!canonical.equals(loaded.bytes)){
    fail(
      'hsme_reuse_resume_receipt_not_canonical',
      'receipt file bytes are not canonical runner bytes: '+loaded.path,
    );
  }

  const receipt=normalizeReceipt(loaded.value);
  const receiptSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
    receiptPayload(receipt),
  );
  if(receiptSha256!==receipt.receiptSha256){
    fail(
      'hsme_reuse_resume_receipt_digest_mismatch',
      'receipt self digest mismatch: '+loaded.path,
    );
  }
  if(receipt.specFileSha256!==verifiedManifest.manifest.specFileSha256){
    fail(
      'hsme_reuse_resume_receipt_spec_drift',
      'receipt spec digest differs from current manifest',
    );
  }
  if(receipt.repositoryCommitSha!==repository.repositoryCommitSha){
    fail(
      'hsme_reuse_resume_repository_commit_drift',
      'receipt repository commit differs from current clean HEAD',
    );
  }

  const stage=findStage(verifiedManifest.manifest,receipt.stageId);
  if(stage.kind!==receipt.stageKind){
    fail(
      'hsme_reuse_resume_stage_kind_drift',
      'receipt stage kind differs from current manifest',
    );
  }
  if(stage.status!=='READY'||stage.localStatus!=='READY'){
    fail(
      'hsme_reuse_resume_completed_stage_not_ready',
      'receipt stage is not READY under current re-plan',
    );
  }
  const program=validateStageProgram(stage);
  let runtime=runtimeCache.get(program.allowed.script);
  if(!runtime){
    runtime=await validateRepoRuntime(repoRoot,program.allowed.script);
    runtimeCache.set(program.allowed.script,runtime);
  }
  if(
    runtime.repositoryCommitSha!==repository.repositoryCommitSha
    ||runtime.trackedTreeClean!==true
    ||runtime.scriptSha256!==receipt.stageScriptSha256
    ||runtime.hookSha256!==receipt.nodeResolutionHookSha256
  ){
    fail(
      'hsme_reuse_resume_runtime_code_drift',
      'receipt script/hook/repository binding differs from current code',
    );
  }

  const inputs=bindStageInputs(verifiedManifest.manifest,stage);
  if(JSON.stringify(inputs)!==JSON.stringify(receipt.inputs)){
    fail(
      'hsme_reuse_resume_stage_input_drift',
      'receipt stage input binding differs from current re-plan',
    );
  }

  const argvSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
    {
      stageId:stage.stageId,
      kind:stage.kind,
      env:stage.env,
      argv:stage.argv,
    },
  );
  if(argvSha256!==receipt.argvSha256){
    fail(
      'hsme_reuse_resume_stage_argv_drift',
      'receipt argv digest differs from current re-plan',
    );
  }

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
  if(stageDefinitionSha256!==receipt.stageDefinitionSha256){
    fail(
      'hsme_reuse_resume_stage_definition_drift',
      'receipt stage definition differs from current re-plan',
    );
  }

  const stageOutputs=array(stage.outputs,'stage.outputs',64).map(
    (value,index)=>resolve(text(value,'stage.outputs['+index+']')),
  );
  if(
    stageOutputs.length!==receipt.outputs.length
    ||stageOutputs.some((path,index)=>path!==receipt.outputs[index].path)
  ){
    fail(
      'hsme_reuse_resume_output_set_drift',
      'receipt output paths differ from current stage definition',
    );
  }

  for(const output of receipt.outputs){
    const current=await readJson(output.path,'receipt output');
    if(
      current.fileSha256!==output.fileSha256
      ||current.bytes.length!==output.bytes
    ){
      fail(
        'hsme_reuse_resume_output_bytes_drift',
        'receipt output bytes changed: '+output.path,
      );
    }
  }

  return Object.freeze({
    stageId:receipt.stageId,
    stageKind:receipt.stageKind,
    receiptPath:loaded.path,
    receiptFileSha256:loaded.fileSha256,
    receiptSha256:receipt.receiptSha256,
    stageDefinitionSha256,
    argvSha256,
    inputs,
    outputs:receipt.outputs,
  });
}

async function pathExists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    fail('hsme_reuse_resume_access_failed',path+': '+error.message);
  }
}

function resumePipelineState(stages,manifestPipelineState){
  if(stages.some(value=>value.resumeState==='UNTRACKED_OUTPUTS')){
    return 'BLOCKED_UNTRACKED_OUTPUTS';
  }
  if(stages.every(value=>value.resumeState==='COMPLETED_OBSERVED')){
    return 'COMPLETED_OBSERVED';
  }
  if(stages.some(value=>value.resumeState==='READY_TO_EXECUTE')){
    return 'READY';
  }
  if(stages.some(value=>value.resumeState==='WAITING_FOR_DEPENDENCY_RECEIPTS')){
    return 'BLOCKED_DEPENDENCY_RECEIPTS';
  }
  return manifestPipelineState;
}

export async function planHsmeReusePipelineResume({
  manifestPath,
  digestPath,
  receiptPaths,
  carryForwardPaths=[],
  repoRoot=process.cwd(),
}){
  const verifiedManifest=await loadVerifiedManifest(
    resolve(manifestPath),
    resolve(digestPath),
  );
  const repository=await readRepositoryIdentity(resolve(repoRoot));
  if(repository.trackedTreeClean!==true){
    fail('hsme_reuse_resume_repository_dirty','tracked repository tree is dirty');
  }

  const loadedReceipts=await Promise.all(
    receiptPaths.map((path,index)=>readJson(path,'receipt '+index)),
  );
  const runtimeCache=new Map();
  const verifiedReceipts=[];
  const receiptByStage=new Map();

  for(const loaded of loadedReceipts){
    const verified=await verifyReceipt({
      loaded,
      verifiedManifest,
      repository,
      repoRoot:resolve(repoRoot),
      runtimeCache,
    });
    if(receiptByStage.has(verified.stageId)){
      fail(
        'hsme_reuse_resume_receipt_duplicate',
        'duplicate receipt for stage '+verified.stageId,
      );
    }
    receiptByStage.set(verified.stageId,verified);
    verifiedReceipts.push(verified);
  }
  verifiedReceipts.sort((a,b)=>lexical(a.stageId,b.stageId));

  const verifiedCarryForwards=[];
  const carryByStage=new Map();
  for(const path of carryForwardPaths){
    const proof=await verifyHsmeReusePipelineReceiptCarryForward({
      proofPath:path,
      currentManifestPath:resolve(manifestPath),
      currentDigestPath:resolve(digestPath),
      repoRoot:resolve(repoRoot),
    });
    if(receiptByStage.has(proof.stageId)||carryByStage.has(proof.stageId)){
      fail(
        'hsme_reuse_resume_completion_evidence_duplicate',
        'duplicate receipt/carry-forward evidence for stage '+proof.stageId,
      );
    }
    carryByStage.set(proof.stageId,proof);
    verifiedCarryForwards.push(Object.freeze({
      stageId:proof.stageId,
      stageKind:proof.stageKind,
      carryForwardProofSha256:proof.carryForwardProofSha256,
      sourceReceiptSha256:proof.sourceReceiptSha256,
      sourceSpecFileSha256:proof.sourceSpecFileSha256,
      currentSpecFileSha256:proof.currentSpecFileSha256,
      stageDefinitionSha256:proof.stageDefinitionSha256,
      argvSha256:proof.argvSha256,
      outputs:proof.outputs,
    }));
  }
  verifiedCarryForwards.sort((a,b)=>lexical(a.stageId,b.stageId));

  const stages=[];
  const completed=new Set([
    ...receiptByStage.keys(),
    ...carryByStage.keys(),
  ]);
  for(const rawStage of array(verifiedManifest.manifest.stages,'manifest.stages',128)){
    const stage=object(rawStage,'stage');
    const stageId=text(stage.stageId,'stage.stageId',160);
    const outputs=array(stage.outputs,'stage.outputs',64).map(
      (value,index)=>resolve(text(value,'stage.outputs['+index+']')),
    );
    const outputPresence=await Promise.all(outputs.map(pathExists));
    const anyOutput=outputPresence.some(Boolean);
    const allOutput=outputPresence.every(Boolean);
    const receipt=receiptByStage.get(stageId)||null;
    const carryForward=carryByStage.get(stageId)||null;
    const completion=receipt||carryForward;

    let resumeState;
    if(completion){
      if(!allOutput){
        fail(
          'hsme_reuse_resume_receipt_output_missing',
          'verified receipt stage output is missing: '+stageId,
        );
      }
      resumeState='COMPLETED_OBSERVED';
    }else if(anyOutput){
      resumeState='UNTRACKED_OUTPUTS';
    }else if(stage.status!=='READY'||stage.localStatus!=='READY'){
      resumeState=stage.status;
    }else{
      const dependencies=array(stage.dependencies,'stage.dependencies',128);
      resumeState=dependencies.every(id=>completed.has(id))
        ?'READY_TO_EXECUTE'
        :'WAITING_FOR_DEPENDENCY_RECEIPTS';
    }

    stages.push(Object.freeze({
      stageId,
      kind:text(stage.kind,'stage.kind',64),
      manifestStatus:text(stage.status,'stage.status',64),
      manifestLocalStatus:text(stage.localStatus,'stage.localStatus',64),
      dependencies:Object.freeze([...array(stage.dependencies,'stage.dependencies',128)]),
      resumeState,
      receiptSha256:receipt?.receiptSha256??carryForward?.sourceReceiptSha256??null,
      ...(carryForward?{
        completionEvidenceKind:'CARRY_FORWARD_PROOF',
        carryForwardProofSha256:carryForward.carryForwardProofSha256,
        sourceReceiptSha256:carryForward.sourceReceiptSha256,
      }:receipt&&carryForwardPaths.length>0?{
        completionEvidenceKind:'EXECUTION_RECEIPT',
      }:{}),
      outputsPresent:Object.freeze(outputPresence),
      outputTrustState:completion?'OBSERVED_NOT_PIN_AUTHORITY':'NONE',
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
    }));
  }

  const readyStageIds=Object.freeze(
    stages
      .filter(value=>value.resumeState==='READY_TO_EXECUTE')
      .map(value=>value.stageId)
      .sort(lexical),
  );

  const plan=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA,
    manifestSha256:verifiedManifest.manifestSha256,
    manifestFileSha256:verifiedManifest.manifestFileSha256,
    specFileSha256:verifiedManifest.manifest.specFileSha256,
    repositoryCommitSha:repository.repositoryCommitSha,
    trackedTreeClean:true,
    verifiedReceipts:Object.freeze(verifiedReceipts),
    ...(verifiedCarryForwards.length>0
      ?{verifiedCarryForwards:Object.freeze(verifiedCarryForwards)}
      :{}),
    stages:Object.freeze(stages),
    readyStageIds,
    pipelineResumeState:resumePipelineState(
      stages,
      verifiedManifest.manifest.pipelineState,
    ),
    plannerExecutesStages:false,
    receiptsGrantSemanticTrust:false,
    externalPinsAutoTrusted:false,
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
  const planBytes=canonicalFileBytes(plan);
  const planFileSha256=sha256Bytes(planBytes);
  const planSha256=domainDigest(
    HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_DOMAIN,
    plan,
  );
  const digest=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_RESUME_PLAN_DIGEST_V1_SCHEMA,
    planSha256,
    planFileSha256,
    manifestSha256:verifiedManifest.manifestSha256,
    manifestFileSha256:verifiedManifest.manifestFileSha256,
    specFileSha256:verifiedManifest.manifest.specFileSha256,
    repositoryCommitSha:repository.repositoryCommitSha,
    pipelineResumeState:plan.pipelineResumeState,
    readyStageIds,
    plannerExecutesStages:false,
    receiptsGrantSemanticTrust:false,
    externalPinsAutoTrusted:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  });

  return Object.freeze({
    plan,
    digest,
    files:Object.freeze({
      plan:planBytes,
      digest:canonicalFileBytes(digest),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const receipts=[];
  const carryForwards=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_resume_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt'){
      receipts.push(value);
      continue;
    }
    if(key==='--carry-forward'){
      carryForwards.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_resume_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--manifest',
    '--manifest-digest',
    '--repo-root',
    '--output-dir',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_resume_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    manifest:single.get('--manifest'),
    manifestDigest:single.get('--manifest-digest'),
    repoRoot:single.get('--repo-root'),
    outputDir:single.get('--output-dir'),
    receipts:Object.freeze(receipts),
    carryForwards:Object.freeze(carryForwards),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await planHsmeReusePipelineResume({
    manifestPath:args.manifest,
    digestPath:args.manifestDigest,
    receiptPaths:args.receipts,
    carryForwardPaths:args.carryForwards,
    repoRoot:args.repoRoot,
  });
  await mkdir(args.outputDir,{recursive:true});
  await Promise.all([
    writeFile(
      resolve(args.outputDir,'hsme-reuse-pipeline-resume-plan.json'),
      result.files.plan,
      {flag:'wx'},
    ),
    writeFile(
      resolve(args.outputDir,'hsme-reuse-pipeline-resume-plan-digest.json'),
      result.files.digest,
      {flag:'wx'},
    ),
  ]);
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_RESUME_PLAN_V1_SCHEMA,
    planSha256:result.digest.planSha256,
    pipelineResumeState:result.plan.pipelineResumeState,
    readyStageIds:result.plan.readyStageIds,
    plannerExecutesStages:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_RESUME_PLANNER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_resume_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function lexical(left,right){
  return left<right?-1:left>right?1:0;
}

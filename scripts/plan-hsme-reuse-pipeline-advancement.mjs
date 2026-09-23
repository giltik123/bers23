#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA,
  canonicalFileBytes,
  domainDigest,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA,
} from './run-hsme-reuse-pipeline-stage.mjs';

export const HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_V1';
export const HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_DIGEST_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_DIGEST_V1';
export const HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-advancement-plan:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const MANIFEST_GATES=new Set([
  'READY',
  'EXTERNAL_PIN_REQUIRED',
  'INPUT_REQUIRED',
  'BLOCKED_BY_PREDECESSOR',
  'PIN_MISMATCH',
]);
const DRIFT_STATES=new Set([
  'RECEIPT_STALE_INPUT_DRIFT',
  'RECEIPT_OUTPUT_DRIFT',
  'RECEIPT_STAGE_DEFINITION_DRIFT',
]);

export class HsmeReusePipelineAdvancementError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineAdvancementError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineAdvancementError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_advancement_record_invalid',path+' must be an object');
  }
  return value;
}

function array(value,path,max=512){
  if(!Array.isArray(value)||value.length>max){
    fail('hsme_reuse_advancement_array_invalid',path+' must be a bounded array');
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
    fail('hsme_reuse_advancement_text_invalid',path+' is invalid');
  }
  return value;
}

function sha256(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_reuse_advancement_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
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
        'hsme_reuse_advancement_authority_invalid',
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
    fail('hsme_reuse_advancement_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_advancement_json_invalid',label+': '+error.message);
  }
  return Object.freeze({path,bytes,value});
}

async function loadVerifiedManifest(manifestPath,digestPath){
  const manifestLoaded=await readJson(manifestPath,'manifest');
  const digestLoaded=await readJson(digestPath,'manifest digest');
  const manifest=object(manifestLoaded.value,'manifest');
  const digest=object(digestLoaded.value,'manifestDigest');

  if(manifest.schemaVersion!==HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_V1_SCHEMA){
    fail('hsme_reuse_advancement_manifest_schema_invalid','manifest schema invalid');
  }
  if(digest.schemaVersion!==HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA){
    fail('hsme_reuse_advancement_manifest_digest_schema_invalid','manifest digest schema invalid');
  }

  const canonical=canonicalFileBytes(manifest);
  if(!canonical.equals(manifestLoaded.bytes)){
    fail(
      'hsme_reuse_advancement_manifest_not_canonical',
      'manifest file bytes differ from canonical bytes',
    );
  }
  const manifestFileSha256=sha256Bytes(canonical);
  if(manifestFileSha256!==digest.manifestFileSha256){
    fail(
      'hsme_reuse_advancement_manifest_file_digest_mismatch',
      'manifest raw SHA differs from digest sidecar',
    );
  }
  const manifestSha256=domainDigest(
    HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
    manifest,
  );
  if(manifestSha256!==digest.manifestSha256){
    fail(
      'hsme_reuse_advancement_manifest_semantic_digest_mismatch',
      'manifest semantic digest differs from digest sidecar',
    );
  }
  if(
    digest.specFileSha256!==manifest.specFileSha256
    ||digest.pipelineState!==manifest.pipelineState
    ||manifest.plannerExecutesStages!==false
    ||manifest.externalPinsAutoTrusted!==false
    ||digest.plannerExecutesStages!==false
    ||digest.externalPinsAutoTrusted!==false
  ){
    fail(
      'hsme_reuse_advancement_manifest_binding_invalid',
      'manifest trust/digest binding invalid',
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

function receiptPayload(receipt){
  const payload={...receipt};
  delete payload.receiptSha256;
  return payload;
}

async function loadVerifiedReceipt(path){
  const loaded=await readJson(path,'receipt');
  const receipt=object(loaded.value,'receipt');
  if(receipt.schemaVersion!==HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA){
    fail('hsme_reuse_advancement_receipt_schema_invalid','receipt schema invalid: '+path);
  }
  const canonical=canonicalFileBytes(receipt);
  if(!canonical.equals(loaded.bytes)){
    fail(
      'hsme_reuse_advancement_receipt_not_canonical',
      'receipt bytes are not canonical: '+path,
    );
  }
  const expected=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
    receiptPayload(receipt),
  );
  if(expected!==receipt.receiptSha256){
    fail(
      'hsme_reuse_advancement_receipt_digest_mismatch',
      'receipt semantic digest mismatch: '+path,
    );
  }
  if(
    receipt.executionState!=='SUCCEEDED'
    ||receipt.outputTrustState!=='OBSERVED_NOT_PIN_AUTHORITY'
    ||receipt.externalPinCreated!==false
    ||receipt.semanticEvidenceAuthorityGranted!==false
  ){
    fail(
      'hsme_reuse_advancement_receipt_trust_boundary_invalid',
      'receipt trust/execution boundary invalid: '+path,
    );
  }
  requireFalseBoundary(receipt,'receipt');
  sha256(receipt.manifestSha256,'receipt.manifestSha256');
  sha256(receipt.manifestFileSha256,'receipt.manifestFileSha256');
  sha256(receipt.specFileSha256,'receipt.specFileSha256');
  sha256(receipt.argvSha256,'receipt.argvSha256');
  sha256(receipt.stageDefinitionSha256,'receipt.stageDefinitionSha256');
  sha256(receipt.stdoutSha256,'receipt.stdoutSha256');
  sha256(receipt.stderrSha256,'receipt.stderrSha256');
  sha256(receipt.receiptSha256,'receipt.receiptSha256');
  text(receipt.stageId,'receipt.stageId',160);
  text(receipt.stageKind,'receipt.stageKind',64);

  const inputs=array(receipt.inputs,'receipt.inputs',128).map((entry,index)=>{
    const value=object(entry,'receipt.inputs['+index+']');
    return Object.freeze({
      path:text(value.path,'receipt.inputs['+index+'].path'),
      fileSha256:sha256(
        value.fileSha256,
        'receipt.inputs['+index+'].fileSha256',
      ),
    });
  });
  const outputs=array(receipt.outputs,'receipt.outputs',64).map((entry,index)=>{
    const value=object(entry,'receipt.outputs['+index+']');
    return Object.freeze({
      path:text(value.path,'receipt.outputs['+index+'].path'),
      fileSha256:sha256(
        value.fileSha256,
        'receipt.outputs['+index+'].fileSha256',
      ),
      bytes:value.bytes,
    });
  });

  return Object.freeze({
    path,
    receipt:Object.freeze({...receipt,inputs:Object.freeze(inputs),outputs:Object.freeze(outputs)}),
  });
}

function currentStageInputs(manifest,stage){
  const entries=array(manifest.inputs,'manifest.inputs',512);
  const byPath=new Map();
  for(const entry of entries){
    const value=object(entry,'manifest.input');
    const path=text(value.path,'manifest.input.path');
    if(byPath.has(path)){
      fail(
        'hsme_reuse_advancement_manifest_input_duplicate',
        'duplicate manifest input '+path,
      );
    }
    byPath.set(path,value);
  }

  return Object.freeze(array(stage.inputs,'stage.inputs',128).map((path,index)=>{
    const normalized=text(path,'stage.inputs['+index+']');
    const entry=byPath.get(normalized);
    return Object.freeze({
      path:normalized,
      state:entry?.state??'MISSING',
      fileSha256:entry?.state==='PRESENT'&&HEX64.test(entry?.fileSha256)
        ?entry.fileSha256
        :null,
    });
  }));
}

function receiptComparableInputs(current){
  return Object.freeze(current.map(value=>Object.freeze({
    path:value.path,
    fileSha256:value.fileSha256,
  })));
}

function sameInputBindings(current,receiptInputs){
  if(current.some(value=>value.state!=='PRESENT'||value.fileSha256===null))return false;
  if(current.length!==receiptInputs.length)return false;
  return current.every((value,index)=>
    value.path===receiptInputs[index].path
    &&value.fileSha256===receiptInputs[index].fileSha256
  );
}

function currentStageDefinitionSha256(stage,currentInputs){
  return domainDigest(
    HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
    {
      stageId:stage.stageId,
      kind:stage.kind,
      env:stage.env,
      argv:stage.argv,
      inputs:receiptComparableInputs(currentInputs),
      outputs:stage.outputs,
    },
  );
}

async function outputsMatchReceipt(stage,receipt){
  const stageOutputs=array(stage.outputs,'stage.outputs',64).map((path,index)=>
    text(path,'stage.outputs['+index+']')
  );
  if(stageOutputs.length!==receipt.outputs.length)return false;
  for(let index=0;index<stageOutputs.length;index+=1){
    const expected=receipt.outputs[index];
    if(stageOutputs[index]!==expected.path)return false;
    let bytes;
    try{
      bytes=await readFile(expected.path);
    }catch{
      return false;
    }
    try{
      JSON.parse(bytes.toString('utf8'));
    }catch{
      return false;
    }
    if(sha256Bytes(bytes)!==expected.fileSha256)return false;
  }
  return true;
}

function advancementStateWithoutReceipt(stage){
  if(!MANIFEST_GATES.has(stage.status)){
    fail(
      'hsme_reuse_advancement_manifest_stage_status_invalid',
      'unsupported manifest stage status '+String(stage.status),
    );
  }
  return stage.status==='READY'?'RUN_REQUIRED':stage.status;
}

function overallState(stagePlans){
  const states=stagePlans.map(value=>value.advancementState);
  if(states.includes('PIN_MISMATCH'))return 'BLOCKED_PIN_MISMATCH';
  if(states.some(value=>DRIFT_STATES.has(value)))return 'BLOCKED_RECEIPT_DRIFT';
  if(states.includes('RUN_REQUIRED'))return 'RUNNABLE';
  if(states.includes('EXTERNAL_PIN_REQUIRED'))return 'WAITING_EXTERNAL_PIN';
  if(states.includes('INPUT_REQUIRED'))return 'WAITING_INPUT';
  if(states.includes('BLOCKED_BY_PREDECESSOR'))return 'BLOCKED_BY_PREDECESSOR';
  if(states.every(value=>value==='VERIFIED_COMPLETE'))return 'OBSERVED_COMPLETE';
  return 'BLOCKED';
}

export async function planHsmeReusePipelineAdvancement({
  manifestPath,
  digestPath,
  receiptPaths,
}){
  const verified=await loadVerifiedManifest(
    resolve(manifestPath),
    resolve(digestPath),
  );
  const loadedReceipts=await Promise.all(
    receiptPaths.map(path=>loadVerifiedReceipt(resolve(path))),
  );
  const receiptByStage=new Map();
  for(const loaded of loadedReceipts){
    const stageId=loaded.receipt.stageId;
    if(receiptByStage.has(stageId)){
      fail(
        'hsme_reuse_advancement_receipt_duplicate',
        'duplicate receipt for stage '+stageId,
      );
    }
    receiptByStage.set(stageId,loaded);
  }

  const manifestStages=array(verified.manifest.stages,'manifest.stages',128);
  const stageById=new Map(manifestStages.map(stage=>[stage.stageId,stage]));
  for(const stageId of receiptByStage.keys()){
    if(!stageById.has(stageId)){
      fail(
        'hsme_reuse_advancement_receipt_stage_unknown',
        'receipt stage absent from current manifest: '+stageId,
      );
    }
  }

  const stagePlans=[];
  for(const stage of manifestStages){
    const receiptLoaded=receiptByStage.get(stage.stageId)??null;
    let advancementState;
    let receiptReusable=false;
    let currentDefinitionSha256=null;
    const currentInputs=currentStageInputs(verified.manifest,stage);

    if(receiptLoaded){
      const receipt=receiptLoaded.receipt;
      if(receipt.stageKind!==stage.kind){
        fail(
          'hsme_reuse_advancement_receipt_stage_kind_mismatch',
          'receipt kind differs from current manifest stage: '+stage.stageId,
        );
      }
      if(!sameInputBindings(currentInputs,receipt.inputs)){
        advancementState='RECEIPT_STALE_INPUT_DRIFT';
      }else{
        currentDefinitionSha256=currentStageDefinitionSha256(stage,currentInputs);
        if(currentDefinitionSha256!==receipt.stageDefinitionSha256){
          advancementState='RECEIPT_STAGE_DEFINITION_DRIFT';
        }else if(!(await outputsMatchReceipt(stage,receipt))){
          advancementState='RECEIPT_OUTPUT_DRIFT';
        }else if(stage.status==='READY'){
          advancementState='VERIFIED_COMPLETE';
          receiptReusable=true;
        }else{
          advancementState=advancementStateWithoutReceipt(stage);
        }
      }
    }else{
      advancementState=advancementStateWithoutReceipt(stage);
    }

    stagePlans.push(Object.freeze({
      stageId:stage.stageId,
      stageKind:stage.kind,
      manifestStatus:stage.status,
      advancementState,
      receiptReusable,
      receiptSha256:receiptLoaded?.receipt.receiptSha256??null,
      receiptManifestSha256:receiptLoaded?.receipt.manifestSha256??null,
      currentStageDefinitionSha256:currentDefinitionSha256,
      currentInputs,
      outputPaths:Object.freeze([...array(stage.outputs,'stage.outputs',64)]),
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

  const runRequiredStageIds=Object.freeze(
    stagePlans
      .filter(value=>value.advancementState==='RUN_REQUIRED')
      .map(value=>value.stageId),
  );
  const externalPinRequiredStageIds=Object.freeze(
    stagePlans
      .filter(value=>value.advancementState==='EXTERNAL_PIN_REQUIRED')
      .map(value=>value.stageId),
  );
  const verifiedCompleteStageIds=Object.freeze(
    stagePlans
      .filter(value=>value.advancementState==='VERIFIED_COMPLETE')
      .map(value=>value.stageId),
  );
  const staleReceiptStageIds=Object.freeze(
    stagePlans
      .filter(value=>DRIFT_STATES.has(value.advancementState))
      .map(value=>value.stageId),
  );
  const manifestRegenerationRequired=
    verifiedCompleteStageIds.length>0
    &&manifestStages.some(stage=>stage.status==='BLOCKED_BY_PREDECESSOR');

  const plan=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_V1_SCHEMA,
    manifestSha256:verified.manifestSha256,
    manifestFileSha256:verified.manifestFileSha256,
    specFileSha256:verified.manifest.specFileSha256,
    currentPipelineState:verified.manifest.pipelineState,
    advancementState:overallState(stagePlans),
    receipts:Object.freeze(
      loadedReceipts
        .map(value=>Object.freeze({
          stageId:value.receipt.stageId,
          receiptSha256:value.receipt.receiptSha256,
          receiptManifestSha256:value.receipt.manifestSha256,
        }))
        .sort((a,b)=>lexical(a.stageId,b.stageId)),
    ),
    stages:Object.freeze(stagePlans),
    runRequiredStageIds,
    externalPinRequiredStageIds,
    verifiedCompleteStageIds,
    staleReceiptStageIds,
    manifestRegenerationRequired,
    executesStages:false,
    createsExternalPins:false,
    receiptTrustAuthorityGranted:false,
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
  const planSha256=domainDigest(
    HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_DIGEST_DOMAIN,
    plan,
  );
  const digest=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_DIGEST_V1_SCHEMA,
    manifestSha256:verified.manifestSha256,
    planSha256,
    planFileSha256:sha256Bytes(planBytes),
    advancementState:plan.advancementState,
    executesStages:false,
    createsExternalPins:false,
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

export async function runCli(argv=process.argv.slice(2)){
  const single=new Map();
  const receipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_advancement_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt'){
      receipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_advancement_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of ['--manifest','--manifest-digest','--output-dir']){
    if(!single.has(key)){
      fail('hsme_reuse_advancement_cli_invalid','missing '+key);
    }
  }

  const outputDir=resolve(single.get('--output-dir'));
  const planPath=resolve(outputDir,'hsme-reuse-pipeline-advancement-plan.json');
  const digestPath=resolve(outputDir,'hsme-reuse-pipeline-advancement-plan-digest.json');
  const inputPaths=[
    resolve(single.get('--manifest')),
    resolve(single.get('--manifest-digest')),
    ...receipts.map(value=>resolve(value)),
  ];
  if(inputPaths.includes(planPath)||inputPaths.includes(digestPath)){
    fail(
      'hsme_reuse_advancement_output_collision',
      'advancement output collides with input',
    );
  }

  const result=await planHsmeReusePipelineAdvancement({
    manifestPath:single.get('--manifest'),
    digestPath:single.get('--manifest-digest'),
    receiptPaths:receipts,
  });
  await mkdir(outputDir,{recursive:true});
  await Promise.all([
    writeFile(planPath,result.files.plan),
    writeFile(digestPath,result.files.digest),
  ]);

  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_ADVANCEMENT_PLAN_DIGEST_V1_SCHEMA,
    advancementState:result.plan.advancementState,
    runRequiredStageIds:result.plan.runRequiredStageIds,
    externalPinRequiredStageIds:result.plan.externalPinRequiredStageIds,
    staleReceiptStageIds:result.plan.staleReceiptStageIds,
    planSha256:result.digest.planSha256,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_ADVANCEMENT_PLANNER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_advancement_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function lexical(left,right){
  return left<right?-1:left>right?1:0;
}

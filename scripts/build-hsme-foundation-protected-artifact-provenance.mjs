#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {lstat, readFile, readdir, writeFile} from 'node:fs/promises';
import {basename, join} from 'node:path';

import {
  verify as verifyBenchmarkEvidence,
} from './hsme-foundation-benchmark-executor-verify.mjs';
import {
  verifyResourceFragment,
} from './hsme-foundation-resource-fragment-verify.mjs';

export const HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1';
export const HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_DIGEST_DOMAIN =
  'bers:hsme:foundation-protected-artifact-provenance:v1\0';
export const HSME_FOUNDATION_PROTECTED_EXECUTOR_WORKFLOW =
  '.github/workflows/hsme-2a-3-3b-protected-foundation-executor.yml';

const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const DIGITS=/^[1-9][0-9]*$/;
const REPOSITORY=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class HsmeFoundationProtectedArtifactProvenanceError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeFoundationProtectedArtifactProvenanceError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeFoundationProtectedArtifactProvenanceError(code,message);
}

export function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort(lexical).map(key=>[key,canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalBytes(value){
  return Buffer.from(JSON.stringify(canonicalValue(value)),'utf8');
}

export function canonicalFileBytes(value){
  return Buffer.concat([canonicalBytes(value),Buffer.from('\n','utf8')]);
}

export function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

export function provenanceDigest(value){
  return sha256Bytes(Buffer.concat([
    Buffer.from(HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_DIGEST_DOMAIN,'utf8'),
    canonicalBytes(value),
  ]));
}

async function json(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_protected_provenance_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_protected_provenance_json_invalid',label+': '+error.message);
  }
  return Object.freeze({path,bytes,value});
}

async function recordFile(path,logicalPath){
  const stat=await lstat(path).catch(error=>{
    fail('hsme_protected_provenance_file_missing',logicalPath+': '+error.message);
  });
  if(!stat.isFile()||stat.isSymbolicLink()){
    fail('hsme_protected_provenance_file_type_invalid',logicalPath+' must be a regular file');
  }
  const bytes=await readFile(path);
  return Object.freeze({
    logicalPath,
    fileSha256:sha256Bytes(bytes),
    bytes:bytes.length,
  });
}

function requireAuthorityFalse(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_protected_provenance_record_invalid',label+' must be an object');
  }
  for(const field of [
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed',
    'winnerSelectionAllowed',
  ]){
    if(Object.hasOwn(value,field)&&value[field]!==false){
      fail('hsme_protected_provenance_authority_widening',label+'.'+field+' must remain false');
    }
  }
}

function positiveIntegerString(value,label){
  const text=String(value);
  if(!DIGITS.test(text)||text.length>32){
    fail('hsme_protected_provenance_integer_invalid',label+' must be a positive decimal integer');
  }
  return text;
}

function safeRepository(value){
  if(typeof value!=='string'||!REPOSITORY.test(value)){
    fail('hsme_protected_provenance_repository_invalid','repository must be owner/name');
  }
  return value;
}

function exactRecord(raw,allowed,path){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_protected_provenance_record_invalid',path+' must be an object');
  }
  for(const key of Object.keys(raw)){
    if(!allowed.includes(key)){
      fail('hsme_protected_provenance_field_unknown',path+'.'+key+' is not allowed');
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(raw,key)){
      fail('hsme_protected_provenance_field_missing',path+'.'+key+' is required');
    }
  }
  return raw;
}

function normalizeFileRecord(raw,path){
  const value=exactRecord(raw,['logicalPath','fileSha256','bytes'],path);
  if(
    typeof value.logicalPath!=='string'
    ||value.logicalPath.length<1
    ||value.logicalPath.length>512
    ||value.logicalPath.startsWith('/')
    ||value.logicalPath.includes('\\')
    ||value.logicalPath.split('/').some(part=>part===''||part==='.'||part==='..')
  ){
    fail('hsme_protected_provenance_logical_path_invalid',path+'.logicalPath invalid');
  }
  if(typeof value.fileSha256!=='string'||!HEX64.test(value.fileSha256)){
    fail('hsme_protected_provenance_file_sha_invalid',path+'.fileSha256 invalid');
  }
  if(!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>256_000_000){
    fail('hsme_protected_provenance_file_bytes_invalid',path+'.bytes invalid');
  }
  return Object.freeze({
    logicalPath:value.logicalPath,
    fileSha256:value.fileSha256,
    bytes:value.bytes,
  });
}

function normalizeFileList(raw,path,max){
  if(!Array.isArray(raw)||raw.length>max){
    fail('hsme_protected_provenance_file_list_invalid',path+' must be a bounded array');
  }
  const out=raw.map((value,index)=>normalizeFileRecord(value,path+'['+index+']'))
    .sort(compareFileRecord);
  const keys=out.map(value=>value.logicalPath);
  if(new Set(keys).size!==keys.length){
    fail('hsme_protected_provenance_file_list_duplicate',path+' contains duplicate logical paths');
  }
  return Object.freeze(out);
}

export function normalizeHsmeFoundationProtectedArtifactProvenance(raw){
  const allowed=[
    'schemaVersion','repository','workflowPath','workflowRunId','workflowRunAttempt',
    'candidateCommitSha','controllerCommitSha','campaignId','candidateId','capability',
    'runStatus','blindArtifactName','resourceArtifactName','commonFiles','blindFiles',
    'resourceFiles','externallyPinnedBeforeIntake','qualityScoringAllowed',
    'candidateQualificationAllowed','candidateRejectionAllowed',
    'trainingOrDistillationAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed',
  ];
  const value=exactRecord(raw,allowed,'provenance');
  if(value.schemaVersion!==HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA){
    fail('hsme_protected_provenance_schema_invalid','provenance schema invalid');
  }
  const repository=safeRepository(value.repository);
  if(value.workflowPath!==HSME_FOUNDATION_PROTECTED_EXECUTOR_WORKFLOW){
    fail('hsme_protected_provenance_workflow_invalid','workflow path mismatch');
  }
  const workflowRunId=positiveIntegerString(value.workflowRunId,'workflowRunId');
  const workflowRunAttempt=positiveIntegerString(value.workflowRunAttempt,'workflowRunAttempt');
  if(!HEX40.test(value.candidateCommitSha)||!HEX40.test(value.controllerCommitSha)){
    fail('hsme_protected_provenance_commit_invalid','commit binding invalid');
  }
  if(
    typeof value.campaignId!=='string'||value.campaignId.length<1||value.campaignId.length>160
    ||typeof value.candidateId!=='string'||value.candidateId.length<1||value.candidateId.length>120
    ||!['TEXT_TO_IMAGE','IMAGE_EDITING'].includes(value.capability)
    ||!['COMPLETE','FAILED'].includes(value.runStatus)
  ){
    fail('hsme_protected_provenance_identity_invalid','campaign/candidate/capability/status invalid');
  }
  const blindArtifactName='hsme-foundation-blind-evidence-'+workflowRunId;
  if(value.blindArtifactName!==blindArtifactName){
    fail('hsme_protected_provenance_blind_name_invalid','blind artifact name mismatch');
  }
  const expectedResource=value.runStatus==='COMPLETE'
    ?'hsme-foundation-resource-evidence-'+workflowRunId
    :null;
  if(value.resourceArtifactName!==expectedResource){
    fail('hsme_protected_provenance_resource_name_invalid','resource artifact name mismatch');
  }

  const commonFiles=normalizeFileList(value.commonFiles,'provenance.commonFiles',8);
  const blindFiles=normalizeFileList(value.blindFiles,'provenance.blindFiles',4098);
  const resourceFiles=normalizeFileList(value.resourceFiles,'provenance.resourceFiles',16);
  const commonNames=commonFiles.map(x=>x.logicalPath);
  if(JSON.stringify(commonNames)!==JSON.stringify([
    'candidate-run.json','execution-plan.json','runtime-inventory.json',
  ])){
    fail('hsme_protected_provenance_common_set_invalid','common file set invalid');
  }
  if(value.runStatus==='COMPLETE'){
    if(!blindFiles.some(x=>x.logicalPath==='review-package.json')
      ||blindFiles.some(x=>x.logicalPath==='failure-evidence.json')
      ||blindFiles.filter(x=>x.logicalPath.startsWith('review/')).length<1){
      fail('hsme_protected_provenance_complete_blind_set_invalid','COMPLETE blind file set invalid');
    }
    const resourceNames=resourceFiles.map(x=>x.logicalPath);
    if(JSON.stringify(resourceNames)!==JSON.stringify([
      'resource-hardware-profile.json',
      'resource-measurement-evidence.json',
      'resource-measurement-method.json',
      'resource-measurement.json',
    ])){
      fail('hsme_protected_provenance_resource_set_invalid','COMPLETE resource file set invalid');
    }
  }else{
    if(
      blindFiles.length!==1
      ||blindFiles[0].logicalPath!=='failure-evidence.json'
      ||resourceFiles.length!==0
    ){
      fail('hsme_protected_provenance_failed_set_invalid','FAILED artifact file set invalid');
    }
  }

  for(const field of [
    'externallyPinnedBeforeIntake','qualityScoringAllowed','candidateQualificationAllowed',
    'candidateRejectionAllowed','trainingOrDistillationAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed',
  ]){
    if(value[field]!==false){
      fail('hsme_protected_provenance_authority_widening','provenance.'+field+' must remain false');
    }
  }

  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA,
    repository,
    workflowPath:HSME_FOUNDATION_PROTECTED_EXECUTOR_WORKFLOW,
    workflowRunId,
    workflowRunAttempt,
    candidateCommitSha:value.candidateCommitSha,
    controllerCommitSha:value.controllerCommitSha,
    campaignId:value.campaignId,
    candidateId:value.candidateId,
    capability:value.capability,
    runStatus:value.runStatus,
    blindArtifactName,
    resourceArtifactName:expectedResource,
    commonFiles,
    blindFiles,
    resourceFiles,
    externallyPinnedBeforeIntake:false,
    qualityScoringAllowed:false,
    candidateQualificationAllowed:false,
    candidateRejectionAllowed:false,
    trainingOrDistillationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
  });
}

async function reviewImageRecords(reviewPath,reviewDir){
  const review=(await json(reviewPath,'review package')).value;
  if(!Array.isArray(review.outputs)||review.outputs.length<1||review.outputs.length>4096){
    fail('hsme_protected_provenance_review_outputs_invalid','review outputs must be bounded and non-empty');
  }
  const expected=[...review.outputs].map(value=>{
    if(
      !value
      ||typeof value.relativePath!=='string'
      ||value.relativePath!==value.blindId+'.png'
      ||value.relativePath.includes('/')
      ||value.relativePath.includes('\\')
    ){
      fail('hsme_protected_provenance_review_path_invalid','review relativePath invalid');
    }
    return value.relativePath;
  }).sort(lexical);
  if(new Set(expected).size!==expected.length){
    fail('hsme_protected_provenance_review_path_duplicate','review image paths must be unique');
  }

  const entries=await readdir(reviewDir,{withFileTypes:true});
  const actual=[];
  for(const entry of entries){
    if(entry.isSymbolicLink()||!entry.isFile()){
      fail('hsme_protected_provenance_review_entry_invalid','review directory may contain regular files only');
    }
    if(!entry.name.endsWith('.png')){
      fail('hsme_protected_provenance_review_entry_invalid','unexpected review file '+entry.name);
    }
    actual.push(entry.name);
  }
  actual.sort(lexical);
  if(JSON.stringify(actual)!==JSON.stringify(expected)){
    fail('hsme_protected_provenance_review_set_mismatch','review PNG set differs from review package');
  }

  const records=[];
  for(const name of expected){
    records.push(await recordFile(join(reviewDir,name),'review/'+name));
  }
  return Object.freeze(records);
}

export async function buildHsmeFoundationProtectedArtifactProvenance({
  planPath,
  runPath,
  inventoryPath,
  reviewPath=null,
  reviewDir=null,
  failurePath=null,
  resourcePath=null,
  hardwareProfilePath=null,
  measurementMethodPath=null,
  measurementEvidencePath=null,
  workflowRunId,
  workflowRunAttempt,
  repository,
  workflowPath=HSME_FOUNDATION_PROTECTED_EXECUTOR_WORKFLOW,
}){
  const run=await verifyBenchmarkEvidence({
    plan:planPath,
    run:runPath,
    inventory:inventoryPath,
    ...(reviewPath?{review:reviewPath}:{}),
    ...(reviewDir?{reviewDir}:{}),
    ...(failurePath?{failure:failurePath}:{}),
  });
  const plan=(await json(planPath,'execution plan')).value;
  requireAuthorityFalse(plan,'execution plan');
  requireAuthorityFalse(run,'candidate run');

  if(plan.disposition!=='EXECUTE'){
    fail('hsme_protected_provenance_plan_not_execute','protected artifact provenance requires EXECUTE plan');
  }
  if(!HEX40.test(plan.candidateSha)||!HEX40.test(plan.controllerMainSha)){
    fail('hsme_protected_provenance_commit_invalid','execution plan commit binding invalid');
  }
  if(
    run.candidateId!==plan.candidateId
    ||run.capability!==plan.capability
    ||!['COMPLETE','FAILED'].includes(run.status)
  ){
    fail('hsme_protected_provenance_run_binding_invalid','candidate run binding invalid');
  }

  const complete=run.status==='COMPLETE';
  const resourceArgs=[
    resourcePath,hardwareProfilePath,measurementMethodPath,measurementEvidencePath,
  ];
  if(complete){
    if(!reviewPath||!reviewDir||failurePath){
      fail('hsme_protected_provenance_complete_shape_invalid','COMPLETE requires review and forbids failure evidence');
    }
    if(resourceArgs.some(value=>!value)){
      fail('hsme_protected_provenance_resource_required','COMPLETE requires full resource evidence');
    }
    await verifyResourceFragment({
      planPath,
      runPath,
      inventoryPath,
      resourcePath,
      hardwareProfilePath,
      measurementMethodPath,
      measurementEvidencePath,
    });
  }else{
    if(!failurePath||reviewPath||reviewDir||resourceArgs.some(Boolean)){
      fail('hsme_protected_provenance_failed_shape_invalid','FAILED requires failure evidence only');
    }
  }

  const commonFiles=Object.freeze([
    await recordFile(planPath,'execution-plan.json'),
    await recordFile(runPath,'candidate-run.json'),
    await recordFile(inventoryPath,'runtime-inventory.json'),
  ].sort(compareFileRecord));

  const blindFiles=[
    ...(complete
      ?[
        await recordFile(reviewPath,'review-package.json'),
        ...await reviewImageRecords(reviewPath,reviewDir),
      ]
      :[
        await recordFile(failurePath,'failure-evidence.json'),
      ]),
  ].sort(compareFileRecord);

  const resourceFiles=complete
    ?Object.freeze([
      await recordFile(resourcePath,'resource-measurement.json'),
      await recordFile(hardwareProfilePath,'resource-hardware-profile.json'),
      await recordFile(measurementMethodPath,'resource-measurement-method.json'),
      await recordFile(measurementEvidencePath,'resource-measurement-evidence.json'),
    ].sort(compareFileRecord))
    :Object.freeze([]);

  const runId=positiveIntegerString(workflowRunId,'workflowRunId');
  const attempt=positiveIntegerString(workflowRunAttempt,'workflowRunAttempt');
  const repo=safeRepository(repository);
  if(workflowPath!==HSME_FOUNDATION_PROTECTED_EXECUTOR_WORKFLOW){
    fail('hsme_protected_provenance_workflow_invalid','workflow path mismatch');
  }

  const manifest=normalizeHsmeFoundationProtectedArtifactProvenance({
    schemaVersion:HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA,
    repository:repo,
    workflowPath,
    workflowRunId:runId,
    workflowRunAttempt:attempt,
    candidateCommitSha:plan.candidateSha,
    controllerCommitSha:plan.controllerMainSha,
    campaignId:plan.campaignId,
    candidateId:run.candidateId,
    capability:run.capability,
    runStatus:run.status,
    blindArtifactName:'hsme-foundation-blind-evidence-'+runId,
    resourceArtifactName:complete?'hsme-foundation-resource-evidence-'+runId:null,
    commonFiles,
    blindFiles:Object.freeze(blindFiles),
    resourceFiles,
    externallyPinnedBeforeIntake:false,
    qualityScoringAllowed:false,
    candidateQualificationAllowed:false,
    candidateRejectionAllowed:false,
    trainingOrDistillationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
  });

  return Object.freeze({
    manifest,
    manifestSha256:provenanceDigest(manifest),
    manifestFileSha256:sha256Bytes(canonicalFileBytes(manifest)),
    bytes:canonicalFileBytes(manifest),
  });
}

function parseArgs(argv){
  const out=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined){
      fail('hsme_protected_provenance_cli_invalid','arguments must be --key value pairs');
    }
    if(out.has(key))fail('hsme_protected_provenance_cli_invalid','duplicate '+key);
    out.set(key,value);
  }
  for(const key of [
    '--plan','--run','--inventory','--workflow-run-id','--workflow-run-attempt',
    '--repository','--workflow','--out',
  ]){
    if(!out.has(key))fail('hsme_protected_provenance_cli_invalid','missing '+key);
  }
  return out;
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const run=(await json(args.get('--run'),'candidate run')).value;
  const complete=run.status==='COMPLETE';
  const result=await buildHsmeFoundationProtectedArtifactProvenance({
    planPath:args.get('--plan'),
    runPath:args.get('--run'),
    inventoryPath:args.get('--inventory'),
    reviewPath:complete?args.get('--review'):null,
    reviewDir:complete?args.get('--review-dir'):null,
    failurePath:complete?null:args.get('--failure'),
    resourcePath:complete?args.get('--resource'):null,
    hardwareProfilePath:complete?args.get('--hardware-profile'):null,
    measurementMethodPath:complete?args.get('--measurement-method'):null,
    measurementEvidencePath:complete?args.get('--measurement-evidence'):null,
    workflowRunId:args.get('--workflow-run-id'),
    workflowRunAttempt:args.get('--workflow-run-attempt'),
    repository:args.get('--repository'),
    workflowPath:args.get('--workflow'),
  });
  await writeFile(args.get('--out'),result.bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA,
    candidateId:result.manifest.candidateId,
    capability:result.manifest.capability,
    runStatus:result.manifest.runStatus,
    manifestSha256:result.manifestSha256,
    manifestFileSha256:result.manifestFileSha256,
    externallyPinnedBeforeIntake:false,
  })+'\n');
}

if(process.env.HSME_FOUNDATION_PROTECTED_PROVENANCE_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write((error.code||'hsme_protected_provenance_failed')+': '+error.message+'\n');
    process.exitCode=1;
  });
}

function compareFileRecord(a,b){return lexical(a.logicalPath,b.logicalPath);}
function lexical(a,b){return a<b?-1:a>b?1:0;}

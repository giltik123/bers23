#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {
  lstat, mkdir, readFile, readdir, realpath, rm, writeFile,
} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';

import {
  ACCEPTED_EXECUTOR_BASE_SHA,
  MANIFEST_SCHEMA,
  collectFoundationEvidence,
} from './hsme-foundation-benchmark-evidence-collector.mjs';
import {
  HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1_SCHEMA,
  collectFoundationResourceEvidence,
} from './hsme-foundation-resource-evidence-collector.mjs';
import {
  intakeReceiptDigest,
  normalizeHsmeFoundationProtectedArtifactIntakeReceipt,
} from './intake-hsme-foundation-protected-artifacts.mjs';
import {
  canonicalFileBytes,
} from './build-hsme-foundation-protected-artifact-provenance.mjs';

export const HSME_FOUNDATION_MANUAL_DISPATCH_LEDGER_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_MANUAL_DISPATCH_LEDGER_V1';
export const HSME_FOUNDATION_COLLECTION_PACKAGE_RECEIPT_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_COLLECTION_PACKAGE_RECEIPT_V1';
export const HSME_FOUNDATION_COLLECTION_PACKAGE_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:foundation-collection-package-receipt:v1\0';

const DISPATCH_MATRIX_REL =
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-dispatch-matrix.v1.json';
const CAMPAIGN_REL =
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json';
const RECEIPT_NAME='protected-artifact-intake-receipt.json';
const PROVENANCE_NAME='protected-artifact-provenance.json';
const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=new Set(['TEXT_TO_IMAGE','IMAGE_EDITING']);
const KINDS=new Set(['PROTECTED_INTAKE','TERMINAL_PLAN']);

export class HsmeFoundationCollectorManifestAssemblerError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeFoundationCollectorManifestAssemblerError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeFoundationCollectorManifestAssemblerError(code,message);
}

function sha256Bytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

function stable(value){
  return JSON.stringify(value,null,2)+'\n';
}

function stableBytes(value){
  return Buffer.from(stable(value),'utf8');
}

function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort(lexical).map(key=>[key,canonicalValue(value[key])]),
    );
  }
  return value;
}

export function collectionPackageReceiptDigest(value){
  return sha256Bytes(Buffer.concat([
    Buffer.from(HSME_FOUNDATION_COLLECTION_PACKAGE_RECEIPT_DIGEST_DOMAIN,'utf8'),
    Buffer.from(JSON.stringify(canonicalValue(value)),'utf8'),
  ]));
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_collection_assembler_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_collection_assembler_json_invalid',label+': '+error.message);
  }
  return Object.freeze({path,bytes,value,fileSha256:sha256Bytes(bytes)});
}

function exactRecord(raw,allowed,path){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_collection_assembler_record_invalid',path+' must be an object');
  }
  for(const key of Object.keys(raw)){
    if(!allowed.includes(key)){
      fail('hsme_collection_assembler_field_unknown',path+'.'+key+' is not allowed');
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(raw,key)){
      fail('hsme_collection_assembler_field_missing',path+'.'+key+' is required');
    }
  }
  return raw;
}

function safeRel(value,path,max=640){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.startsWith('/')
    ||value.includes('\\')
    ||value.split('/').some(part=>part===''||part==='.'||part==='..')
  ){
    fail('hsme_collection_assembler_path_invalid',path+' must be safe relative path');
  }
  return value;
}

function sha256(value,path){
  if(typeof value!=='string'||!HEX64.test(value)){
    fail('hsme_collection_assembler_sha_invalid',path+' must be lowercase SHA-256');
  }
  return value;
}

function positiveInteger(value,path){
  if(!Number.isSafeInteger(value)||value<1){
    fail('hsme_collection_assembler_integer_invalid',path+' must be positive safe integer');
  }
  return value;
}

async function containedDirectory(root,relativePath,label){
  const rootReal=await realpath(root);
  const relative=safeRel(relativePath,label);
  const candidate=resolve(rootReal,relative);
  let stat;
  try{
    stat=await lstat(candidate);
  }catch{
    fail('hsme_collection_assembler_path_missing',label+' missing: '+relative);
  }
  if(stat.isSymbolicLink()||!stat.isDirectory()){
    fail('hsme_collection_assembler_directory_invalid',label+' must be real directory');
  }
  const real=await realpath(candidate);
  if(real!==rootReal&&!real.startsWith(rootReal+sep)){
    fail('hsme_collection_assembler_path_escape',label+' escapes repository root');
  }
  return Object.freeze({relative,real});
}

async function regularFile(path,label){
  let stat;
  try{
    stat=await lstat(path);
  }catch{
    fail('hsme_collection_assembler_file_missing',label+' missing');
  }
  if(stat.isSymbolicLink()||!stat.isFile()){
    fail('hsme_collection_assembler_file_type_invalid',label+' must be regular file');
  }
  const bytes=await readFile(path);
  return Object.freeze({
    path,bytes,fileSha256:sha256Bytes(bytes),bytesLength:bytes.length,
  });
}

function requireAuthorityFalse(value,label){
  for(const field of [
    'qualityScoringAllowed',
    'candidateQualificationAllowed',
    'candidateRejectionAllowed',
    'trainingOrDistillationAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
  ]){
    if(Object.hasOwn(value,field)&&value[field]!==false){
      fail('hsme_collection_assembler_authority_widening',label+'.'+field+' must remain false');
    }
  }
}

function validateDispatchMatrix(raw,campaign){
  const matrix=exactRecord(raw,[
    'schemaVersion','acceptedExecutorBaseSha','campaignId','candidateShaInput','rows',
    'manualDispatchOnly','ordinaryCiDispatchAllowed','candidateOutputsObserved',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed',
    'winnerSelectionAllowed',
  ],'dispatchMatrix');
  if(matrix.schemaVersion!=='BERS_HSME_FOUNDATION_BENCHMARK_DISPATCH_MATRIX_V1'){
    fail('hsme_collection_assembler_matrix_schema','dispatch matrix schema invalid');
  }
  if(
    matrix.acceptedExecutorBaseSha!==ACCEPTED_EXECUTOR_BASE_SHA
    ||matrix.candidateShaInput!==ACCEPTED_EXECUTOR_BASE_SHA
    ||matrix.campaignId!==campaign.campaignId
  ){
    fail('hsme_collection_assembler_matrix_identity','dispatch matrix identity drift');
  }
  if(
    matrix.manualDispatchOnly!==true
    ||matrix.ordinaryCiDispatchAllowed!==false
    ||matrix.candidateOutputsObserved!==false
  ){
    fail('hsme_collection_assembler_matrix_state','dispatch matrix state invalid');
  }
  requireAuthorityFalse(matrix,'dispatchMatrix');
  if(!Array.isArray(matrix.rows)||matrix.rows.length!==12){
    fail('hsme_collection_assembler_matrix_rows','dispatch matrix must contain 12 rows');
  }
  const rows=matrix.rows.map((rawRow,index)=>{
    const row=exactRecord(
      rawRow,
      ['candidateId','capability','currentExpectedDisposition'],
      'dispatchMatrix.rows['+index+']',
    );
    if(
      typeof row.candidateId!=='string'
      ||!campaign.candidates.some(candidate=>candidate.candidateId===row.candidateId)
      ||!CAPABILITIES.has(row.capability)
      ||!['EXECUTE','NOT_APPLICABLE','BLOCKED_PARITY_PENDING']
        .includes(row.currentExpectedDisposition)
    ){
      fail('hsme_collection_assembler_matrix_row','dispatch matrix row invalid');
    }
    return Object.freeze({...row});
  }).sort(compareCandidateCapability);
  const keys=rows.map(row=>row.candidateId+'\0'+row.capability);
  if(new Set(keys).size!==12){
    fail('hsme_collection_assembler_matrix_duplicate','dispatch matrix rows duplicate');
  }
  return Object.freeze({...matrix,rows:Object.freeze(rows)});
}

export function normalizeHsmeFoundationManualDispatchLedger(raw,matrix,campaign){
  const ledger=exactRecord(raw,[
    'schemaVersion','acceptedExecutorBaseSha','controllerCommitSha','campaignId','rows',
    'qualityScoringAllowed','candidateQualificationAllowed','candidateRejectionAllowed',
    'trainingOrDistillationAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed',
  ],'ledger');
  if(ledger.schemaVersion!==HSME_FOUNDATION_MANUAL_DISPATCH_LEDGER_V1_SCHEMA){
    fail('hsme_collection_assembler_ledger_schema','manual dispatch ledger schema invalid');
  }
  if(
    ledger.acceptedExecutorBaseSha!==ACCEPTED_EXECUTOR_BASE_SHA
    ||ledger.campaignId!==campaign.campaignId
    ||!HEX40.test(ledger.controllerCommitSha)
  ){
    fail('hsme_collection_assembler_ledger_identity','manual dispatch ledger identity invalid');
  }
  requireAuthorityFalse(ledger,'ledger');
  if(!Array.isArray(ledger.rows)||ledger.rows.length!==12){
    fail('hsme_collection_assembler_ledger_rows','manual dispatch ledger must contain 12 rows');
  }
  const matrixByKey=new Map(
    matrix.rows.map(row=>[row.candidateId+'\0'+row.capability,row]),
  );
  const rows=ledger.rows.map((rawRow,index)=>{
    const row=exactRecord(rawRow,[
      'candidateId','capability','workflowRunId','evidenceKind','workspacePath',
      'intakeReceiptSha256','resourceArtifactId',
    ],'ledger.rows['+index+']');
    const key=row.candidateId+'\0'+row.capability;
    const matrixRow=matrixByKey.get(key);
    if(!matrixRow||!CAPABILITIES.has(row.capability)||!KINDS.has(row.evidenceKind)){
      fail('hsme_collection_assembler_ledger_row','manual dispatch ledger row invalid');
    }
    const workflowRunId=positiveInteger(
      row.workflowRunId,
      'ledger.rows['+index+'].workflowRunId',
    );
    const workspacePath=safeRel(
      row.workspacePath,
      'ledger.rows['+index+'].workspacePath',
    );
    if(matrixRow.currentExpectedDisposition==='EXECUTE'){
      if(row.evidenceKind!=='PROTECTED_INTAKE'){
        fail('hsme_collection_assembler_ledger_kind','EXECUTE row requires protected intake');
      }
      sha256(row.intakeReceiptSha256,'ledger.rows['+index+'].intakeReceiptSha256');
      if(row.resourceArtifactId!==null)positiveInteger(
        row.resourceArtifactId,
        'ledger.rows['+index+'].resourceArtifactId',
      );
    }else{
      if(
        row.evidenceKind!=='TERMINAL_PLAN'
        ||row.intakeReceiptSha256!==null
        ||row.resourceArtifactId!==null
      ){
        fail('hsme_collection_assembler_ledger_kind','terminal row ledger shape invalid');
      }
    }
    return Object.freeze({
      candidateId:row.candidateId,
      capability:row.capability,
      workflowRunId,
      evidenceKind:row.evidenceKind,
      workspacePath,
      intakeReceiptSha256:row.intakeReceiptSha256,
      resourceArtifactId:row.resourceArtifactId,
      expectedDisposition:matrixRow.currentExpectedDisposition,
    });
  }).sort(compareCandidateCapability);
  const keys=rows.map(row=>row.candidateId+'\0'+row.capability);
  const matrixKeys=matrix.rows.map(row=>row.candidateId+'\0'+row.capability);
  if(JSON.stringify(keys)!==JSON.stringify(matrixKeys)){
    fail('hsme_collection_assembler_ledger_roster','ledger must exactly cover dispatch matrix');
  }
  if(new Set(rows.map(row=>row.workflowRunId)).size!==12){
    fail('hsme_collection_assembler_ledger_run_duplicate','workflowRunId must be unique');
  }
  if(new Set(rows.map(row=>row.workspacePath)).size!==12){
    fail('hsme_collection_assembler_ledger_workspace_duplicate','workspacePath must be unique');
  }
  const resourceIds=rows
    .map(row=>row.resourceArtifactId)
    .filter(value=>value!==null);
  if(new Set(resourceIds).size!==resourceIds.length){
    fail('hsme_collection_assembler_ledger_artifact_duplicate','resource artifact ids must be unique');
  }
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_MANUAL_DISPATCH_LEDGER_V1_SCHEMA,
    acceptedExecutorBaseSha:ACCEPTED_EXECUTOR_BASE_SHA,
    controllerCommitSha:ledger.controllerCommitSha,
    campaignId:campaign.campaignId,
    rows:Object.freeze(rows),
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

async function verifyReceiptWorkspace(repoRoot,ledger,row){
  const workspace=await containedDirectory(
    repoRoot,
    row.workspacePath,
    'protected intake workspace',
  );
  const receiptLoaded=await readJson(
    join(workspace.real,RECEIPT_NAME),
    'protected intake receipt',
  );
  const receipt=normalizeHsmeFoundationProtectedArtifactIntakeReceipt(
    receiptLoaded.value,
  );
  const canonical=canonicalFileBytes(receipt);
  if(!canonical.equals(receiptLoaded.bytes)){
    fail('hsme_collection_assembler_receipt_not_canonical','intake receipt bytes are not canonical');
  }
  const semanticSha256=intakeReceiptDigest(receipt);
  if(semanticSha256!==row.intakeReceiptSha256){
    fail('hsme_collection_assembler_receipt_pin_mismatch','intake receipt digest differs from ledger pin');
  }
  if(
    receipt.campaignId!==ledger.campaignId
    ||receipt.candidateId!==row.candidateId
    ||receipt.capability!==row.capability
    ||Number(receipt.workflowRunId)!==row.workflowRunId
    ||receipt.candidateCommitSha!==ACCEPTED_EXECUTOR_BASE_SHA
    ||receipt.controllerCommitSha!==ledger.controllerCommitSha
  ){
    fail('hsme_collection_assembler_receipt_identity','intake receipt identity differs from ledger');
  }
  const provenance=await regularFile(
    join(workspace.real,PROVENANCE_NAME),
    'protected provenance manifest',
  );
  if(provenance.fileSha256!==receipt.provenanceFileSha256){
    fail('hsme_collection_assembler_provenance_file_drift','provenance file differs from intake receipt');
  }

  for(const file of receipt.copiedFiles){
    const loaded=await regularFile(
      join(workspace.real,...file.destinationPath.split('/')),
      'receipt copied file '+file.destinationPath,
    );
    if(loaded.fileSha256!==file.fileSha256||loaded.bytesLength!==file.bytes){
      fail('hsme_collection_assembler_receipt_file_drift','intake workspace file differs from receipt');
    }
  }

  if(receipt.runStatus==='COMPLETE'){
    if(row.resourceArtifactId===null){
      fail('hsme_collection_assembler_resource_artifact_missing','COMPLETE intake requires resource artifact id');
    }
  }else if(row.resourceArtifactId!==null){
    fail('hsme_collection_assembler_resource_artifact_forbidden','FAILED intake forbids resource artifact id');
  }

  return Object.freeze({
    benchmarkBundlePath:safeRel(
      row.workspacePath+'/'+receipt.benchmarkCollectorBundlePath,
      'benchmark bundle path',
    ),
    resourceBundlePath:receipt.resourceCollectorBundlePath
      ?safeRel(
        row.workspacePath+'/'+receipt.resourceCollectorBundlePath,
        'resource bundle path',
      )
      :null,
    runStatus:receipt.runStatus,
    intakeReceiptSha256:semanticSha256,
    intakeReceiptFileSha256:receiptLoaded.fileSha256,
    provenanceSha256:receipt.provenanceSha256,
    provenanceFileSha256:receipt.provenanceFileSha256,
  });
}

async function verifyTerminalWorkspace(repoRoot,ledger,row){
  const workspace=await containedDirectory(
    repoRoot,
    row.workspacePath,
    'terminal plan workspace',
  );
  const entries=await readdir(workspace.real,{withFileTypes:true});
  const names=[];
  for(const entry of entries){
    if(entry.isSymbolicLink()||!entry.isFile()){
      fail('hsme_collection_assembler_terminal_roster','terminal plan workspace must contain regular files only');
    }
    names.push(entry.name);
  }
  names.sort(lexical);
  if(JSON.stringify(names)!==JSON.stringify(['execution-plan.json','terminal-row.json'])){
    fail('hsme_collection_assembler_terminal_roster','terminal plan workspace file roster invalid');
  }
  const planLoaded=await readJson(
    join(workspace.real,'execution-plan.json'),
    'terminal execution plan',
  );
  const terminalLoaded=await readJson(
    join(workspace.real,'terminal-row.json'),
    'terminal row',
  );
  const plan=planLoaded.value;
  const terminal=terminalLoaded.value;
  if(
    !plan||typeof plan!=='object'
    ||plan.candidateSha!==ACCEPTED_EXECUTOR_BASE_SHA
    ||plan.controllerMainSha!==ledger.controllerCommitSha
    ||plan.candidateId!==row.candidateId
    ||plan.capability!==row.capability
    ||plan.disposition!==row.expectedDisposition
  ){
    fail('hsme_collection_assembler_terminal_plan_identity','terminal execution plan identity invalid');
  }
  const expectedStatus=row.expectedDisposition==='NOT_APPLICABLE'
    ?'NOT_APPLICABLE'
    :'BLOCKED_PARITY_PENDING';
  if(
    !terminal||typeof terminal!=='object'
    ||terminal.candidateId!==row.candidateId
    ||terminal.capability!==row.capability
    ||terminal.status!==expectedStatus
    ||!Array.isArray(terminal.outputs)
    ||terminal.outputs.length!==0
  ){
    fail('hsme_collection_assembler_terminal_row_identity','terminal row identity invalid');
  }
  requireAuthorityFalse(plan,'terminal execution plan');
  requireAuthorityFalse(terminal,'terminal row');
  return Object.freeze({
    benchmarkBundlePath:row.workspacePath,
    planFileSha256:planLoaded.fileSha256,
    terminalFileSha256:terminalLoaded.fileSha256,
    terminalStatus:expectedStatus,
  });
}

async function outputDirectory(path){
  const absolute=resolve(path);
  try{
    await lstat(absolute);
    fail('hsme_collection_assembler_output_exists','output directory already exists');
  }catch(error){
    if(error?.code!=='ENOENT'){
      if(error instanceof HsmeFoundationCollectorManifestAssemblerError)throw error;
      fail('hsme_collection_assembler_output_check_failed',error.message);
    }
  }
  await mkdir(absolute,{recursive:false});
  return absolute;
}

export async function assembleHsmeFoundationCollectorManifests({
  repoRoot,
  rawLedger,
  ledgerFileSha256='UNKNOWN',
}){
  const root=await realpath(resolve(repoRoot));
  const [matrixLoaded,campaignLoaded]=await Promise.all([
    readJson(join(root,DISPATCH_MATRIX_REL),'dispatch matrix'),
    readJson(join(root,CAMPAIGN_REL),'campaign'),
  ]);
  const campaign=campaignLoaded.value;
  const matrix=validateDispatchMatrix(matrixLoaded.value,campaign);
  const ledger=normalizeHsmeFoundationManualDispatchLedger(
    rawLedger,
    matrix,
    campaign,
  );

  const sourceRows=[];
  const benchmarkRows=[];
  for(const row of ledger.rows){
    if(row.evidenceKind==='PROTECTED_INTAKE'){
      const verified=await verifyReceiptWorkspace(root,ledger,row);
      benchmarkRows.push(Object.freeze({
        candidateId:row.candidateId,
        capability:row.capability,
        workflowRunId:row.workflowRunId,
        bundlePath:verified.benchmarkBundlePath,
      }));
      sourceRows.push(Object.freeze({...row,...verified}));
    }else{
      const verified=await verifyTerminalWorkspace(root,ledger,row);
      benchmarkRows.push(Object.freeze({
        candidateId:row.candidateId,
        capability:row.capability,
        workflowRunId:row.workflowRunId,
        bundlePath:verified.benchmarkBundlePath,
      }));
      sourceRows.push(Object.freeze({...row,...verified}));
    }
  }

  const benchmarkManifest=Object.freeze({
    schemaVersion:MANIFEST_SCHEMA,
    acceptedExecutorBaseSha:ACCEPTED_EXECUTOR_BASE_SHA,
    campaignId:campaign.campaignId,
    rows:Object.freeze(benchmarkRows.sort(compareCandidateCapability)),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });

  let benchmarkCollection;
  try{
    benchmarkCollection=await collectFoundationEvidence(root,benchmarkManifest);
  }catch(error){
    fail(
      'hsme_collection_assembler_benchmark_collection_failed',
      (error?.code?error.code+': ':'')+(error?.message||String(error)),
    );
  }

  const completeKeys=new Set(
    benchmarkCollection.evidence.runs
      .filter(run=>run.status==='COMPLETE')
      .map(run=>run.candidateId+'\0'+run.capability),
  );
  const sourceByKey=new Map(
    sourceRows.map(row=>[row.candidateId+'\0'+row.capability,row]),
  );
  const resourceRows=[];
  for(const key of [...completeKeys].sort(lexical)){
    const source=sourceByKey.get(key);
    if(
      !source
      ||source.evidenceKind!=='PROTECTED_INTAKE'
      ||source.runStatus!=='COMPLETE'
      ||source.resourceBundlePath===null
      ||source.resourceArtifactId===null
    ){
      fail('hsme_collection_assembler_complete_resource_binding','canonical COMPLETE run lacks verified resource intake');
    }
    resourceRows.push(Object.freeze({
      candidateId:source.candidateId,
      capability:source.capability,
      workflowRunId:source.workflowRunId,
      artifactId:source.resourceArtifactId,
      artifactName:'hsme-foundation-resource-evidence-'+source.workflowRunId,
      bundlePath:source.resourceBundlePath,
    }));
  }

  for(const source of sourceRows){
    const key=source.candidateId+'\0'+source.capability;
    if(!completeKeys.has(key)&&source.resourceArtifactId!==null){
      fail('hsme_collection_assembler_noncomplete_resource_metadata','non-COMPLETE row carries resource artifact metadata');
    }
  }

  const resourceManifest=Object.freeze({
    schemaVersion:HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1_SCHEMA,
    campaignId:campaign.campaignId,
    rows:Object.freeze(resourceRows.sort(compareCandidateCapability)),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });

  let resourceCollection=null;
  if(resourceRows.length>0){
    resourceCollection=await collectFoundationResourceEvidence(
      root,
      root,
      benchmarkCollection.evidence,
      resourceManifest,
    );
    if(resourceCollection.report.state!=='RESOURCE_EVIDENCE_COMPLETE'){
      fail(
        'hsme_collection_assembler_resource_collection_failed',
        'resource collector returned '+resourceCollection.report.state,
      );
    }
  }

  const benchmarkManifestBytes=stableBytes(benchmarkManifest);
  const runEvidenceBytes=stableBytes(benchmarkCollection.evidence);
  const runProofBytes=stableBytes(benchmarkCollection.collectionProof);
  const resourceManifestBytes=stableBytes(resourceManifest);
  const resourceReportBytes=resourceCollection
    ?stableBytes(resourceCollection.report)
    :null;
  const resourceEvidenceBytes=resourceCollection?.evidence
    ?stableBytes(resourceCollection.evidence)
    :null;
  const resourceProofBytes=resourceCollection?.proof
    ?stableBytes(resourceCollection.proof)
    :null;

  const packageReceiptPayload=Object.freeze({
    schemaVersion:HSME_FOUNDATION_COLLECTION_PACKAGE_RECEIPT_V1_SCHEMA,
    acceptedExecutorBaseSha:ACCEPTED_EXECUTOR_BASE_SHA,
    controllerCommitSha:ledger.controllerCommitSha,
    campaignId:campaign.campaignId,
    dispatchMatrixFileSha256:matrixLoaded.fileSha256,
    ledgerFileSha256:ledgerFileSha256==='UNKNOWN'
      ?'UNKNOWN'
      :sha256(ledgerFileSha256,'ledgerFileSha256'),
    sourceRows:Object.freeze(sourceRows.sort(compareCandidateCapability)),
    benchmarkManifestFileSha256:sha256Bytes(benchmarkManifestBytes),
    runEvidenceSha256:benchmarkCollection.collectionProof.runEvidenceSha256,
    runEvidenceFileSha256:sha256Bytes(runEvidenceBytes),
    runCollectionProofFileSha256:sha256Bytes(runProofBytes),
    resourceManifestFileSha256:sha256Bytes(resourceManifestBytes),
    resourceCollectionState:resourceCollection
      ?resourceCollection.report.state
      :'NO_COMPLETE_RUNS',
    resourceEvidenceSha256:resourceCollection
      ?resourceCollection.report.resourceEvidenceSha256
      :'UNKNOWN',
    resourceReportFileSha256:resourceReportBytes
      ?sha256Bytes(resourceReportBytes)
      :'UNKNOWN',
    resourceEvidenceFileSha256:resourceEvidenceBytes
      ?sha256Bytes(resourceEvidenceBytes)
      :'UNKNOWN',
    resourceProofFileSha256:resourceProofBytes
      ?sha256Bytes(resourceProofBytes)
      :'UNKNOWN',
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
  const packageReceipt=Object.freeze({
    ...packageReceiptPayload,
    packageReceiptSha256:collectionPackageReceiptDigest(packageReceiptPayload),
  });

  return Object.freeze({
    ledger,
    benchmarkManifest,
    benchmarkCollection,
    resourceManifest,
    resourceCollection,
    packageReceipt,
    files:Object.freeze({
      benchmarkManifest:benchmarkManifestBytes,
      runEvidence:runEvidenceBytes,
      runCollectionProof:runProofBytes,
      resourceManifest:resourceManifestBytes,
      resourceReport:resourceReportBytes,
      resourceEvidence:resourceEvidenceBytes,
      resourceProof:resourceProofBytes,
      packageReceipt:stableBytes(packageReceipt),
    }),
  });
}

function parseArgs(argv){
  const out=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined){
      fail('hsme_collection_assembler_cli_invalid','arguments must be --key value pairs');
    }
    if(out.has(key))fail('hsme_collection_assembler_cli_invalid','duplicate '+key);
    out.set(key,value);
  }
  for(const key of ['--repo-root','--ledger','--output-dir']){
    if(!out.has(key))fail('hsme_collection_assembler_cli_invalid','missing '+key);
  }
  return out;
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const ledgerLoaded=await readJson(args.get('--ledger'),'manual dispatch ledger');
  const result=await assembleHsmeFoundationCollectorManifests({
    repoRoot:args.get('--repo-root'),
    rawLedger:ledgerLoaded.value,
    ledgerFileSha256:ledgerLoaded.fileSha256,
  });
  const output=await outputDirectory(args.get('--output-dir'));
  try{
    const writes=[
      ['benchmark-dispatch-evidence-manifest.json',result.files.benchmarkManifest],
      ['foundation-run-evidence.json',result.files.runEvidence],
      ['foundation-run-collection-proof.json',result.files.runCollectionProof],
      ['resource-collection-manifest.json',result.files.resourceManifest],
      ['collection-package-receipt.json',result.files.packageReceipt],
    ];
    if(result.files.resourceReport)writes.push(
      ['resource-collection-report.json',result.files.resourceReport],
    );
    if(result.files.resourceEvidence)writes.push(
      ['resource-evidence.json',result.files.resourceEvidence],
    );
    if(result.files.resourceProof)writes.push(
      ['resource-proof.json',result.files.resourceProof],
    );
    for(const [name,bytes] of writes){
      await writeFile(join(output,name),bytes,{flag:'wx'});
    }
    process.stdout.write(JSON.stringify({
      schemaVersion:HSME_FOUNDATION_COLLECTION_PACKAGE_RECEIPT_V1_SCHEMA,
      runEvidenceSha256:result.packageReceipt.runEvidenceSha256,
      resourceCollectionState:result.packageReceipt.resourceCollectionState,
      resourceEvidenceSha256:result.packageReceipt.resourceEvidenceSha256,
      packageReceiptSha256:result.packageReceipt.packageReceiptSha256,
      winnerSelectionAllowed:false,
    })+'\n');
  }catch(error){
    await rm(output,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }
}

if(process.env.HSME_FOUNDATION_COLLECTOR_MANIFEST_ASSEMBLER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write((error.code||'hsme_collection_assembler_failed')+': '+error.message+'\n');
    process.exitCode=1;
  });
}

function compareCandidateCapability(a,b){
  return lexical(a.candidateId,b.candidateId)||lexical(a.capability,b.capability);
}
function lexical(a,b){return a<b?-1:a>b?1:0;}

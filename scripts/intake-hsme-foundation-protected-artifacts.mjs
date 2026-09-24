#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {
  lstat, mkdir, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import {
  basename, dirname, join, relative, resolve,
} from 'node:path';

import {
  HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA,
  canonicalFileBytes,
  normalizeHsmeFoundationProtectedArtifactProvenance,
  provenanceDigest,
  sha256Bytes,
} from './build-hsme-foundation-protected-artifact-provenance.mjs';
import {
  verify as verifyBenchmarkEvidence,
} from './hsme-foundation-benchmark-executor-verify.mjs';
import {
  verifyResourceFragment,
} from './hsme-foundation-resource-fragment-verify.mjs';

export const HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1';
export const HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_DIGEST_DOMAIN =
  'bers:hsme:foundation-protected-artifact-intake:v1\0';

const PROVENANCE_NAME='protected-artifact-provenance.json';
const RECEIPT_NAME='protected-artifact-intake-receipt.json';
const HEX64=/^[0-9a-f]{64}$/;

export class HsmeFoundationProtectedArtifactIntakeError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeFoundationProtectedArtifactIntakeError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeFoundationProtectedArtifactIntakeError(code,message);
}

export function intakeReceiptDigest(value){
  return sha256Bytes(Buffer.concat([
    Buffer.from(HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_DIGEST_DOMAIN,'utf8'),
    Buffer.from(JSON.stringify(canonicalValue(value)),'utf8'),
  ]));
}

function exactRecord(raw,allowed,path){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_protected_intake_receipt_record_invalid',path+' must be an object');
  }
  for(const key of Object.keys(raw)){
    if(!allowed.includes(key)){
      fail('hsme_protected_intake_receipt_field_unknown',path+'.'+key+' is not allowed');
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(raw,key)){
      fail('hsme_protected_intake_receipt_field_missing',path+'.'+key+' is required');
    }
  }
  return raw;
}

function receiptPath(value,path){
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>520
    ||value.startsWith('/')
    ||value.includes('\\')
    ||value.split('/').some(part=>part===''||part==='.'||part==='..')
  ){
    fail('hsme_protected_intake_receipt_path_invalid',path+' invalid');
  }
  return value;
}

function receiptSha(value,path){
  if(typeof value!=='string'||!HEX64.test(value)){
    fail('hsme_protected_intake_receipt_sha_invalid',path+' must be lowercase SHA-256');
  }
  return value;
}

export function normalizeHsmeFoundationProtectedArtifactIntakeReceipt(raw){
  const allowed=[
    'schemaVersion','provenanceSha256','provenanceFileSha256','repository',
    'workflowPath','workflowRunId','workflowRunAttempt','candidateCommitSha',
    'controllerCommitSha','campaignId','candidateId','capability','runStatus',
    'provenancePinVerified','canonicalBenchmarkVerificationPassed',
    'canonicalResourceVerificationPassed','benchmarkCollectorBundlePath',
    'resourceCollectorBundlePath','copiedFiles','qualityScoringAllowed',
    'candidateQualificationAllowed','candidateRejectionAllowed',
    'trainingOrDistillationAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed',
  ];
  const value=exactRecord(raw,allowed,'intakeReceipt');
  if(value.schemaVersion!==HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1_SCHEMA){
    fail('hsme_protected_intake_receipt_schema_invalid','intake receipt schema invalid');
  }
  const provenanceSha256=receiptSha(value.provenanceSha256,'intakeReceipt.provenanceSha256');
  const provenanceFileSha256=receiptSha(
    value.provenanceFileSha256,
    'intakeReceipt.provenanceFileSha256',
  );
  if(
    typeof value.repository!=='string'
    ||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)
    ||typeof value.workflowPath!=='string'
    ||value.workflowPath!=='.github/workflows/hsme-2a-3-3b-protected-foundation-executor.yml'
    ||typeof value.workflowRunId!=='string'
    ||!/^[1-9][0-9]*$/.test(value.workflowRunId)
    ||typeof value.workflowRunAttempt!=='string'
    ||!/^[1-9][0-9]*$/.test(value.workflowRunAttempt)
    ||typeof value.candidateCommitSha!=='string'
    ||! /^[0-9a-f]{40}$/.test(value.candidateCommitSha)
    ||typeof value.controllerCommitSha!=='string'
    ||! /^[0-9a-f]{40}$/.test(value.controllerCommitSha)
    ||typeof value.campaignId!=='string'||value.campaignId.length<1||value.campaignId.length>160
    ||typeof value.candidateId!=='string'||value.candidateId.length<1||value.candidateId.length>120
    ||!['TEXT_TO_IMAGE','IMAGE_EDITING'].includes(value.capability)
    ||!['COMPLETE','FAILED'].includes(value.runStatus)
  ){
    fail('hsme_protected_intake_receipt_identity_invalid','intake receipt identity invalid');
  }
  if(
    value.provenancePinVerified!==true
    ||value.canonicalBenchmarkVerificationPassed!==true
    ||value.canonicalResourceVerificationPassed!==(value.runStatus==='COMPLETE')
    ||value.benchmarkCollectorBundlePath!=='benchmark-bundle'
    ||value.resourceCollectorBundlePath!==(value.runStatus==='COMPLETE'?'resource-bundle':null)
  ){
    fail('hsme_protected_intake_receipt_verification_invalid','intake receipt verification/bundle state invalid');
  }
  if(!Array.isArray(value.copiedFiles)||value.copiedFiles.length<4||value.copiedFiles.length>8200){
    fail('hsme_protected_intake_receipt_files_invalid','intake receipt copiedFiles invalid');
  }
  const copied=value.copiedFiles.map((rawFile,index)=>{
    const file=exactRecord(
      rawFile,
      ['role','logicalPath','destinationPath','fileSha256','bytes'],
      'intakeReceipt.copiedFiles['+index+']',
    );
    if(!['BLIND','RESOURCE'].includes(file.role)){
      fail('hsme_protected_intake_receipt_role_invalid','copied file role invalid');
    }
    const logicalPath=receiptPath(file.logicalPath,'copiedFile.logicalPath');
    const destinationPath=receiptPath(file.destinationPath,'copiedFile.destinationPath');
    const expectedPrefix=file.role==='BLIND'?'benchmark-bundle/':'resource-bundle/';
    if(!destinationPath.startsWith(expectedPrefix)){
      fail('hsme_protected_intake_receipt_destination_invalid','copied file destination/role mismatch');
    }
    const fileSha256=receiptSha(file.fileSha256,'copiedFile.fileSha256');
    if(!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>256_000_000){
      fail('hsme_protected_intake_receipt_bytes_invalid','copied file bytes invalid');
    }
    return Object.freeze({
      role:file.role,
      logicalPath,
      destinationPath,
      fileSha256,
      bytes:file.bytes,
    });
  }).sort((a,b)=>lexical(a.role,b.role)||lexical(a.logicalPath,b.logicalPath));
  const copiedKeys=copied.map(x=>x.role+'\0'+x.logicalPath);
  if(new Set(copiedKeys).size!==copiedKeys.length){
    fail('hsme_protected_intake_receipt_files_duplicate','duplicate copied file role/logicalPath');
  }
  if(value.runStatus==='FAILED'&&copied.some(x=>x.role==='RESOURCE')){
    fail('hsme_protected_intake_receipt_resource_forbidden','FAILED receipt may not copy resource files');
  }
  if(value.runStatus==='COMPLETE'&&!copied.some(x=>x.role==='RESOURCE')){
    fail('hsme_protected_intake_receipt_resource_missing','COMPLETE receipt requires resource files');
  }
  for(const field of [
    'qualityScoringAllowed','candidateQualificationAllowed','candidateRejectionAllowed',
    'trainingOrDistillationAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed',
  ]){
    if(value[field]!==false){
      fail('hsme_protected_intake_receipt_authority_widening','intakeReceipt.'+field+' must remain false');
    }
  }
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1_SCHEMA,
    provenanceSha256,
    provenanceFileSha256,
    repository:value.repository,
    workflowPath:value.workflowPath,
    workflowRunId:value.workflowRunId,
    workflowRunAttempt:value.workflowRunAttempt,
    candidateCommitSha:value.candidateCommitSha,
    controllerCommitSha:value.controllerCommitSha,
    campaignId:value.campaignId,
    candidateId:value.candidateId,
    capability:value.capability,
    runStatus:value.runStatus,
    provenancePinVerified:true,
    canonicalBenchmarkVerificationPassed:true,
    canonicalResourceVerificationPassed:value.runStatus==='COMPLETE',
    benchmarkCollectorBundlePath:'benchmark-bundle',
    resourceCollectorBundlePath:value.runStatus==='COMPLETE'?'resource-bundle':null,
    copiedFiles:Object.freeze(copied),
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

function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort(lexical).map(key=>[key,canonicalValue(value[key])]),
    );
  }
  return value;
}

async function scanArtifactRoot(root,label){
  const absolute=resolve(root);
  const rootStat=await lstat(absolute).catch(error=>{
    fail('hsme_protected_intake_root_missing',label+': '+error.message);
  });
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()){
    fail('hsme_protected_intake_root_invalid',label+' must be a real directory');
  }

  const files=[];
  async function walk(dir){
    const entries=await readdir(dir,{withFileTypes:true});
    entries.sort((a,b)=>lexical(a.name,b.name));
    for(const entry of entries){
      const path=join(dir,entry.name);
      if(entry.isSymbolicLink()){
        fail('hsme_protected_intake_symlink_forbidden',label+': '+path);
      }
      if(entry.isDirectory()){
        await walk(path);
        continue;
      }
      if(!entry.isFile()){
        fail('hsme_protected_intake_file_type_invalid',label+': '+path);
      }
      const rel=relative(absolute,path).replaceAll('\\','/');
      files.push(Object.freeze({path,relativePath:rel,name:basename(path)}));
    }
  }
  await walk(absolute);
  const byName=new Map();
  for(const file of files){
    if(byName.has(file.name)){
      fail(
        'hsme_protected_intake_duplicate_basename',
        label+' contains duplicate basename '+file.name,
      );
    }
    byName.set(file.name,file);
  }
  return Object.freeze({root:absolute,files:Object.freeze(files),byName});
}

function findRequired(scan,name,label){
  const value=scan.byName.get(name);
  if(!value){
    fail('hsme_protected_intake_file_missing',label+' missing '+name);
  }
  return value;
}

async function loadPinnedProvenance(blindScan,resourceScan,expectedSha256){
  if(typeof expectedSha256!=='string'||!HEX64.test(expectedSha256)){
    fail(
      'hsme_protected_intake_expected_pin_invalid',
      'expected provenance digest must be lowercase SHA-256',
    );
  }
  const blindFile=findRequired(blindScan,PROVENANCE_NAME,'blind artifact');
  const blindBytes=await readFile(blindFile.path);
  let raw;
  try{
    raw=JSON.parse(blindBytes.toString('utf8'));
  }catch(error){
    fail('hsme_protected_intake_provenance_json_invalid',error.message);
  }
  const manifest=normalizeHsmeFoundationProtectedArtifactProvenance(raw);
  const canonical=canonicalFileBytes(manifest);
  if(!canonical.equals(blindBytes)){
    fail(
      'hsme_protected_intake_provenance_not_canonical',
      'provenance bytes differ from canonical manifest bytes',
    );
  }
  const semanticSha256=provenanceDigest(manifest);
  if(semanticSha256!==expectedSha256){
    fail(
      'hsme_protected_intake_provenance_pin_mismatch',
      'provenance digest differs from externally expected pin',
    );
  }

  if(resourceScan){
    const resourceFile=findRequired(resourceScan,PROVENANCE_NAME,'resource artifact');
    const resourceBytes=await readFile(resourceFile.path);
    if(!resourceBytes.equals(blindBytes)){
      fail(
        'hsme_protected_intake_provenance_copy_mismatch',
        'blind/resource provenance files must be byte-identical',
      );
    }
  }
  return Object.freeze({
    manifest,
    bytes:blindBytes,
    fileSha256:sha256Bytes(blindBytes),
    semanticSha256,
    blindFile,
  });
}

function expectedNames(manifest,role){
  const records=role==='BLIND'
    ?[...manifest.commonFiles,...manifest.blindFiles]
    :[...manifest.commonFiles,...manifest.resourceFiles];
  return new Set([PROVENANCE_NAME,...records.map(value=>basename(value.logicalPath))]);
}

function rejectUnexpected(scan,allowed,label){
  for(const file of scan.files){
    if(!allowed.has(file.name)){
      fail('hsme_protected_intake_unexpected_file',label+' unexpected file '+file.relativePath);
    }
  }
  if(scan.files.length!==allowed.size){
    fail('hsme_protected_intake_file_set_mismatch',label+' file cardinality mismatch');
  }
}

async function bindDeclaredFiles(scan,records,label){
  const bound=[];
  for(const record of records){
    const file=findRequired(scan,basename(record.logicalPath),label);
    const bytes=await readFile(file.path);
    if(bytes.length!==record.bytes||sha256Bytes(bytes)!==record.fileSha256){
      fail(
        'hsme_protected_intake_file_digest_mismatch',
        label+' '+record.logicalPath+' differs from pinned provenance',
      );
    }
    bound.push(Object.freeze({record,file,bytes}));
  }
  return Object.freeze(bound);
}

function mapByLogical(bound){
  return new Map(bound.map(value=>[value.record.logicalPath,value]));
}

function reviewDirectory(blindByLogical){
  const images=[...blindByLogical.entries()]
    .filter(([logical])=>logical.startsWith('review/'))
    .map(([,value])=>dirname(value.file.path));
  const unique=[...new Set(images)];
  if(unique.length!==1){
    fail('hsme_protected_intake_review_dir_invalid','review PNGs must share one source directory');
  }
  return unique[0];
}

async function proveCommonCopiesEqual(blindCommon,resourceCommon){
  const blind=mapByLogical(blindCommon);
  const resource=mapByLogical(resourceCommon);
  for(const logical of ['execution-plan.json','candidate-run.json','runtime-inventory.json']){
    const left=blind.get(logical);
    const right=resource.get(logical);
    if(!left||!right||!left.bytes.equals(right.bytes)){
      fail(
        'hsme_protected_intake_common_copy_mismatch',
        'blind/resource common file differs: '+logical,
      );
    }
  }
}

async function outputMustNotExist(path){
  try{
    await lstat(path);
    fail('hsme_protected_intake_output_exists','output directory already exists');
  }catch(error){
    if(error?.code==='ENOENT')return;
    if(error instanceof HsmeFoundationProtectedArtifactIntakeError)throw error;
    fail('hsme_protected_intake_output_check_failed',error.message);
  }
}

function collectorDestination(role,logicalPath){
  if(role==='BLIND'){
    if(logicalPath.startsWith('review/')){
      return 'benchmark-bundle/blind-review/'+basename(logicalPath);
    }
    return 'benchmark-bundle/'+basename(logicalPath);
  }
  if(role==='RESOURCE'){
    return 'resource-bundle/'+basename(logicalPath);
  }
  fail('hsme_protected_intake_copy_role_invalid','unsupported copy role '+role);
}

async function copyBoundFiles(outputRoot,role,bound){
  const records=[];
  for(const item of bound){
    const destinationRelative=collectorDestination(role,item.record.logicalPath);
    const destination=join(outputRoot,...destinationRelative.split('/'));
    await mkdir(dirname(destination),{recursive:true});
    await writeFile(destination,item.bytes,{flag:'wx'});
    const copied=await readFile(destination);
    const digest=sha256Bytes(copied);
    if(digest!==item.record.fileSha256||copied.length!==item.record.bytes){
      fail('hsme_protected_intake_copy_verify_failed','destination copy digest mismatch');
    }
    records.push(Object.freeze({
      role,
      logicalPath:item.record.logicalPath,
      destinationPath:destinationRelative,
      fileSha256:digest,
      bytes:copied.length,
    }));
  }
  return records;
}

export async function intakeHsmeFoundationProtectedArtifacts({
  blindRoot,
  resourceRoot=null,
  expectedProvenanceSha256,
  outputDir,
}){
  const blindScan=await scanArtifactRoot(blindRoot,'blind artifact');
  const resourceScan=resourceRoot
    ?await scanArtifactRoot(resourceRoot,'resource artifact')
    :null;

  const pinned=await loadPinnedProvenance(
    blindScan,
    resourceScan,
    expectedProvenanceSha256,
  );
  const manifest=pinned.manifest;
  if(manifest.schemaVersion!==HSME_FOUNDATION_PROTECTED_ARTIFACT_PROVENANCE_V1_SCHEMA){
    fail('hsme_protected_intake_provenance_schema_invalid','provenance schema invalid');
  }
  if(manifest.runStatus==='COMPLETE'&&!resourceScan){
    fail('hsme_protected_intake_resource_required','COMPLETE provenance requires resource artifact');
  }
  if(manifest.runStatus==='FAILED'&&resourceScan){
    fail('hsme_protected_intake_resource_forbidden','FAILED provenance forbids resource artifact');
  }

  rejectUnexpected(blindScan,expectedNames(manifest,'BLIND'),'blind artifact');
  if(resourceScan){
    rejectUnexpected(resourceScan,expectedNames(manifest,'RESOURCE'),'resource artifact');
  }

  const blindCommon=await bindDeclaredFiles(
    blindScan,
    manifest.commonFiles,
    'blind artifact',
  );
  const blindSpecific=await bindDeclaredFiles(
    blindScan,
    manifest.blindFiles,
    'blind artifact',
  );
  let resourceCommon=Object.freeze([]);
  let resourceSpecific=Object.freeze([]);
  if(resourceScan){
    resourceCommon=await bindDeclaredFiles(
      resourceScan,
      manifest.commonFiles,
      'resource artifact',
    );
    resourceSpecific=await bindDeclaredFiles(
      resourceScan,
      manifest.resourceFiles,
      'resource artifact',
    );
    await proveCommonCopiesEqual(blindCommon,resourceCommon);
  }

  const blindByLogical=mapByLogical([...blindCommon,...blindSpecific]);
  const resourceByLogical=mapByLogical([...resourceCommon,...resourceSpecific]);
  const commonPath=logical=>blindByLogical.get(logical)?.file.path;
  const run=await verifyBenchmarkEvidence({
    plan:commonPath('execution-plan.json'),
    run:commonPath('candidate-run.json'),
    inventory:commonPath('runtime-inventory.json'),
    ...(manifest.runStatus==='COMPLETE'
      ?{
        review:blindByLogical.get('review-package.json').file.path,
        reviewDir:reviewDirectory(blindByLogical),
      }
      :{
        failure:blindByLogical.get('failure-evidence.json').file.path,
      }),
  });
  if(
    run.status!==manifest.runStatus
    ||run.candidateId!==manifest.candidateId
    ||run.capability!==manifest.capability
  ){
    fail('hsme_protected_intake_run_binding_invalid','verified run differs from provenance');
  }

  if(resourceScan){
    await verifyResourceFragment({
      planPath:resourceByLogical.get('execution-plan.json').file.path,
      runPath:resourceByLogical.get('candidate-run.json').file.path,
      inventoryPath:resourceByLogical.get('runtime-inventory.json').file.path,
      resourcePath:resourceByLogical.get('resource-measurement.json').file.path,
      hardwareProfilePath:resourceByLogical.get('resource-hardware-profile.json').file.path,
      measurementMethodPath:resourceByLogical.get('resource-measurement-method.json').file.path,
      measurementEvidencePath:resourceByLogical.get('resource-measurement-evidence.json').file.path,
    });
  }

  const outputRoot=resolve(outputDir);
  await outputMustNotExist(outputRoot);
  await mkdir(outputRoot,{recursive:false});

  try{
    await writeFile(
      join(outputRoot,PROVENANCE_NAME),
      pinned.bytes,
      {flag:'wx'},
    );
    const copied=[
      ...await copyBoundFiles(outputRoot,'BLIND',[...blindCommon,...blindSpecific]),
      ...(resourceScan
        ?await copyBoundFiles(outputRoot,'RESOURCE',[...resourceCommon,...resourceSpecific])
        :[]),
    ].sort((a,b)=>lexical(a.role,b.role)||lexical(a.logicalPath,b.logicalPath));

    const receipt=normalizeHsmeFoundationProtectedArtifactIntakeReceipt({
      schemaVersion:HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1_SCHEMA,
      provenanceSha256:pinned.semanticSha256,
      provenanceFileSha256:pinned.fileSha256,
      repository:manifest.repository,
      workflowPath:manifest.workflowPath,
      workflowRunId:manifest.workflowRunId,
      workflowRunAttempt:manifest.workflowRunAttempt,
      candidateCommitSha:manifest.candidateCommitSha,
      controllerCommitSha:manifest.controllerCommitSha,
      campaignId:manifest.campaignId,
      candidateId:manifest.candidateId,
      capability:manifest.capability,
      runStatus:manifest.runStatus,
      provenancePinVerified:true,
      canonicalBenchmarkVerificationPassed:true,
      canonicalResourceVerificationPassed:manifest.runStatus==='COMPLETE',
      benchmarkCollectorBundlePath:'benchmark-bundle',
      resourceCollectorBundlePath:manifest.runStatus==='COMPLETE'?'resource-bundle':null,
      copiedFiles:Object.freeze(copied),
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
    const receiptBytes=canonicalFileBytes(receipt);
    await writeFile(join(outputRoot,RECEIPT_NAME),receiptBytes,{flag:'wx'});
    return Object.freeze({
      receipt,
      receiptSha256:intakeReceiptDigest(receipt),
      receiptFileSha256:sha256Bytes(receiptBytes),
      outputDir:outputRoot,
    });
  }catch(error){
    await rm(outputRoot,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }
}

function parseArgs(argv){
  const out=new Map();
  for(let index=0;index<argv.length;index+=2){
    const key=argv[index];
    const value=argv[index+1];
    if(!key?.startsWith('--')||value===undefined){
      fail('hsme_protected_intake_cli_invalid','arguments must be --key value pairs');
    }
    if(out.has(key))fail('hsme_protected_intake_cli_invalid','duplicate '+key);
    out.set(key,value);
  }
  for(const key of ['--blind-root','--expected-provenance-sha256','--output-dir']){
    if(!out.has(key))fail('hsme_protected_intake_cli_invalid','missing '+key);
  }
  return out;
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await intakeHsmeFoundationProtectedArtifacts({
    blindRoot:args.get('--blind-root'),
    resourceRoot:args.get('--resource-root')??null,
    expectedProvenanceSha256:args.get('--expected-provenance-sha256'),
    outputDir:args.get('--output-dir'),
  });
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_V1_SCHEMA,
    candidateId:result.receipt.candidateId,
    capability:result.receipt.capability,
    runStatus:result.receipt.runStatus,
    provenanceSha256:result.receipt.provenanceSha256,
    receiptSha256:result.receiptSha256,
    receiptFileSha256:result.receiptFileSha256,
  })+'\n');
}

if(process.env.HSME_FOUNDATION_PROTECTED_ARTIFACT_INTAKE_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write((error.code||'hsme_protected_intake_failed')+': '+error.message+'\n');
    process.exitCode=1;
  });
}

function lexical(a,b){return a<b?-1:a>b?1:0;}

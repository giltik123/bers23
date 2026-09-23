#!/usr/bin/env node
import {
  access,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

import {
  canonicalFileBytes,
  domainDigest,
  planHsmeReuseEvidencePipeline,
  sha256Bytes,
} from './plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA,
} from './materialize-hsme-reuse-pipeline-approved-pin-spec.mjs';
import {
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
} from './run-hsme-reuse-pipeline-stage.mjs';
import {
  buildHsmeReusePipelineReceiptCarryForward,
  verifyHsmeReusePipelineReceiptCarryForward,
} from './verify-hsme-reuse-pipeline-receipt-carry-forward.mjs';
import {
  planHsmeReusePipelineResume,
} from './plan-hsme-reuse-pipeline-resume.mjs';

export const HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_V1_SCHEMA =
  'BERS_HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_V1';
export const HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_DIGEST_DOMAIN =
  'bers:hsme:reuse-pipeline-approved-pin-replan-package:v1\0';

const HEX64=/^[0-9a-f]{64}$/;
const GIT_OID=/^[0-9a-f]{40,64}$/;

export class HsmeReusePipelineApprovedPinReplanPackageError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineApprovedPinReplanPackageError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineApprovedPinReplanPackageError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_replan_package_record_invalid',path+' must be an object');
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
    fail('hsme_replan_package_text_invalid',path+' is invalid');
  }
  return value;
}

function hash(value,path){
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail('hsme_replan_package_hash_invalid',path+' must be lowercase SHA-256');
  }
  return result;
}

function gitOid(value,path){
  const result=text(value,path,64);
  if(!GIT_OID.test(result)){
    fail('hsme_replan_package_git_oid_invalid',path+' must be lowercase git oid');
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
      fail('hsme_replan_package_authority_invalid',label+'.'+field+' must remain false');
    }
  }
}

async function pathExists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    fail('hsme_replan_package_access_failed',path+': '+error.message);
  }
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_replan_package_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_replan_package_json_invalid',label+': '+error.message);
  }
  return Object.freeze({
    path:resolve(path),
    bytes,
    fileSha256:sha256Bytes(bytes),
    value,
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
        out.push(...semanticDiffPaths(
          left[key],
          right[key],
          path+'/'+escapePointer(key),
        ));
      }
    }
    return out;
  }
  return [path||'/'];
}

function pointerValue(root,pointer){
  const normalized=text(pointer,'application.jsonPointer',512);
  if(!normalized.startsWith('/')){
    fail('hsme_replan_package_pointer_invalid','application pointer must be JSON pointer');
  }
  let current=root;
  for(const token of normalized.slice(1).split('/')){
    const key=token.replaceAll('~1','/').replaceAll('~0','~');
    if(current===null||typeof current!=='object'||!Object.hasOwn(current,key)){
      fail('hsme_replan_package_pointer_missing','application pointer does not resolve');
    }
    current=current[key];
  }
  return current;
}

function applicationPayload(application){
  const payload={...application};
  delete payload.applicationSha256;
  return payload;
}

function validateApplication({
  applicationLoaded,
  sourceSpec,
  approvedSpec,
}){
  const application=object(applicationLoaded.value,'application');
  if(
    application.schemaVersion!==HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA
    ||application.applicationState!=='PIN_MATERIALIZED_NEW_SPEC'
    ||application.sourceSpecMutated!==false
    ||application.replanRequired!==true
    ||application.automaticContinuationAllowed!==false
    ||application.stageExecutionAuthorized!==false
    ||application.externalPinCreated!==true
  ){
    fail('hsme_replan_package_application_state_invalid','pin application state invalid');
  }
  requireFalseBoundary(application,'application');
  const applicationSha256=hash(
    application.applicationSha256,
    'application.applicationSha256',
  );
  if(
    domainDigest(
      HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN,
      applicationPayload(application),
    )!==applicationSha256
  ){
    fail('hsme_replan_package_application_digest_mismatch','application self digest mismatch');
  }

  if(
    resolve(text(application.sourceSpecPath,'application.sourceSpecPath'))!==sourceSpec.path
    ||resolve(text(application.outputSpecPath,'application.outputSpecPath'))!==approvedSpec.path
    ||hash(
      application.sourceSpecFileSha256,
      'application.sourceSpecFileSha256',
    )!==sourceSpec.fileSha256
    ||hash(
      application.outputSpecFileSha256,
      'application.outputSpecFileSha256',
    )!==approvedSpec.fileSha256
  ){
    fail('hsme_replan_package_application_spec_drift','application old/new spec binding drift');
  }

  const differences=semanticDiffPaths(sourceSpec.value,approvedSpec.value);
  if(differences.length!==1||differences[0]!==application.jsonPointer){
    fail('hsme_replan_package_spec_diff_invalid','old/new specs differ beyond approved pointer');
  }
  if(pointerValue(sourceSpec.value,application.jsonPointer)!==null){
    fail('hsme_replan_package_source_pin_not_null','source spec pin target must be null');
  }
  const appliedPin=hash(
    application.appliedExternalPinSha256,
    'application.appliedExternalPinSha256',
  );
  if(pointerValue(approvedSpec.value,application.jsonPointer)!==appliedPin){
    fail('hsme_replan_package_output_pin_drift','approved spec pin differs from application');
  }

  return Object.freeze({
    application,
    applicationSha256,
    stageId:text(application.stageId,'application.stageId',160),
    stageKind:text(application.stageKind,'application.stageKind',64),
  });
}

function receiptIdentity(raw,path){
  const receipt=object(raw,'receipt');
  if(receipt.schemaVersion!==HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA){
    fail('hsme_replan_package_receipt_schema_invalid','old receipt must be exact V2');
  }
  return Object.freeze({
    path:resolve(path),
    stageId:text(receipt.stageId,'receipt.stageId',160),
    stageKind:text(receipt.stageKind,'receipt.stageKind',64),
    receiptSha256:hash(receipt.receiptSha256,'receipt.receiptSha256'),
  });
}

function safeStageFileName(stageId){
  const slug=stageId.replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,80)||'stage';
  const suffix=sha256Bytes(Buffer.from(stageId,'utf8')).slice(0,12);
  return slug+'-'+suffix+'.json';
}

async function writeExclusive(path,bytes){
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,bytes,{flag:'wx'});
}

async function verifyStoredBytes(path,expected){
  const actual=await readFile(path);
  if(!actual.equals(expected)){
    fail('hsme_replan_package_output_bytes_drift','stored output bytes differ: '+path);
  }
  return Object.freeze({
    path:resolve(path),
    fileSha256:sha256Bytes(actual),
    bytes:actual.length,
  });
}

export async function buildHsmeReusePipelineApprovedPinReplanPackage({
  sourceSpecPath,
  approvedSpecPath,
  pinApplicationPath,
  sourceManifestPath,
  sourceDigestPath,
  receiptPaths=[],
  repoRoot=process.cwd(),
  outputDir,
}){
  const root=resolve(outputDir);
  if(await pathExists(root)){
    fail('hsme_replan_package_output_exists','output directory must not already exist');
  }

  const manifestPath=resolve(root,'hsme-reuse-evidence-pipeline-manifest.json');
  const manifestDigestPath=resolve(
    root,
    'hsme-reuse-evidence-pipeline-manifest-digest.json',
  );
  const carryDir=resolve(root,'carry-forward');
  const resumePlanPath=resolve(root,'hsme-reuse-pipeline-resume-plan.json');
  const resumeDigestPath=resolve(root,'hsme-reuse-pipeline-resume-plan-digest.json');
  const packagePath=resolve(root,'hsme-reuse-approved-pin-replan-package.json');

  let published=false;
  try{
    const [
      sourceSpec,
      approvedSpec,
      applicationLoaded,
      sourceManifest,
      sourceDigest,
      loadedReceipts,
    ]=await Promise.all([
      readJson(sourceSpecPath,'source spec'),
      readJson(approvedSpecPath,'approved spec'),
      readJson(pinApplicationPath,'pin application'),
      readJson(sourceManifestPath,'source manifest'),
      readJson(sourceDigestPath,'source manifest digest'),
      Promise.all(receiptPaths.map((path,index)=>readJson(path,'receipt '+index))),
    ]);

    if(!canonicalFileBytes(approvedSpec.value).equals(approvedSpec.bytes)){
      fail('hsme_replan_package_approved_spec_not_canonical','approved spec must be canonical');
    }
    const application=validateApplication({
      applicationLoaded,
      sourceSpec,
      approvedSpec,
    });

    const receiptIdentities=loadedReceipts.map((loaded,index)=>
      receiptIdentity(loaded.value,receiptPaths[index])
    );
    const receiptStageIds=receiptIdentities.map(value=>value.stageId);
    if(new Set(receiptStageIds).size!==receiptStageIds.length){
      fail('hsme_replan_package_receipt_duplicate','old receipt stage ids must be unique');
    }

    await mkdir(root,{recursive:false});

    const planned=await planHsmeReuseEvidencePipeline({
      spec:approvedSpec.value,
      specFileSha256:approvedSpec.fileSha256,
      manifestPath,
      digestPath:manifestDigestPath,
    });
    await Promise.all([
      writeExclusive(manifestPath,planned.files.manifest),
      writeExclusive(manifestDigestPath,planned.files.digest),
    ]);

    const carryForwards=[];
    const notCarried=[];
    for(let index=0;index<loadedReceipts.length;index+=1){
      const loaded=loadedReceipts[index];
      const identity=receiptIdentities[index];
      try{
        const built=await buildHsmeReusePipelineReceiptCarryForward({
          sourceManifestPath,
          sourceDigestPath,
          sourceReceiptPath:loaded.path,
          pinApplicationPath,
          sourceSpecPath,
          outputSpecPath:approvedSpecPath,
          currentManifestPath:manifestPath,
          currentDigestPath:manifestDigestPath,
          repoRoot,
        });
        const proofPath=resolve(carryDir,safeStageFileName(identity.stageId));
        await writeExclusive(proofPath,built.files.proof);
        const stored=await verifyStoredBytes(proofPath,built.files.proof);
        carryForwards.push(Object.freeze({
          stageId:built.proof.stageId,
          stageKind:built.proof.stageKind,
          sourceReceiptPath:loaded.path,
          sourceReceiptFileSha256:loaded.fileSha256,
          sourceReceiptSha256:built.proof.sourceReceiptSha256,
          proofPath,
          proofFileSha256:stored.fileSha256,
          carryForwardProofSha256:built.proof.carryForwardProofSha256,
          decision:'CARRIED_UNCHANGED_STAGE',
        }));
      }catch(error){
        const reason=error?.code;
        if(
          reason==='hsme_reuse_carry_patched_stage_forbidden'
          ||reason==='hsme_reuse_carry_patched_dependency_forbidden'
        ){
          notCarried.push(Object.freeze({
            stageId:identity.stageId,
            stageKind:identity.stageKind,
            sourceReceiptPath:loaded.path,
            sourceReceiptFileSha256:loaded.fileSha256,
            sourceReceiptSha256:identity.receiptSha256,
            decision:reason==='hsme_reuse_carry_patched_stage_forbidden'
              ?'NOT_CARRIED_PATCHED_STAGE'
              :'NOT_CARRIED_DEPENDS_ON_PATCHED_STAGE',
          }));
          continue;
        }
        throw error;
      }
    }
    carryForwards.sort((a,b)=>lexical(a.stageId,b.stageId));
    notCarried.sort((a,b)=>lexical(a.stageId,b.stageId));

    for(const entry of carryForwards){
      const proof=await verifyHsmeReusePipelineReceiptCarryForward({
        proofPath:entry.proofPath,
        currentManifestPath:manifestPath,
        currentDigestPath:manifestDigestPath,
        repoRoot,
      });
      if(proof.carryForwardProofSha256!==entry.carryForwardProofSha256){
        fail('hsme_replan_package_carry_reverify_drift','stored carry proof revalidation drift');
      }
    }

    const carryForwardPaths=carryForwards.map(value=>value.proofPath);
    const resumed=await planHsmeReusePipelineResume({
      manifestPath,
      digestPath:manifestDigestPath,
      receiptPaths:[],
      carryForwardPaths,
      repoRoot,
    });
    await Promise.all([
      writeExclusive(resumePlanPath,resumed.files.plan),
      writeExclusive(resumeDigestPath,resumed.files.digest),
    ]);

    const resumedAgain=await planHsmeReusePipelineResume({
      manifestPath,
      digestPath:manifestDigestPath,
      receiptPaths:[],
      carryForwardPaths,
      repoRoot,
    });
    if(
      !resumedAgain.files.plan.equals(resumed.files.plan)
      ||!resumedAgain.files.digest.equals(resumed.files.digest)
    ){
      fail('hsme_replan_package_resume_reverify_drift','stored resume plan is not deterministic');
    }

    const [
      manifestStored,
      manifestDigestStored,
      resumeStored,
      resumeDigestStored,
    ]=await Promise.all([
      verifyStoredBytes(manifestPath,planned.files.manifest),
      verifyStoredBytes(manifestDigestPath,planned.files.digest),
      verifyStoredBytes(resumePlanPath,resumed.files.plan),
      verifyStoredBytes(resumeDigestPath,resumed.files.digest),
    ]);

    const repositoryCommitSha=gitOid(
      resumed.plan.repositoryCommitSha,
      'resumePlan.repositoryCommitSha',
    );
    const packagePayload=Object.freeze({
      schemaVersion:HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_V1_SCHEMA,
      packageState:'REPLAN_READY_NO_EXECUTION',
      sourceSpecPath:sourceSpec.path,
      sourceSpecFileSha256:sourceSpec.fileSha256,
      approvedSpecPath:approvedSpec.path,
      approvedSpecFileSha256:approvedSpec.fileSha256,
      pinApplicationPath:applicationLoaded.path,
      pinApplicationFileSha256:applicationLoaded.fileSha256,
      pinApplicationSha256:application.applicationSha256,
      patchedStageId:application.stageId,
      patchedStageKind:application.stageKind,
      sourceManifestPath:sourceManifest.path,
      sourceManifestFileSha256:sourceManifest.fileSha256,
      sourceManifestDigestPath:sourceDigest.path,
      sourceManifestDigestFileSha256:sourceDigest.fileSha256,
      manifestPath,
      manifestFileSha256:manifestStored.fileSha256,
      manifestSha256:planned.digest.manifestSha256,
      manifestDigestPath,
      manifestDigestFileSha256:manifestDigestStored.fileSha256,
      carryForwards:Object.freeze(carryForwards),
      notCarried:Object.freeze(notCarried),
      resumePlanPath,
      resumePlanFileSha256:resumeStored.fileSha256,
      resumePlanSha256:resumed.digest.planSha256,
      resumeDigestPath,
      resumeDigestFileSha256:resumeDigestStored.fileSha256,
      repositoryCommitSha,
      readyStageIds:Object.freeze([...resumed.plan.readyStageIds].sort(lexical)),
      pipelineResumeState:resumed.plan.pipelineResumeState,
      plannerExecutesStages:false,
      packageExecutesStages:false,
      automaticContinuationAllowed:false,
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
    const packageSha256=domainDigest(
      HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_DIGEST_DOMAIN,
      packagePayload,
    );
    const packageManifest=Object.freeze({...packagePayload,packageSha256});
    const packageBytes=canonicalFileBytes(packageManifest);
    await writeExclusive(packagePath,packageBytes);
    const packageStored=await verifyStoredBytes(packagePath,packageBytes);

    published=true;
    return Object.freeze({
      package:packageManifest,
      manifest:planned.manifest,
      manifestDigest:planned.digest,
      resumePlan:resumed.plan,
      resumeDigest:resumed.digest,
      files:Object.freeze({
        package:packageBytes,
        packageFileSha256:packageStored.fileSha256,
      }),
    });
  }catch(error){
    if(!published){
      await rm(root,{recursive:true,force:true}).catch(()=>{});
    }
    throw error;
  }
}

function parseArgs(argv){
  const single=new Map();
  const receipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_replan_package_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--receipt'){
      receipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_replan_package_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--source-spec',
    '--approved-spec',
    '--pin-application',
    '--source-manifest',
    '--source-manifest-digest',
    '--repo-root',
    '--output-dir',
  ]){
    if(!single.has(key))fail('hsme_replan_package_cli_invalid','missing '+key);
  }
  return Object.freeze({
    sourceSpec:single.get('--source-spec'),
    approvedSpec:single.get('--approved-spec'),
    pinApplication:single.get('--pin-application'),
    sourceManifest:single.get('--source-manifest'),
    sourceManifestDigest:single.get('--source-manifest-digest'),
    repoRoot:single.get('--repo-root'),
    outputDir:single.get('--output-dir'),
    receipts:Object.freeze(receipts),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await buildHsmeReusePipelineApprovedPinReplanPackage({
    sourceSpecPath:args.sourceSpec,
    approvedSpecPath:args.approvedSpec,
    pinApplicationPath:args.pinApplication,
    sourceManifestPath:args.sourceManifest,
    sourceDigestPath:args.sourceManifestDigest,
    receiptPaths:args.receipts,
    repoRoot:args.repoRoot,
    outputDir:args.outputDir,
  });
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_V1_SCHEMA,
    packageState:result.package.packageState,
    packageSha256:result.package.packageSha256,
    readyStageIds:result.package.readyStageIds,
    carryForwardCount:result.package.carryForwards.length,
    notCarriedCount:result.package.notCarried.length,
    packageExecutesStages:false,
    automaticContinuationAllowed:false,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_replan_package_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

function lexical(left,right){
  return left<right?-1:left>right?1:0;
}

#!/usr/bin/env node
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
  bindStageInputs,
  findStage,
  loadVerifiedManifest,
  readRepositoryIdentity,
  validateRepoRuntime,
  validateStageProgram,
} from './run-hsme-reuse-pipeline-stage.mjs';
import {
  normalizeReceipt,
  receiptPayload,
} from './plan-hsme-reuse-pipeline-resume.mjs';
import {
  HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA,
  HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN,
} from './materialize-hsme-reuse-pipeline-approved-pin-spec.mjs';
import {
  verifyHsmeReusePipelineExternalPinApproval,
} from './verify-hsme-reuse-pipeline-external-pin-approval.mjs';
import {
  HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1_SCHEMA,
  HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_DIGEST_DOMAIN,
} from './hsme-reuse-pipeline-receipt-continuity-contract.mjs';

export class HsmeReusePipelineReceiptContinuityBuilderError extends Error{
  constructor(code,message){
    super(message);
    this.name='HsmeReusePipelineReceiptContinuityBuilderError';
    this.code=code;
  }
}

function fail(code,message){
  throw new HsmeReusePipelineReceiptContinuityBuilderError(code,message);
}

function object(value,path){
  if(value===null||typeof value!=='object'||Array.isArray(value)){
    fail('hsme_reuse_continuity_build_record_invalid',path+' must be an object');
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
    fail('hsme_reuse_continuity_build_text_invalid',path+' is invalid');
  }
  return value;
}

async function readJson(path,label){
  let bytes;
  try{
    bytes=await readFile(path);
  }catch(error){
    fail('hsme_reuse_continuity_build_file_read_failed',label+': '+error.message);
  }
  let value;
  try{
    value=JSON.parse(bytes.toString('utf8'));
  }catch(error){
    fail('hsme_reuse_continuity_build_json_invalid',label+': '+error.message);
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
          left[key],right[key],path+'/'+escapePointer(key),
        ));
      }
    }
    return out;
  }
  return [path||'/'];
}

function payloadWithout(record,field){
  const payload={...record};
  delete payload[field];
  return payload;
}

async function validateApplication({
  loaded,
  sourceSpec,
  targetSpec,
  verification,
  patch,
}){
  const canonical=canonicalFileBytes(loaded.value);
  if(!canonical.equals(loaded.bytes)){
    fail(
      'hsme_reuse_continuity_build_application_not_canonical',
      'pin application must use canonical bytes',
    );
  }
  const application=object(loaded.value,'application');
  if(
    application.schemaVersion!==HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1_SCHEMA
    ||application.applicationState!=='PIN_MATERIALIZED_NEW_SPEC'
    ||application.externalPinCreated!==true
    ||application.sourceSpecMutated!==false
    ||application.replanRequired!==true
    ||application.automaticContinuationAllowed!==false
    ||application.stageExecutionAuthorized!==false
    ||application.semanticEvidenceAuthorityGranted!==false
  ){
    fail(
      'hsme_reuse_continuity_build_application_state_invalid',
      'pin application state/boundary invalid',
    );
  }
  const applicationSha256=domainDigest(
    HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_DIGEST_DOMAIN,
    payloadWithout(application,'applicationSha256'),
  );
  if(applicationSha256!==application.applicationSha256){
    fail(
      'hsme_reuse_continuity_build_application_digest_mismatch',
      'pin application self digest mismatch',
    );
  }
  if(
    application.sourceSpecFileSha256!==sourceSpec.fileSha256
    ||application.outputSpecFileSha256!==targetSpec.fileSha256
    ||application.patchCandidateSha256!==patch.patchCandidateSha256
    ||application.approvalSha256!==verification.approvalSha256
    ||application.requestSha256!==verification.requestSha256
    ||application.appliedExternalPinSha256!==
      verification.requestedExternalPinSha256
  ){
    fail(
      'hsme_reuse_continuity_build_application_binding_drift',
      'pin application does not bind exact source/target approval lineage',
    );
  }

  const differences=semanticDiffPaths(sourceSpec.value,targetSpec.value);
  if(
    differences.length!==1
    ||differences[0]!==application.jsonPointer
    ||application.jsonPointer!==patch.jsonPointer
  ){
    fail(
      'hsme_reuse_continuity_build_spec_revision_invalid',
      'old/new spec revision must change exactly the approved JSON pointer',
    );
  }
  return application;
}

function stageDefinition(manifest,stage){
  const inputs=bindStageInputs(manifest,stage);
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
  return Object.freeze({inputs,argvSha256,stageDefinitionSha256});
}

export async function buildHsmeReusePipelineReceiptContinuity({
  sourceSpecPath,
  targetSpecPath,
  applicationPath,
  requestPath,
  approvalPath,
  expectedApprovalSha256,
  verificationPath,
  patchCandidatePath,
  sourceManifestPath,
  sourceManifestDigestPath,
  sourceResumePlanPath,
  sourceResumeDigestPath,
  sourceReceiptPaths,
  targetManifestPath,
  targetManifestDigestPath,
  receiptPath,
  repoRoot,
}){
  const [
    sourceSpec,
    targetSpec,
    applicationLoaded,
    suppliedVerification,
    suppliedPatch,
    sourceManifest,
    targetManifest,
    receiptLoaded,
    repository,
  ]=await Promise.all([
    readJson(sourceSpecPath,'source spec'),
    readJson(targetSpecPath,'target spec'),
    readJson(applicationPath,'pin application'),
    readJson(verificationPath,'approval verification'),
    readJson(patchCandidatePath,'patch candidate'),
    loadVerifiedManifest(
      resolve(sourceManifestPath),
      resolve(sourceManifestDigestPath),
    ),
    loadVerifiedManifest(
      resolve(targetManifestPath),
      resolve(targetManifestDigestPath),
    ),
    readJson(receiptPath,'source V2 receipt'),
    readRepositoryIdentity(resolve(repoRoot)),
  ]);

  if(repository.trackedTreeClean!==true){
    fail(
      'hsme_reuse_continuity_build_repository_dirty',
      'tracked repository tree must remain clean',
    );
  }
  if(
    sourceManifest.manifest.specFileSha256!==sourceSpec.fileSha256
    ||targetManifest.manifest.specFileSha256!==targetSpec.fileSha256
  ){
    fail(
      'hsme_reuse_continuity_build_manifest_spec_binding_drift',
      'old/new manifests do not bind exact old/new spec bytes',
    );
  }

  const reverified=await verifyHsmeReusePipelineExternalPinApproval({
    requestPath,
    approvalPath,
    expectedApprovalSha256,
    specPath:sourceSpec.path,
    manifestPath:sourceManifestPath,
    digestPath:sourceManifestDigestPath,
    resumePlanPath:sourceResumePlanPath,
    resumeDigestPath:sourceResumeDigestPath,
    receiptPaths:sourceReceiptPaths,
    repoRoot,
  });
  if(!reverified.files.verification.equals(suppliedVerification.bytes)){
    fail(
      'hsme_reuse_continuity_build_verification_stale',
      'approval verification differs from current revalidation',
    );
  }
  if(
    !reverified.files.patchCandidate
    ||!reverified.files.patchCandidate.equals(suppliedPatch.bytes)
  ){
    fail(
      'hsme_reuse_continuity_build_patch_stale',
      'patch candidate differs from current revalidation',
    );
  }

  const application=await validateApplication({
    loaded:applicationLoaded,
    sourceSpec,
    targetSpec,
    verification:reverified.verification,
    patch:reverified.patchCandidate,
  });

  const canonicalReceipt=canonicalFileBytes(receiptLoaded.value);
  if(!canonicalReceipt.equals(receiptLoaded.bytes)){
    fail(
      'hsme_reuse_continuity_build_receipt_not_canonical',
      'source V2 receipt must use canonical runner bytes',
    );
  }
  const receipt=normalizeReceipt(receiptLoaded.value);
  const receiptSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
    receiptPayload(receipt),
  );
  if(receiptSha256!==receipt.receiptSha256){
    fail(
      'hsme_reuse_continuity_build_receipt_digest_mismatch',
      'source V2 receipt self digest mismatch',
    );
  }
  if(receipt.specFileSha256!==sourceSpec.fileSha256){
    fail(
      'hsme_reuse_continuity_build_receipt_source_spec_drift',
      'source receipt does not bind old spec',
    );
  }
  if(receipt.repositoryCommitSha!==repository.repositoryCommitSha){
    fail(
      'hsme_reuse_continuity_build_repository_commit_drift',
      'source receipt repository commit differs from current clean HEAD',
    );
  }

  const sourceStage=findStage(sourceManifest.manifest,receipt.stageId);
  const targetStage=findStage(targetManifest.manifest,receipt.stageId);
  if(
    sourceStage.kind!==receipt.stageKind
    ||targetStage.kind!==receipt.stageKind
    ||sourceStage.status!=='READY'
    ||sourceStage.localStatus!=='READY'
    ||targetStage.status!=='READY'
    ||targetStage.localStatus!=='READY'
  ){
    fail(
      'hsme_reuse_continuity_build_stage_state_drift',
      'carried stage must remain exact READY stage in old and new manifests',
    );
  }

  const sourceDefinition=stageDefinition(sourceManifest.manifest,sourceStage);
  const targetDefinition=stageDefinition(targetManifest.manifest,targetStage);
  if(
    sourceDefinition.stageDefinitionSha256!==receipt.stageDefinitionSha256
    ||targetDefinition.stageDefinitionSha256!==receipt.stageDefinitionSha256
    ||sourceDefinition.argvSha256!==receipt.argvSha256
    ||targetDefinition.argvSha256!==receipt.argvSha256
    ||JSON.stringify(sourceDefinition.inputs)!==JSON.stringify(receipt.inputs)
    ||JSON.stringify(targetDefinition.inputs)!==JSON.stringify(receipt.inputs)
  ){
    fail(
      'hsme_reuse_continuity_build_stage_definition_drift',
      'carried stage definition/argv/inputs changed across spec revision',
    );
  }

  const program=validateStageProgram(targetStage);
  const runtime=await validateRepoRuntime(
    resolve(repoRoot),
    program.allowed.script,
  );
  if(
    runtime.repositoryCommitSha!==repository.repositoryCommitSha
    ||runtime.trackedTreeClean!==true
    ||runtime.scriptSha256!==receipt.stageScriptSha256
    ||runtime.hookSha256!==receipt.nodeResolutionHookSha256
  ){
    fail(
      'hsme_reuse_continuity_build_runtime_code_drift',
      'current stage code differs from source receipt',
    );
  }

  if(
    targetStage.outputs.length!==receipt.outputs.length
    ||targetStage.outputs.some(
      (path,index)=>resolve(path)!==receipt.outputs[index].path,
    )
  ){
    fail(
      'hsme_reuse_continuity_build_output_set_drift',
      'current stage output paths differ from source receipt',
    );
  }
  for(const output of receipt.outputs){
    const current=await readFile(output.path).catch(error=>{
      fail(
        'hsme_reuse_continuity_build_output_read_failed',
        output.path+': '+error.message,
      );
    });
    if(
      current.length!==output.bytes
      ||sha256Bytes(current)!==output.fileSha256
    ){
      fail(
        'hsme_reuse_continuity_build_output_bytes_drift',
        'current stage output bytes differ from source receipt: '+output.path,
      );
    }
    try{
      JSON.parse(current.toString('utf8'));
    }catch(error){
      fail(
        'hsme_reuse_continuity_build_output_json_invalid',
        output.path+': '+error.message,
      );
    }
  }

  const payload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1_SCHEMA,
    sourceSpecFileSha256:sourceSpec.fileSha256,
    targetSpecFileSha256:targetSpec.fileSha256,
    pinApplicationSha256:application.applicationSha256,
    patchCandidateSha256:application.patchCandidateSha256,
    approvalSha256:application.approvalSha256,
    receiptSha256:receipt.receiptSha256,
    sourceReceiptFileSha256:receiptLoaded.fileSha256,
    stageId:receipt.stageId,
    stageKind:receipt.stageKind,
    repositoryCommitSha:repository.repositoryCommitSha,
    stageDefinitionSha256:receipt.stageDefinitionSha256,
    argvSha256:receipt.argvSha256,
    continuityState:'STAGE_DEFINITION_INVARIANT',
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
  const continuitySha256=domainDigest(
    HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_DIGEST_DOMAIN,
    payload,
  );
  const continuity=Object.freeze({...payload,continuitySha256});
  return Object.freeze({
    continuity,
    files:Object.freeze({
      continuity:canonicalFileBytes(continuity),
    }),
  });
}

function parseArgs(argv){
  const single=new Map();
  const sourceReceipts=[];
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key?.startsWith('--')||index+1>=argv.length){
      fail('hsme_reuse_continuity_build_cli_invalid','arguments must be --key value pairs');
    }
    const value=argv[++index];
    if(key==='--source-receipt'){
      sourceReceipts.push(value);
      continue;
    }
    if(single.has(key)){
      fail('hsme_reuse_continuity_build_cli_invalid','duplicate argument '+key);
    }
    single.set(key,value);
  }
  for(const key of [
    '--source-spec','--target-spec','--application',
    '--request','--approval','--expected-approval-sha256',
    '--verification','--patch-candidate',
    '--source-manifest','--source-manifest-digest',
    '--source-resume-plan','--source-resume-digest',
    '--target-manifest','--target-manifest-digest',
    '--receipt','--repo-root','--output',
  ]){
    if(!single.has(key)){
      fail('hsme_reuse_continuity_build_cli_invalid','missing '+key);
    }
  }
  return Object.freeze({
    sourceSpec:single.get('--source-spec'),
    targetSpec:single.get('--target-spec'),
    application:single.get('--application'),
    request:single.get('--request'),
    approval:single.get('--approval'),
    expectedApprovalSha256:single.get('--expected-approval-sha256'),
    verification:single.get('--verification'),
    patchCandidate:single.get('--patch-candidate'),
    sourceManifest:single.get('--source-manifest'),
    sourceManifestDigest:single.get('--source-manifest-digest'),
    sourceResumePlan:single.get('--source-resume-plan'),
    sourceResumeDigest:single.get('--source-resume-digest'),
    targetManifest:single.get('--target-manifest'),
    targetManifestDigest:single.get('--target-manifest-digest'),
    receipt:single.get('--receipt'),
    repoRoot:single.get('--repo-root'),
    output:single.get('--output'),
    sourceReceipts:Object.freeze(sourceReceipts),
  });
}

export async function runCli(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const result=await buildHsmeReusePipelineReceiptContinuity({
    sourceSpecPath:args.sourceSpec,
    targetSpecPath:args.targetSpec,
    applicationPath:args.application,
    requestPath:args.request,
    approvalPath:args.approval,
    expectedApprovalSha256:args.expectedApprovalSha256,
    verificationPath:args.verification,
    patchCandidatePath:args.patchCandidate,
    sourceManifestPath:args.sourceManifest,
    sourceManifestDigestPath:args.sourceManifestDigest,
    sourceResumePlanPath:args.sourceResumePlan,
    sourceResumeDigestPath:args.sourceResumeDigest,
    sourceReceiptPaths:args.sourceReceipts,
    targetManifestPath:args.targetManifest,
    targetManifestDigestPath:args.targetManifestDigest,
    receiptPath:args.receipt,
    repoRoot:args.repoRoot,
  });
  await writeFile(resolve(args.output),result.files.continuity,{flag:'wx'});
  process.stdout.write(JSON.stringify({
    schemaVersion:HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_V1_SCHEMA,
    stageId:result.continuity.stageId,
    receiptSha256:result.continuity.receiptSha256,
    sourceSpecFileSha256:result.continuity.sourceSpecFileSha256,
    targetSpecFileSha256:result.continuity.targetSpecFileSha256,
    continuitySha256:result.continuity.continuitySha256,
    continuityState:result.continuity.continuityState,
  })+'\n');
}

if(process.env.HSME_REUSE_PIPELINE_RECEIPT_CONTINUITY_BUILDER_CLI==='1'){
  runCli().catch(error=>{
    process.stderr.write(
      (error.code||'hsme_reuse_continuity_build_failed')+': '+error.message+'\n',
    );
    process.exitCode=1;
  });
}

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';

import {
  HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
  candidateAssemblyOriginIndexDigest,
} from '../scripts/materialize-hsme-reuse-candidate-assembly.mjs';
import {
  HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
  canonicalFileBytes,
  domainDigest,
  planHsmeReuseEvidencePipeline,
  sha256Bytes,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';
import {
  HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_DEFINITION_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
  bindStageInputs,
  findStage,
  validateRepoRuntime,
  validateStageProgram,
} from '../scripts/run-hsme-reuse-pipeline-stage.mjs';
import {
  HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_V1_SCHEMA,
  buildHsmeReusePipelineApprovedPinReplanPackage,
} from '../scripts/build-hsme-reuse-pipeline-approved-pin-replan-package.mjs';

const APPLICATION_SCHEMA='BERS_HSME_REUSE_PIPELINE_SPEC_PIN_APPLICATION_V1';
const APPLICATION_DOMAIN='bers:hsme:reuse-pipeline-spec-pin-application:v1\0';
const H=value=>createHash('sha256').update(value).digest('hex');

function authorityFalse(){
  return {
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
  };
}

async function exists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    throw error;
  }
}

async function writePretty(path,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  await writeFile(path,bytes);
  return Object.freeze({path,fileSha256:sha256Bytes(bytes),bytes});
}

async function planToFiles(spec,specFileSha256,manifestPath,digestPath){
  const planned=await planHsmeReuseEvidencePipeline({
    spec,
    specFileSha256,
    manifestPath,
    digestPath,
  });
  await writeFile(manifestPath,planned.files.manifest);
  await writeFile(digestPath,planned.files.digest);
  return planned;
}

async function makeReceipt({planned,stage,receiptPath}){
  const program=validateStageProgram(stage);
  const runtime=await validateRepoRuntime(process.cwd(),program.allowed.script);
  const inputs=bindStageInputs(planned.manifest,stage);
  const argvSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_ARGV_DIGEST_DOMAIN,
    {stageId:stage.stageId,kind:stage.kind,env:stage.env,argv:stage.argv},
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

  const outputs=[];
  for(const [index,path] of stage.outputs.entries()){
    const bytes=canonicalFileBytes({
      schemaVersion:'BERS_HSME_REPLAN_PACKAGE_TEST_OUTPUT_V1',
      stageId:stage.stageId,
      outputIndex:index,
      observedOnly:true,
    });
    await writeFile(path,bytes);
    outputs.push(Object.freeze({
      path:resolve(path),
      fileSha256:sha256Bytes(bytes),
      bytes:bytes.length,
    }));
  }

  const payload=Object.freeze({
    schemaVersion:HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
    manifestSha256:planned.digest.manifestSha256,
    manifestFileSha256:planned.digest.manifestFileSha256,
    specFileSha256:planned.manifest.specFileSha256,
    stageId:stage.stageId,
    stageKind:stage.kind,
    argvSha256,
    stageDefinitionSha256,
    repositoryCommitSha:runtime.repositoryCommitSha,
    trackedTreeClean:true,
    stageScriptSha256:runtime.scriptSha256,
    nodeResolutionHookSha256:runtime.hookSha256,
    inputs,
    stdoutSha256:H('stdout|'+stage.stageId),
    stderrSha256:H('stderr|'+stage.stageId),
    stdoutBytes:0,
    stderrBytes:0,
    outputs:Object.freeze(outputs),
    executionState:'SUCCEEDED',
    outputTrustState:'OBSERVED_NOT_PIN_AUTHORITY',
    externalPinCreated:false,
    ...authorityFalse(),
  });
  const receipt=Object.freeze({
    ...payload,
    receiptSha256:domainDigest(
      HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
      payload,
    ),
  });
  await writeFile(receiptPath,canonicalFileBytes(receipt));
  return receipt;
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-replan-package-'));
  const inputs=join(root,'inputs');
  const out=join(root,'out');
  const control=join(root,'control');
  const qualityOut=join(out,'quality');
  const assemblyOut=join(out,'assembly');
  const freezeOut=join(out,'freeze');
  const outcomeOut=join(out,'outcome');
  await Promise.all([
    mkdir(inputs,{recursive:true}),
    mkdir(control,{recursive:true}),
    mkdir(qualityOut,{recursive:true}),
    mkdir(assemblyOut,{recursive:true}),
    mkdir(freezeOut,{recursive:true}),
    mkdir(outcomeOut,{recursive:true}),
  ]);

  const sourcePath=join(inputs,'source.json');
  const campaignPath=join(inputs,'campaign.json');
  const source=await writePretty(sourcePath,{scope:'replan-source'});
  const campaign=await writePretty(campaignPath,{scope:'replan-campaign'});

  const qualityInputs={};
  for(const name of [
    'trust','fixture-plan','fixture-pack','quality-rubric',
    'run-evidence','assessment-evidence','resource-evidence',
  ]){
    const path=join(inputs,name+'.json');
    await writePretty(path,{scope:'replan-quality',name});
    qualityInputs[name]=path;
  }

  const origin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:'flux2-klein-4b-distilled-v1',
    sourceDecisionFileSha256:source.fileSha256,
    campaignFileSha256:campaign.fileSha256,
    proofs:[],
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
  };
  const originPath=join(inputs,'assembly-origin.json');
  await writePretty(originPath,origin);
  const approvedPin=candidateAssemblyOriginIndexDigest(origin);

  const assemblyPath=join(assemblyOut,'hsme-reuse-candidate-assembly.json');
  const frontierPath=join(qualityOut,'hsme-foundation-quality-frontier.json');
  const paretoPath=join(qualityOut,'hsme-foundation-pareto-efficiency.json');

  const oldSpec={
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
    qualityPareto:{
      campaign:campaignPath,
      trust:qualityInputs.trust,
      fixturePlan:qualityInputs['fixture-plan'],
      fixturePack:qualityInputs['fixture-pack'],
      qualityRubric:qualityInputs['quality-rubric'],
      runEvidence:qualityInputs['run-evidence'],
      assessmentEvidence:qualityInputs['assessment-evidence'],
      resourceEvidence:qualityInputs['resource-evidence'],
      outputDir:qualityOut,
    },
    capabilityProofs:[],
    candidateAssemblies:[{
      stageId:'candidate-a',
      candidateId:'flux2-klein-4b-distilled-v1',
      sourceDecision:sourcePath,
      campaign:campaignPath,
      proofs:[],
      originIndex:originPath,
      expectedOriginIndexSha256:null,
      outputDir:assemblyOut,
    }],
    outcome:{
      sourceDecision:sourcePath,
      campaign:campaignPath,
      assemblies:[assemblyPath],
      frontier:frontierPath,
      pareto:paretoPath,
      originFreezeOutputDir:freezeOut,
      expectedOriginIndexSha256:null,
      materializationOutputDir:outcomeOut,
    },
  };

  const oldSpecPath=join(control,'pipeline-spec-old.json');
  const oldSpecLoaded=await writePretty(oldSpecPath,oldSpec);
  const oldManifestPath=join(control,'manifest-old.json');
  const oldDigestPath=join(control,'manifest-old-digest.json');
  const oldPlan=await planToFiles(
    oldSpec,
    oldSpecLoaded.fileSha256,
    oldManifestPath,
    oldDigestPath,
  );

  const qualityStage=findStage(oldPlan.manifest,'quality-pareto');
  assert.equal(qualityStage.status,'READY');
  const receiptPath=join(control,'quality-receipt.json');
  const receipt=await makeReceipt({
    planned:oldPlan,
    stage:qualityStage,
    receiptPath,
  });

  const approvedSpec=structuredClone(oldSpec);
  approvedSpec.candidateAssemblies[0].expectedOriginIndexSha256=approvedPin;
  const approvedSpecPath=join(control,'pipeline-spec-approved.json');
  const approvedSpecBytes=canonicalFileBytes(approvedSpec);
  await writeFile(approvedSpecPath,approvedSpecBytes);
  const approvedSpecFileSha256=sha256Bytes(approvedSpecBytes);

  const applicationPayload=Object.freeze({
    schemaVersion:APPLICATION_SCHEMA,
    applicationState:'PIN_MATERIALIZED_NEW_SPEC',
    sourceSpecPath:resolve(oldSpecPath),
    sourceSpecFileSha256:oldSpecLoaded.fileSha256,
    outputSpecPath:resolve(approvedSpecPath),
    outputSpecFileSha256:approvedSpecFileSha256,
    requestSha256:H('request'),
    approvalSha256:H('approval'),
    patchCandidateSha256:H('patch'),
    stageId:'assembly:candidate-a',
    stageKind:'CANDIDATE_ASSEMBLY',
    jsonPointer:'/candidateAssemblies/0/expectedOriginIndexSha256',
    appliedExternalPinSha256:approvedPin,
    sourceSpecMutated:false,
    replanRequired:true,
    automaticContinuationAllowed:false,
    stageExecutionAuthorized:false,
    externalPinCreated:true,
    ...authorityFalse(),
  });
  const application=Object.freeze({
    ...applicationPayload,
    applicationSha256:domainDigest(APPLICATION_DOMAIN,applicationPayload),
  });
  const applicationPath=join(control,'pin-application.json');
  await writeFile(applicationPath,canonicalFileBytes(application));

  return {
    root,
    control,
    oldSpecPath,
    approvedSpecPath,
    applicationPath,
    oldManifestPath,
    oldDigestPath,
    receiptPath,
    receipt,
  };
}

function packageArgs(fx,outputDir,{receipts=[fx.receiptPath]}={}){
  return {
    sourceSpecPath:fx.oldSpecPath,
    approvedSpecPath:fx.approvedSpecPath,
    pinApplicationPath:fx.applicationPath,
    sourceManifestPath:fx.oldManifestPath,
    sourceDigestPath:fx.oldDigestPath,
    receiptPaths:receipts,
    repoRoot:process.cwd(),
    outputDir,
  };
}

test('approved-pin replan package carries unchanged receipt and exposes patched stage READY',async()=>{
  const fx=await fixture();
  const packageDir=join(fx.root,'package');
  const result=await buildHsmeReusePipelineApprovedPinReplanPackage(
    packageArgs(fx,packageDir),
  );

  assert.equal(
    result.package.schemaVersion,
    HSME_REUSE_PIPELINE_APPROVED_PIN_REPLAN_PACKAGE_V1_SCHEMA,
  );
  assert.equal(result.package.packageState,'REPLAN_READY_NO_EXECUTION');
  assert.equal(result.package.carryForwards.length,1);
  assert.equal(result.package.notCarried.length,0);
  assert.equal(result.package.carryForwards[0].stageId,'quality-pareto');
  assert.equal(result.package.carryForwards[0].decision,'CARRIED_UNCHANGED_STAGE');
  assert.ok(result.package.readyStageIds.includes('assembly:candidate-a'));
  assert.equal(result.package.packageExecutesStages,false);
  assert.equal(result.package.automaticContinuationAllowed,false);

  const quality=result.resumePlan.stages.find(value=>value.stageId==='quality-pareto');
  const assembly=result.resumePlan.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(quality.resumeState,'COMPLETED_OBSERVED');
  assert.equal(quality.completionEvidenceKind,'CARRY_FORWARD_PROOF');
  assert.equal(assembly.resumeState,'READY_TO_EXECUTE');
  assert.equal(
    await exists(join(packageDir,'hsme-reuse-approved-pin-replan-package.json')),
    true,
  );
});

test('zero supplied receipts still yields a verified non-executing replan package',async()=>{
  const fx=await fixture();
  const packageDir=join(fx.root,'package-zero');
  const result=await buildHsmeReusePipelineApprovedPinReplanPackage(
    packageArgs(fx,packageDir,{receipts:[]}),
  );
  assert.deepEqual(result.package.carryForwards,[]);
  assert.deepEqual(result.package.notCarried,[]);
  assert.equal(result.package.packageExecutesStages,false);
  assert.equal(result.package.plannerExecutesStages,false);
  assert.equal(result.package.externalPinsAutoTrusted,false);
  assert.match(result.package.packageSha256,/^[0-9a-f]{64}$/);
});

test('tampered old receipt fails and removes the incomplete package directory',async()=>{
  const fx=await fixture();
  const raw=JSON.parse(await readFile(fx.receiptPath,'utf8'));
  raw.receiptSha256=H('tampered-receipt');
  await writeFile(fx.receiptPath,canonicalFileBytes(raw));
  const packageDir=join(fx.root,'package-tampered-receipt');

  await assert.rejects(
    ()=>buildHsmeReusePipelineApprovedPinReplanPackage(packageArgs(fx,packageDir)),
    error=>error.code==='hsme_reuse_carry_receipt_digest_mismatch',
  );
  assert.equal(await exists(packageDir),false);
});

test('approved spec drift from application fails before package publication',async()=>{
  const fx=await fixture();
  const approved=JSON.parse(await readFile(fx.approvedSpecPath,'utf8'));
  approved.qualityPareto.outputDir=join(fx.root,'other-quality-dir');
  await writeFile(fx.approvedSpecPath,canonicalFileBytes(approved));
  const packageDir=join(fx.root,'package-spec-drift');

  await assert.rejects(
    ()=>buildHsmeReusePipelineApprovedPinReplanPackage(packageArgs(fx,packageDir)),
    error=>
      error.code==='hsme_replan_package_application_spec_drift'
      ||error.code==='hsme_replan_package_spec_diff_invalid',
  );
  assert.equal(await exists(packageDir),false);
});

test('same exact inputs rebuilt at the same path produce byte-identical package manifest',async()=>{
  const fx=await fixture();
  const packageDir=join(fx.root,'package-deterministic');
  const first=await buildHsmeReusePipelineApprovedPinReplanPackage(
    packageArgs(fx,packageDir),
  );
  const firstBytes=await readFile(
    join(packageDir,'hsme-reuse-approved-pin-replan-package.json'),
  );
  await rm(packageDir,{recursive:true,force:true});

  const second=await buildHsmeReusePipelineApprovedPinReplanPackage(
    packageArgs(fx,packageDir),
  );
  const secondBytes=await readFile(
    join(packageDir,'hsme-reuse-approved-pin-replan-package.json'),
  );
  assert.deepEqual(firstBytes,secondBytes);
  assert.equal(first.package.packageSha256,second.package.packageSha256);
});

test('package manifest grants no execution, semantic, training or production authority',async()=>{
  const fx=await fixture();
  const result=await buildHsmeReusePipelineApprovedPinReplanPackage(
    packageArgs(fx,join(fx.root,'package-authority')),
  );
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
    assert.equal(result.package[field],false,field);
  }
  assert.equal(result.package.packageExecutesStages,false);
  assert.equal(result.package.automaticContinuationAllowed,false);
});

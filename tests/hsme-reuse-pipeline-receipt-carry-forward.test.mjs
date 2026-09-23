import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
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
  planHsmeReusePipelineResume,
} from '../scripts/plan-hsme-reuse-pipeline-resume.mjs';
import {
  HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1_SCHEMA,
  buildHsmeReusePipelineReceiptCarryForward,
  verifyHsmeReusePipelineReceiptCarryForward,
} from '../scripts/verify-hsme-reuse-pipeline-receipt-carry-forward.mjs';

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

async function makeReceipt({manifest,stage,receiptPath}){
  const program=validateStageProgram(stage);
  const runtime=await validateRepoRuntime(process.cwd(),program.allowed.script);
  const inputs=bindStageInputs(manifest,stage);
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
      schemaVersion:'BERS_HSME_TEST_OBSERVED_OUTPUT_V1',
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
    manifestSha256:manifest.digest.manifestSha256,
    manifestFileSha256:manifest.digest.manifestFileSha256,
    specFileSha256:manifest.manifest.specFileSha256,
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
  const root=await mkdtemp(join(tmpdir(),'hsme-carry-'));
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
  const source=await writePretty(sourcePath,{scope:'carry-source'});
  const campaign=await writePretty(campaignPath,{scope:'carry-campaign'});

  const qualityInputs={};
  for(const name of [
    'trust','fixture-plan','fixture-pack','quality-rubric',
    'run-evidence','assessment-evidence','resource-evidence',
  ]){
    const path=join(inputs,name+'.json');
    await writePretty(path,{scope:'carry-quality',name});
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
    manifest:oldPlan,
    stage:qualityStage,
    receiptPath,
  });

  const newSpec=structuredClone(oldSpec);
  newSpec.candidateAssemblies[0].expectedOriginIndexSha256=approvedPin;
  const newSpecPath=join(control,'pipeline-spec-approved.json');
  const newSpecBytes=canonicalFileBytes(newSpec);
  await writeFile(newSpecPath,newSpecBytes);
  const newSpecFileSha256=sha256Bytes(newSpecBytes);

  const applicationPayload=Object.freeze({
    schemaVersion:APPLICATION_SCHEMA,
    applicationState:'PIN_MATERIALIZED_NEW_SPEC',
    sourceSpecPath:resolve(oldSpecPath),
    sourceSpecFileSha256:oldSpecLoaded.fileSha256,
    outputSpecPath:resolve(newSpecPath),
    outputSpecFileSha256:newSpecFileSha256,
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

  const newManifestPath=join(control,'manifest-new.json');
  const newDigestPath=join(control,'manifest-new-digest.json');
  const newPlan=await planToFiles(
    newSpec,
    newSpecFileSha256,
    newManifestPath,
    newDigestPath,
  );

  return {
    root,
    control,
    oldSpecPath,
    newSpecPath,
    oldManifestPath,
    oldDigestPath,
    receiptPath,
    receipt,
    applicationPath,
    newManifestPath,
    newDigestPath,
    newPlan,
  };
}

function buildArgs(fx){
  return {
    sourceManifestPath:fx.oldManifestPath,
    sourceDigestPath:fx.oldDigestPath,
    sourceReceiptPath:fx.receiptPath,
    pinApplicationPath:fx.applicationPath,
    sourceSpecPath:fx.oldSpecPath,
    outputSpecPath:fx.newSpecPath,
    currentManifestPath:fx.newManifestPath,
    currentDigestPath:fx.newDigestPath,
    repoRoot:process.cwd(),
  };
}

test('unchanged completed predecessor carries into approved-pin replan without execution',async()=>{
  const fx=await fixture();
  const built=await buildHsmeReusePipelineReceiptCarryForward(buildArgs(fx));
  assert.equal(
    built.proof.schemaVersion,
    HSME_REUSE_PIPELINE_RECEIPT_CARRY_FORWARD_V1_SCHEMA,
  );
  assert.equal(built.proof.stageId,'quality-pareto');
  assert.equal(built.proof.carryForwardState,'UNCHANGED_STAGE_OBSERVED');
  assert.equal(built.proof.stageReexecuted,false);
  assert.equal(built.proof.receiptChainDepth,1);
  assert.equal(built.proof.patchedStageId,'assembly:candidate-a');
  assert.equal(built.proof.sourceReceiptSha256,fx.receipt.receiptSha256);

  const proofPath=join(fx.control,'quality-carry-forward.json');
  await writeFile(proofPath,built.files.proof);
  const verified=await verifyHsmeReusePipelineReceiptCarryForward({
    proofPath,
    currentManifestPath:fx.newManifestPath,
    currentDigestPath:fx.newDigestPath,
    repoRoot:process.cwd(),
  });
  assert.equal(verified.carryForwardProofSha256,built.proof.carryForwardProofSha256);

  const resumed=await planHsmeReusePipelineResume({
    manifestPath:fx.newManifestPath,
    digestPath:fx.newDigestPath,
    receiptPaths:[],
    carryForwardPaths:[proofPath],
    repoRoot:process.cwd(),
  });
  const quality=resumed.plan.stages.find(value=>value.stageId==='quality-pareto');
  const assembly=resumed.plan.stages.find(value=>value.stageId==='assembly:candidate-a');
  assert.equal(quality.resumeState,'COMPLETED_OBSERVED');
  assert.equal(quality.completionEvidenceKind,'CARRY_FORWARD_PROOF');
  assert.equal(quality.sourceReceiptSha256,fx.receipt.receiptSha256);
  assert.equal(assembly.resumeState,'READY_TO_EXECUTE');
  assert.ok(resumed.plan.readyStageIds.includes('assembly:candidate-a'));
  assert.equal(resumed.plan.plannerExecutesStages,false);
});

test('tampered carried output invalidates both proof construction and later verification',async()=>{
  const fx=await fixture();
  const built=await buildHsmeReusePipelineReceiptCarryForward(buildArgs(fx));
  const proofPath=join(fx.control,'quality-carry-forward.json');
  await writeFile(proofPath,built.files.proof);
  await writeFile(
    fx.receipt.outputs[0].path,
    canonicalFileBytes({tampered:true}),
  );
  await assert.rejects(
    ()=>verifyHsmeReusePipelineReceiptCarryForward({
      proofPath,
      currentManifestPath:fx.newManifestPath,
      currentDigestPath:fx.newDigestPath,
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_carry_output_drift',
  );
});

test('extra spec drift beyond the approved pin pointer blocks carry-forward',async()=>{
  const fx=await fixture();
  const changed=JSON.parse(await readFile(fx.newSpecPath,'utf8'));
  changed.qualityPareto.outputDir=join(fx.root,'different-quality-output');
  await writeFile(fx.newSpecPath,canonicalFileBytes(changed));
  await assert.rejects(
    ()=>buildHsmeReusePipelineReceiptCarryForward(buildArgs(fx)),
    error=>
      error.code==='hsme_reuse_carry_application_spec_binding_drift'
      ||error.code==='hsme_reuse_carry_manifest_spec_binding_drift'
      ||error.code==='hsme_reuse_carry_spec_diff_invalid',
  );
});

test('resume rejects receipt and carry-forward proof for the same stage',async()=>{
  const fx=await fixture();
  const built=await buildHsmeReusePipelineReceiptCarryForward(buildArgs(fx));
  const proofPath=join(fx.control,'quality-carry-forward.json');
  await writeFile(proofPath,built.files.proof);
  await assert.rejects(
    ()=>planHsmeReusePipelineResume({
      manifestPath:fx.newManifestPath,
      digestPath:fx.newDigestPath,
      receiptPaths:[fx.receiptPath],
      carryForwardPaths:[proofPath],
      repoRoot:process.cwd(),
    }),
    error=>
      error.code==='hsme_reuse_resume_receipt_spec_drift'
      ||error.code==='hsme_reuse_resume_completion_evidence_duplicate',
  );
});

test('carry-forward proof grants no semantic, execution, training or production authority',async()=>{
  const fx=await fixture();
  const {proof}=await buildHsmeReusePipelineReceiptCarryForward(buildArgs(fx));
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
    assert.equal(proof[field],false,field);
  }
  assert.equal(proof.stageReexecuted,false);
  assert.equal(proof.externalPinCreated,false);
});

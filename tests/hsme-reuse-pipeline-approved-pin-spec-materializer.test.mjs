import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
  candidateAssemblyOriginIndexDigest,
  HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
} from '../scripts/materialize-hsme-reuse-candidate-assembly.mjs';
import {
  HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
  canonicalFileBytes,
  planHsmeReuseEvidencePipeline,
  sha256Bytes,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';
import {
  planHsmeReusePipelineResume,
} from '../scripts/plan-hsme-reuse-pipeline-resume.mjs';
import {
  buildHsmeReusePipelineExternalPinRequest,
} from '../scripts/build-hsme-reuse-pipeline-external-pin-request.mjs';
import {
  HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1_SCHEMA,
  hsmeReusePipelineExternalPinApprovalV1Digest,
  verifyHsmeReusePipelineExternalPinApproval,
} from '../scripts/verify-hsme-reuse-pipeline-external-pin-approval.mjs';
import {
  materializeHsmeReusePipelineApprovedPinSpec,
} from '../scripts/materialize-hsme-reuse-pipeline-approved-pin-spec.mjs';

const H=value=>createHash('sha256').update(value).digest('hex');
const CANDIDATE='flux2-klein-4b-distilled-v1';

function authorityFalse(){
  return {
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
  return sha256Bytes(bytes);
}

async function fixture({decision='APPROVED'}={}){
  const root=await mkdtemp(join(tmpdir(),'hsme-pin-apply-'));
  const inputs=join(root,'inputs');
  const out=join(root,'out');
  const qualityOut=join(out,'quality');
  const assemblyOut=join(out,'assembly');
  const freezeOut=join(out,'freeze');
  const outcomeOut=join(out,'outcome');
  const control=join(out,'control');
  await Promise.all([
    mkdir(inputs,{recursive:true}),
    mkdir(qualityOut,{recursive:true}),
    mkdir(assemblyOut,{recursive:true}),
    mkdir(freezeOut,{recursive:true}),
    mkdir(outcomeOut,{recursive:true}),
    mkdir(control,{recursive:true}),
  ]);

  const sourcePath=join(inputs,'source.json');
  const campaignPath=join(inputs,'campaign.json');
  const sourceSha=await writePretty(sourcePath,{scope:'pin-apply-source'});
  const campaignSha=await writePretty(campaignPath,{scope:'pin-apply-campaign'});
  const originPath=join(inputs,'origin.json');
  const origin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:CANDIDATE,
    sourceDecisionFileSha256:sourceSha,
    campaignFileSha256:campaignSha,
    proofs:[],
    ...authorityFalse(),
  };
  await writePretty(originPath,origin);
  const originDigest=candidateAssemblyOriginIndexDigest(origin);

  const qualityInputs={};
  for(const name of [
    'trust','fixture-plan','fixture-pack','quality-rubric',
    'run-evidence','assessment-evidence','resource-evidence',
  ]){
    const p=join(inputs,name+'.json');
    await writePretty(p,{scope:'pin-apply-quality',name});
    qualityInputs[name]=p;
  }

  const assemblyOutput=join(assemblyOut,'hsme-reuse-candidate-assembly.json');
  const spec={
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
      candidateId:CANDIDATE,
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
      assemblies:[assemblyOutput],
      frontier:join(qualityOut,'hsme-foundation-quality-frontier.json'),
      pareto:join(qualityOut,'hsme-foundation-pareto-efficiency.json'),
      originFreezeOutputDir:freezeOut,
      expectedOriginIndexSha256:null,
      materializationOutputDir:outcomeOut,
    },
  };
  const specPath=join(control,'source-spec.json');
  const specBytes=Buffer.from(JSON.stringify(spec,null,2)+'\n','utf8');
  await writeFile(specPath,specBytes);
  const specSha=sha256Bytes(specBytes);

  const manifestPath=join(control,'manifest.json');
  const digestPath=join(control,'manifest-digest.json');
  const planned=await planHsmeReuseEvidencePipeline({
    spec,
    specFileSha256:specSha,
    manifestPath,
    digestPath,
  });
  await writeFile(manifestPath,planned.files.manifest);
  await writeFile(digestPath,planned.files.digest);
  assert.equal(
    planned.manifest.stages.find(x=>x.stageId==='assembly:candidate-a').status,
    'EXTERNAL_PIN_REQUIRED',
  );

  const resume=await planHsmeReusePipelineResume({
    manifestPath,digestPath,receiptPaths:[],repoRoot:process.cwd(),
  });
  const resumePlanPath=join(control,'resume.json');
  const resumeDigestPath=join(control,'resume-digest.json');
  await writeFile(resumePlanPath,resume.files.plan);
  await writeFile(resumeDigestPath,resume.files.digest);

  const requestResult=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath,digestPath,resumePlanPath,resumeDigestPath,
    receiptPaths:[],stageId:'assembly:candidate-a',repoRoot:process.cwd(),
  });
  const requestPath=join(control,'request.json');
  await writeFile(requestPath,requestResult.files.request);

  const approval={
    schemaVersion:HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1_SCHEMA,
    requestSha256:requestResult.request.requestSha256,
    requestStageId:requestResult.request.stageId,
    requestedExternalPinSha256:requestResult.request.requestedExternalPinSha256,
    specFileSha256:specSha,
    decision,
    approvalAuthorityId:'external-review-board:test-v1',
    approvalEvidenceSha256:H('pin-apply-approval|'+decision),
    semanticEvidenceReviewed:true,
    specMutationPerformed:false,
    stageExecutionAuthorized:false,
    semanticEvidenceAuthorityGranted:false,
    ...authorityFalse(),
  };
  const approvalPath=join(control,'approval.json');
  await writeFile(approvalPath,canonicalFileBytes(approval));
  const expectedApprovalSha256=hsmeReusePipelineExternalPinApprovalV1Digest(approval);

  const verified=await verifyHsmeReusePipelineExternalPinApproval({
    requestPath,
    approvalPath,
    expectedApprovalSha256,
    specPath,
    manifestPath,
    digestPath,
    resumePlanPath,
    resumeDigestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
  });
  const verificationPath=join(control,'verification.json');
  const patchPath=join(control,'patch.json');
  await writeFile(verificationPath,verified.files.verification);
  await writeFile(
    patchPath,
    verified.files.patchCandidate??canonicalFileBytes({rejected:true}),
  );

  return {
    root,out,control,spec,specPath,specBytes,specSha,manifestPath,digestPath,
    resumePlanPath,resumeDigestPath,requestPath,approvalPath,
    expectedApprovalSha256,verificationPath,patchPath,verified,
    outputSpecPath:join(control,'derived-spec.json'),
    applicationPath:join(control,'application.json'),
    originDigest,
  };
}

function args(fx,overrides={}){
  return {
    sourceSpecPath:fx.specPath,
    requestPath:fx.requestPath,
    approvalPath:fx.approvalPath,
    expectedApprovalSha256:fx.expectedApprovalSha256,
    verificationPath:fx.verificationPath,
    patchCandidatePath:fx.patchPath,
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
    outputSpecPath:fx.outputSpecPath,
    applicationPath:fx.applicationPath,
    ...overrides,
  };
}

test('approved patch materializes a new spec with exactly one approved pin field changed',async()=>{
  const fx=await fixture();
  const result=await materializeHsmeReusePipelineApprovedPinSpec(args(fx));

  assert.equal(
    result.outputSpec.candidateAssemblies[0].expectedOriginIndexSha256,
    fx.originDigest,
  );
  assert.equal(result.application.applicationState,'PIN_MATERIALIZED_NEW_SPEC');
  assert.equal(result.application.externalPinCreated,true);
  assert.equal(result.application.sourceSpecMutated,false);
  assert.equal(result.application.replanRequired,true);
  assert.equal(result.application.automaticContinuationAllowed,false);
  assert.equal(result.application.stageExecutionAuthorized,false);
  assert.deepEqual(await readFile(fx.specPath),fx.specBytes);
});

test('new spec makes the explicitly approved stage READY only after a separate re-plan',async()=>{
  const fx=await fixture();
  const result=await materializeHsmeReusePipelineApprovedPinSpec(args(fx));
  await writeFile(fx.outputSpecPath,result.files.outputSpec);

  const derived=JSON.parse(result.files.outputSpec.toString('utf8'));
  const derivedSha=sha256Bytes(result.files.outputSpec);
  const manifest2=join(fx.control,'manifest-2.json');
  const digest2=join(fx.control,'manifest-digest-2.json');
  const planned=await planHsmeReuseEvidencePipeline({
    spec:derived,
    specFileSha256:derivedSha,
    manifestPath:manifest2,
    digestPath:digest2,
  });
  const stage=planned.manifest.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(stage.status,'READY');
  assert.equal(stage.expectedExternalPinSha256,fx.originDigest);
});

test('source spec can never be used as output path',async()=>{
  const fx=await fixture();
  await assert.rejects(
    ()=>materializeHsmeReusePipelineApprovedPinSpec(
      args(fx,{outputSpecPath:fx.specPath}),
    ),
    error=>error.code==='hsme_reuse_pin_apply_source_overwrite_forbidden',
  );
});

test('existing output file blocks materialization before any write',async()=>{
  const fx=await fixture();
  await writeFile(fx.outputSpecPath,Buffer.from('{}\n'));
  await assert.rejects(
    ()=>materializeHsmeReusePipelineApprovedPinSpec(args(fx)),
    error=>error.code==='hsme_reuse_pin_apply_output_exists',
  );
});

test('REJECTED external approval cannot materialize a pinned spec',async()=>{
  const fx=await fixture({decision:'REJECTED'});
  await assert.rejects(
    ()=>materializeHsmeReusePipelineApprovedPinSpec(args(fx)),
    error=>error.code==='hsme_reuse_pin_apply_verification_not_approved',
  );
});

test('stale supplied verification bytes cannot materialize',async()=>{
  const fx=await fixture();
  const value=JSON.parse(await readFile(fx.verificationPath,'utf8'));
  value.approvalEvidenceSha256=H('tampered-verification');
  await writeFile(fx.verificationPath,canonicalFileBytes(value));
  await assert.rejects(
    ()=>materializeHsmeReusePipelineApprovedPinSpec(args(fx)),
    error=>error.code==='hsme_reuse_pin_apply_verification_stale',
  );
});

test('application record grants only pin materialization, never execution or production authority',async()=>{
  const fx=await fixture();
  const result=await materializeHsmeReusePipelineApprovedPinSpec(args(fx));
  assert.equal(result.application.externalPinCreated,true);
  assert.equal(result.application.sourceSpecMutated,false);
  assert.equal(result.application.replanRequired,true);
  assert.equal(result.application.automaticContinuationAllowed,false);
  for(const field of [
    'stageExecutionAuthorized','semanticEvidenceAuthorityGranted',
    'decisionMutationAllowed','candidateSelectionAllowed','winnerSelectionAllowed',
    'reuseAdvanceAllowed','fullStudentEscalationAllowed','trainingRunStartAllowed',
    'trainingOrDistillationAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
  ]){
    assert.equal(result.application[field],false,field);
  }
});

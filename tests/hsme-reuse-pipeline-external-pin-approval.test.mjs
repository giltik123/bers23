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

async function writePrettyJson(path,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  await writeFile(path,bytes);
  return sha256Bytes(bytes);
}

async function fixture({decision='APPROVED'}={}){
  const root=await mkdtemp(join(tmpdir(),'hsme-pin-approval-'));
  const inputs=join(root,'inputs');
  const outputRoot=join(root,'out');
  const qualityOut=join(outputRoot,'quality');
  const assemblyOut=join(outputRoot,'assembly');
  const freezeOut=join(outputRoot,'freeze');
  const outcomeOut=join(outputRoot,'outcome');
  const control=join(outputRoot,'control');
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
  const sourceSha=await writePrettyJson(sourcePath,{scope:'approval-source'});
  const campaignSha=await writePrettyJson(campaignPath,{scope:'approval-campaign'});

  const originPath=join(inputs,'candidate-origin-index.json');
  const origin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:CANDIDATE,
    sourceDecisionFileSha256:sourceSha,
    campaignFileSha256:campaignSha,
    proofs:[],
    ...authorityFalse(),
  };
  await writePrettyJson(originPath,origin);
  const originSemanticSha256=candidateAssemblyOriginIndexDigest(origin);

  const qualityInputs={};
  for(const name of [
    'trust',
    'fixture-plan',
    'fixture-pack',
    'quality-rubric',
    'run-evidence',
    'assessment-evidence',
    'resource-evidence',
  ]){
    const p=join(inputs,name+'.json');
    await writePrettyJson(p,{scope:'approval-quality-input',name});
    qualityInputs[name]=p;
  }

  const assemblyPath=join(assemblyOut,'hsme-reuse-candidate-assembly.json');
  const frontierPath=join(qualityOut,'hsme-foundation-quality-frontier.json');
  const paretoPath=join(qualityOut,'hsme-foundation-pareto-efficiency.json');
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
      assemblies:[assemblyPath],
      frontier:frontierPath,
      pareto:paretoPath,
      originFreezeOutputDir:freezeOut,
      expectedOriginIndexSha256:null,
      materializationOutputDir:outcomeOut,
    },
  };
  const specPath=join(control,'pipeline-spec.json');
  const specBytes=Buffer.from(JSON.stringify(spec,null,2)+'\n','utf8');
  await writeFile(specPath,specBytes);
  const specFileSha256=sha256Bytes(specBytes);

  const manifestPath=join(control,'manifest.json');
  const digestPath=join(control,'manifest-digest.json');
  const planned=await planHsmeReuseEvidencePipeline({
    spec,
    specFileSha256,
    manifestPath,
    digestPath,
  });
  await writeFile(manifestPath,planned.files.manifest);
  await writeFile(digestPath,planned.files.digest);

  const resume=await planHsmeReusePipelineResume({
    manifestPath,
    digestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
  });
  const resumePlanPath=join(control,'resume-plan.json');
  const resumeDigestPath=join(control,'resume-digest.json');
  await writeFile(resumePlanPath,resume.files.plan);
  await writeFile(resumeDigestPath,resume.files.digest);

  const requestResult=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath,
    digestPath,
    resumePlanPath,
    resumeDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
  });
  const requestPath=join(control,'pin-request.json');
  await writeFile(requestPath,requestResult.files.request);

  const approval={
    schemaVersion:HSME_REUSE_PIPELINE_EXTERNAL_PIN_APPROVAL_V1_SCHEMA,
    requestSha256:requestResult.request.requestSha256,
    requestStageId:requestResult.request.stageId,
    requestedExternalPinSha256:
      requestResult.request.requestedExternalPinSha256,
    specFileSha256,
    decision,
    approvalAuthorityId:'external-review-board:test-v1',
    approvalEvidenceSha256:H('external-approval-evidence|'+decision),
    semanticEvidenceReviewed:true,
    specMutationPerformed:false,
    stageExecutionAuthorized:false,
    semanticEvidenceAuthorityGranted:false,
    ...authorityFalse(),
  };
  const approvalPath=join(control,'external-approval.json');
  await writeFile(approvalPath,canonicalFileBytes(approval));
  const expectedApprovalSha256=
    hsmeReusePipelineExternalPinApprovalV1Digest(approval);

  return {
    root,
    control,
    spec,
    specPath,
    specBytes,
    specFileSha256,
    manifestPath,
    digestPath,
    resumePlanPath,
    resumeDigestPath,
    requestPath,
    request:requestResult.request,
    approvalPath,
    approval,
    expectedApprovalSha256,
    originPath,
    originSemanticSha256,
  };
}

function verifyArgs(fx,overrides={}){
  return {
    requestPath:fx.requestPath,
    approvalPath:fx.approvalPath,
    expectedApprovalSha256:fx.expectedApprovalSha256,
    specPath:fx.specPath,
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
    ...overrides,
  };
}

test('independently pinned APPROVED artifact yields deterministic explicit patch candidate',async()=>{
  const fx=await fixture({decision:'APPROVED'});
  const first=await verifyHsmeReusePipelineExternalPinApproval(verifyArgs(fx));
  const second=await verifyHsmeReusePipelineExternalPinApproval(verifyArgs(fx));

  assert.equal(
    first.verification.verificationState,
    'APPROVED_EXTERNAL_DIGEST_VERIFIED',
  );
  assert.equal(first.patchCandidate.patchState,'READY_FOR_EXPLICIT_APPLICATION');
  assert.equal(first.patchCandidate.collection,'candidateAssemblies');
  assert.equal(first.patchCandidate.entryStageId,'candidate-a');
  assert.equal(
    first.patchCandidate.jsonPointer,
    '/candidateAssemblies/0/expectedOriginIndexSha256',
  );
  assert.equal(first.patchCandidate.oldValue,null);
  assert.equal(
    first.patchCandidate.newValue,
    fx.request.requestedExternalPinSha256,
  );
  assert.equal(first.patchCandidate.specMutationPerformed,false);
  assert.equal(first.patchCandidate.automaticApplicationAllowed,false);
  assert.equal(first.patchCandidate.externalPinCreated,false);
  assert.deepEqual(first.files.verification,second.files.verification);
  assert.deepEqual(first.files.patchCandidate,second.files.patchCandidate);
  assert.deepEqual(await readFile(fx.specPath),fx.specBytes);
});

test('same local approval JSON is unusable without the independently supplied digest',async()=>{
  const fx=await fixture({decision:'APPROVED'});
  await assert.rejects(
    ()=>verifyHsmeReusePipelineExternalPinApproval(
      verifyArgs(fx,{expectedApprovalSha256:null}),
    ),
    error=>error.code==='hsme_reuse_pin_approval_expected_digest_invalid',
  );
  await assert.rejects(
    ()=>verifyHsmeReusePipelineExternalPinApproval(
      verifyArgs(fx,{expectedApprovalSha256:H('wrong-independent-pin')}),
    ),
    error=>error.code==='hsme_reuse_pin_approval_digest_mismatch',
  );
});

test('one-byte approval file drift fails even when JSON semantics are unchanged',async()=>{
  const fx=await fixture({decision:'APPROVED'});
  await writeFile(
    fx.approvalPath,
    Buffer.concat([await readFile(fx.approvalPath),Buffer.from(' ')]),
  );
  await assert.rejects(
    ()=>verifyHsmeReusePipelineExternalPinApproval(verifyArgs(fx)),
    error=>error.code==='hsme_reuse_pin_approval_not_canonical',
  );
});

test('externally pinned REJECTED decision never produces a spec patch candidate',async()=>{
  const fx=await fixture({decision:'REJECTED'});
  const result=await verifyHsmeReusePipelineExternalPinApproval(verifyArgs(fx));
  assert.equal(
    result.verification.verificationState,
    'REJECTED_EXTERNAL_DIGEST_VERIFIED',
  );
  assert.equal(result.patchCandidate,null);
  assert.equal(result.files.patchCandidate,null);
  assert.equal(result.verification.patchCandidateSha256,null);
  assert.deepEqual(await readFile(fx.specPath),fx.specBytes);
});

test('approval cannot bind a different request digest even with its own valid external digest',async()=>{
  const fx=await fixture({decision:'APPROVED'});
  const changed={...fx.approval,requestSha256:H('different-request')};
  await writeFile(fx.approvalPath,canonicalFileBytes(changed));
  const externalDigest=hsmeReusePipelineExternalPinApprovalV1Digest(changed);

  await assert.rejects(
    ()=>verifyHsmeReusePipelineExternalPinApproval(
      verifyArgs(fx,{expectedApprovalSha256:externalDigest}),
    ),
    error=>error.code==='hsme_reuse_pin_approval_request_binding_drift',
  );
});

test('source spec raw-byte drift invalidates request and approval binding before patch creation',async()=>{
  const fx=await fixture({decision:'APPROVED'});
  await writeFile(
    fx.specPath,
    Buffer.concat([await readFile(fx.specPath),Buffer.from(' ')]),
  );
  await assert.rejects(
    ()=>verifyHsmeReusePipelineExternalPinApproval(verifyArgs(fx)),
    error=>error.code==='hsme_reuse_pin_approval_spec_binding_drift',
  );
});

test('approval verifier never mutates spec, executes stage or grants hidden authority',async()=>{
  const fx=await fixture({decision:'APPROVED'});
  const result=await verifyHsmeReusePipelineExternalPinApproval(verifyArgs(fx));
  assert.deepEqual(await readFile(fx.specPath),fx.specBytes);

  for(const record of [result.verification,result.patchCandidate]){
    assert.equal(record.specMutationPerformed,false);
    assert.equal(record.stageExecutionAuthorized,false);
    assert.equal(record.externalPinCreated,false);
    assert.equal(record.semanticEvidenceAuthorityGranted,false);
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
      assert.equal(record[field],false,field);
    }
  }
});

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
  planHsmeReuseEvidencePipeline,
  sha256Bytes,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';
import {
  planHsmeReusePipelineResume,
} from '../scripts/plan-hsme-reuse-pipeline-resume.mjs';
import {
  buildHsmeReusePipelineExternalPinRequest,
} from '../scripts/build-hsme-reuse-pipeline-external-pin-request.mjs';

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

async function writeJson(path,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  await writeFile(path,bytes);
  return sha256Bytes(bytes);
}

async function fixture({pinned=false}={}){
  const root=await mkdtemp(join(tmpdir(),'hsme-pin-request-'));
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
  const sourceSha=await writeJson(sourcePath,{scope:'pin-request-source'});
  const campaignSha=await writeJson(campaignPath,{scope:'pin-request-campaign'});

  const originPath=join(inputs,'candidate-origin-index.json');
  const origin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:CANDIDATE,
    sourceDecisionFileSha256:sourceSha,
    campaignFileSha256:campaignSha,
    proofs:[],
    ...authorityFalse(),
  };
  await writeJson(originPath,origin);
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
    const path=join(inputs,name+'.json');
    await writeJson(path,{scope:'pin-request-quality-input',name});
    qualityInputs[name]=path;
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
      expectedOriginIndexSha256:pinned?originSemanticSha256:null,
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
  const specFileSha256=sha256Bytes(
    Buffer.from(JSON.stringify(spec,null,2)+'\n','utf8'),
  );
  const manifestPath=join(control,'manifest.json');
  const digestPath=join(control,'manifest-digest.json');

  const replan=async()=>{
    const planned=await planHsmeReuseEvidencePipeline({
      spec,
      specFileSha256,
      manifestPath,
      digestPath,
    });
    await writeFile(manifestPath,planned.files.manifest);
    await writeFile(digestPath,planned.files.digest);
    return planned;
  };

  const planned=await replan();
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

  return {
    root,
    sourcePath,
    campaignPath,
    originPath,
    originSemanticSha256,
    spec,
    planned,
    manifestPath,
    digestPath,
    resume,
    resumePlanPath,
    resumeDigestPath,
    replan,
    control,
  };
}

test('explicit EXTERNAL_PIN_REQUIRED stage emits deterministic external approval request',async()=>{
  const fx=await fixture();
  const stage=fx.planned.manifest.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(stage.status,'EXTERNAL_PIN_REQUIRED');
  assert.equal(stage.localStatus,'EXTERNAL_PIN_REQUIRED');
  assert.equal(
    fx.resume.plan.stages.find(value=>value.stageId===stage.stageId).resumeState,
    'EXTERNAL_PIN_REQUIRED',
  );

  const args={
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    stageId:stage.stageId,
    repoRoot:process.cwd(),
  };
  const first=await buildHsmeReusePipelineExternalPinRequest(args);
  const second=await buildHsmeReusePipelineExternalPinRequest(args);

  assert.equal(first.request.requestState,'AWAITING_EXTERNAL_APPROVAL');
  assert.equal(first.request.externalApprovalRequired,true);
  assert.equal(first.request.pinAccepted,false);
  assert.equal(first.request.specMutationAllowed,false);
  assert.equal(first.request.externalPinCreated,false);
  assert.equal(first.request.semanticEvidenceAuthorityGranted,false);
  assert.equal(
    first.request.requestedExternalPinSha256,
    fx.originSemanticSha256,
  );
  assert.match(first.request.originIndexFileSha256,/^[0-9a-f]{64}$/);
  assert.match(first.request.stageDefinitionSha256,/^[0-9a-f]{64}$/);
  assert.match(first.request.requestSha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(first.files.request,second.files.request);
});

test('already pinned READY stage cannot emit an external pin request',async()=>{
  const fx=await fixture({pinned:true});
  const stage=fx.planned.manifest.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(stage.status,'READY');

  await assert.rejects(
    ()=>buildHsmeReusePipelineExternalPinRequest({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      resumePlanPath:fx.resumePlanPath,
      resumeDigestPath:fx.resumeDigestPath,
      receiptPaths:[],
      stageId:stage.stageId,
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_pin_request_stage_not_pin_blocked',
  );
});

test('stale resume plan cannot request a pin after origin raw-byte drift',async()=>{
  const fx=await fixture();
  await writeFile(
    fx.originPath,
    Buffer.concat([await readFile(fx.originPath),Buffer.from(' ')]),
  );
  await fx.replan();

  await assert.rejects(
    ()=>buildHsmeReusePipelineExternalPinRequest({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      resumePlanPath:fx.resumePlanPath,
      resumeDigestPath:fx.resumeDigestPath,
      receiptPaths:[],
      stageId:'assembly:candidate-a',
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_pin_request_resume_plan_stale',
  );
});

test('fresh re-plan after origin byte drift preserves semantic candidate but changes raw request binding',async()=>{
  const fx=await fixture();
  const before=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
  });

  await writeFile(
    fx.originPath,
    Buffer.concat([await readFile(fx.originPath),Buffer.from(' ')]),
  );
  await fx.replan();
  const freshResume=await planHsmeReusePipelineResume({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
  });
  const freshPlanPath=join(fx.control,'resume-plan-2.json');
  const freshDigestPath=join(fx.control,'resume-digest-2.json');
  await writeFile(freshPlanPath,freshResume.files.plan);
  await writeFile(freshDigestPath,freshResume.files.digest);

  const after=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:freshPlanPath,
    resumeDigestPath:freshDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
  });

  assert.equal(
    after.request.requestedExternalPinSha256,
    before.request.requestedExternalPinSha256,
  );
  assert.notEqual(
    after.request.originIndexFileSha256,
    before.request.originIndexFileSha256,
  );
  assert.notEqual(after.request.requestSha256,before.request.requestSha256);
});

test('request artifact never grants pin, semantic, execution or production authority',async()=>{
  const fx=await fixture();
  const result=await buildHsmeReusePipelineExternalPinRequest({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
  });

  assert.equal(result.request.externalApprovalRequired,true);
  assert.equal(result.request.pinAccepted,false);
  assert.equal(result.request.specMutationAllowed,false);
  assert.equal(result.request.plannerExecutesStages,false);
  for(const field of [
    'externalPinCreated',
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
    assert.equal(result.request[field],false,field);
  }
});

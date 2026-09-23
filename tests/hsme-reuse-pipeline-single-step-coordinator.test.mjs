import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  access,
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
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
} from '../scripts/run-hsme-reuse-pipeline-stage.mjs';
import {
  planHsmeReusePipelineResume,
} from '../scripts/plan-hsme-reuse-pipeline-resume.mjs';
import {
  executeHsmeReusePipelineSingleStep,
} from '../scripts/execute-hsme-reuse-pipeline-single-step.mjs';

const H=value=>createHash('sha256').update(value).digest('hex');
const CANDIDATE='flux2-klein-4b-distilled-v1';
const campaignPath=
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json';
const campaign=JSON.parse(await readFile(campaignPath,'utf8'));

function unknownRuntime(){
  return {
    backboneBytes:'UNKNOWN',
    conditionerBytes:'UNKNOWN',
    vaeBytes:'UNKNOWN',
    adapterBytes:'UNKNOWN',
    otherRequiredBytes:'UNKNOWN',
    mandatoryInstalledBytes:'UNKNOWN',
    workingMemoryBytes:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
  };
}

function zeroTraining(){
  return {
    mode:'ZERO_TRAINING',
    trainableParameters:0,
    frozenParameters:'UNKNOWN',
    trainingExamples:0,
    gpuSeconds:0,
    trainingCostMicrousd:0,
    evidenceSha256:'UNKNOWN',
  };
}

function placeholder(id,strategy){
  return {
    candidateId:id,
    strategy,
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:'bers/'+id,
      immutableRevision:'a'.repeat(40),
      contentSha256:H(id+'-source'),
    },
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:strategy==='DIRECT_FOUNDATION'
      ?zeroTraining()
      :{
        mode:'LORA',
        trainableParameters:10,
        frozenParameters:1000,
        trainingExamples:10,
        gpuSeconds:10,
        trainingCostMicrousd:100,
        evidenceSha256:'UNKNOWN',
      },
    rejectionReasons:[],
  };
}

function sourceDecision(){
  const meta=campaign.candidates.find(value=>value.candidateId===CANDIDATE);
  assert.ok(meta);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['single-step coordinator test keeps decision pending'],
    candidates:[
      placeholder('control-single-step','CONTROL_BASELINE'),
      {
        candidateId:CANDIDATE,
        strategy:'DIRECT_FOUNDATION',
        targetTier:'MOBILE_DEFAULT',
        evidenceState:'UNRESOLVED',
        source:{
          sourceRoot:meta.sourceRoot,
          immutableRevision:meta.immutableRevision,
          contentSha256:meta.modelContentSha256,
        },
        licenseConclusion:'REVIEW_REQUIRED',
        licenseEvidenceSha256:'UNKNOWN',
        quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
        runtime:unknownRuntime(),
        training:zeroTraining(),
        rejectionReasons:[],
      },
      placeholder('adapt-single-step','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

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

async function fileExists(path){
  try{
    await access(path);
    return true;
  }catch(error){
    if(error?.code==='ENOENT')return false;
    throw error;
  }
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-single-step-'));
  const inputs=join(root,'inputs');
  const outputRoot=join(root,'out');
  const qualityOut=join(outputRoot,'quality');
  const assemblyOut=join(outputRoot,'assembly');
  const outcomeFreezeOut=join(outputRoot,'outcome-freeze');
  const outcomeOut=join(outputRoot,'outcome');
  const receiptDir=join(outputRoot,'receipts');
  const controlDir=join(outputRoot,'control');
  const manifestDir=join(root,'manifest');
  await Promise.all([
    mkdir(inputs,{recursive:true}),
    mkdir(qualityOut,{recursive:true}),
    mkdir(assemblyOut,{recursive:true}),
    mkdir(outcomeFreezeOut,{recursive:true}),
    mkdir(outcomeOut,{recursive:true}),
    mkdir(receiptDir,{recursive:true}),
    mkdir(controlDir,{recursive:true}),
    mkdir(manifestDir,{recursive:true}),
  ]);

  const sourcePath=join(inputs,'source-decision.json');
  const sourceSha=await writeJson(sourcePath,sourceDecision());
  const campaignBytes=await readFile(campaignPath);
  const campaignSha=sha256Bytes(campaignBytes);
  const originPath=join(inputs,'assembly-origin-index.json');
  const origin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:CANDIDATE,
    sourceDecisionFileSha256:sourceSha,
    campaignFileSha256:campaignSha,
    proofs:[],
    ...authorityFalse(),
  };
  await writeJson(originPath,origin);
  const assemblyPin=candidateAssemblyOriginIndexDigest(origin);

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
    await writeJson(path,{scope:'single-step-planner-only',name});
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
      expectedOriginIndexSha256:assemblyPin,
      outputDir:assemblyOut,
    }],
    outcome:{
      sourceDecision:sourcePath,
      campaign:campaignPath,
      assemblies:[assemblyPath],
      frontier:frontierPath,
      pareto:paretoPath,
      originFreezeOutputDir:outcomeFreezeOut,
      expectedOriginIndexSha256:null,
      materializationOutputDir:outcomeOut,
    },
  };
  const specFileSha256=sha256Bytes(
    Buffer.from(JSON.stringify(spec,null,2)+'\n','utf8'),
  );
  const manifestPath=join(manifestDir,'manifest.json');
  const digestPath=join(manifestDir,'manifest-digest.json');

  const replan=async()=>{
    const result=await planHsmeReuseEvidencePipeline({
      spec,
      specFileSha256,
      manifestPath,
      digestPath,
    });
    await writeFile(manifestPath,result.files.manifest);
    await writeFile(digestPath,result.files.digest);
    return result;
  };
  await replan();

  const resume=await planHsmeReusePipelineResume({
    manifestPath,
    digestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
  });
  assert.ok(resume.plan.readyStageIds.includes('assembly:candidate-a'));
  assert.ok(resume.plan.readyStageIds.includes('quality-pareto'));

  const resumePlanPath=join(controlDir,'resume-plan.json');
  const resumeDigestPath=join(controlDir,'resume-digest.json');
  await writeFile(resumePlanPath,resume.files.plan);
  await writeFile(resumeDigestPath,resume.files.digest);

  return {
    root,
    sourcePath,
    outputRoot,
    qualityOut,
    assemblyOut,
    receiptDir,
    controlDir,
    manifestPath,
    digestPath,
    resume,
    resumePlanPath,
    resumeDigestPath,
    replan,
  };
}

test('explicit stage executes exactly once while another ready stage remains untouched',async()=>{
  const fx=await fixture();
  const receiptPath=join(fx.receiptDir,'assembly.json');
  const summaryPath=join(fx.controlDir,'single-step-summary.json');

  const result=await executeHsmeReusePipelineSingleStep({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
    allowedOutputRoot:fx.outputRoot,
    receiptPath,
    summaryPath,
  });

  assert.equal(
    result.receipt.schemaVersion,
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
  );
  assert.equal(result.summary.requestedStageId,'assembly:candidate-a');
  assert.equal(result.summary.replanRequired,true);
  assert.equal(result.summary.automaticContinuationAllowed,false);
  assert.equal(result.summary.externalPinCreated,false);
  assert.equal(result.summary.semanticEvidenceAuthorityGranted,false);
  assert.equal(
    await fileExists(join(fx.assemblyOut,'hsme-reuse-candidate-assembly.json')),
    true,
  );
  assert.equal(
    await fileExists(join(fx.qualityOut,'hsme-foundation-quality-frontier.json')),
    false,
  );
  assert.equal(
    await fileExists(join(fx.qualityOut,'hsme-foundation-pareto-efficiency.json')),
    false,
  );
});

test('blocked or non-ready explicit stage cannot execute',async()=>{
  const fx=await fixture();
  await assert.rejects(
    ()=>executeHsmeReusePipelineSingleStep({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      resumePlanPath:fx.resumePlanPath,
      resumeDigestPath:fx.resumeDigestPath,
      receiptPaths:[],
      stageId:'outcome-materialization',
      repoRoot:process.cwd(),
      allowedOutputRoot:fx.outputRoot,
      receiptPath:join(fx.receiptDir,'blocked.json'),
      summaryPath:join(fx.controlDir,'blocked-summary.json'),
    }),
    error=>error.code==='hsme_reuse_single_step_stage_not_ready',
  );
});

test('stale supplied resume plan cannot execute after input byte drift',async()=>{
  const fx=await fixture();
  await writeFile(
    fx.sourcePath,
    Buffer.concat([await readFile(fx.sourcePath),Buffer.from(' ')]),
  );
  await fx.replan();

  await assert.rejects(
    ()=>executeHsmeReusePipelineSingleStep({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      resumePlanPath:fx.resumePlanPath,
      resumeDigestPath:fx.resumeDigestPath,
      receiptPaths:[],
      stageId:'assembly:candidate-a',
      repoRoot:process.cwd(),
      allowedOutputRoot:fx.outputRoot,
      receiptPath:join(fx.receiptDir,'stale.json'),
      summaryPath:join(fx.controlDir,'stale-summary.json'),
    }),
    error=>error.code==='hsme_reuse_single_step_resume_plan_stale',
  );
});

test('completed observed stage is not eligible for a second execution',async()=>{
  const fx=await fixture();
  const receiptPath=join(fx.receiptDir,'first.json');
  const summaryPath=join(fx.controlDir,'first-summary.json');
  await executeHsmeReusePipelineSingleStep({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
    allowedOutputRoot:fx.outputRoot,
    receiptPath,
    summaryPath,
  });

  await fx.replan();
  const completed=await planHsmeReusePipelineResume({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[receiptPath],
    repoRoot:process.cwd(),
  });
  const completedPlanPath=join(fx.controlDir,'completed-plan.json');
  const completedDigestPath=join(fx.controlDir,'completed-digest.json');
  await writeFile(completedPlanPath,completed.files.plan);
  await writeFile(completedDigestPath,completed.files.digest);

  const stage=completed.plan.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(stage.resumeState,'COMPLETED_OBSERVED');
  assert.equal(completed.plan.readyStageIds.includes(stage.stageId),false);

  await assert.rejects(
    ()=>executeHsmeReusePipelineSingleStep({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      resumePlanPath:completedPlanPath,
      resumeDigestPath:completedDigestPath,
      receiptPaths:[receiptPath],
      stageId:stage.stageId,
      repoRoot:process.cwd(),
      allowedOutputRoot:fx.outputRoot,
      receiptPath:join(fx.receiptDir,'second.json'),
      summaryPath:join(fx.controlDir,'second-summary.json'),
    }),
    error=>error.code==='hsme_reuse_single_step_stage_not_ready',
  );
});

test('single-step summary never grants continuation, pins, training or production authority',async()=>{
  const fx=await fixture();
  const result=await executeHsmeReusePipelineSingleStep({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    resumePlanPath:fx.resumePlanPath,
    resumeDigestPath:fx.resumeDigestPath,
    receiptPaths:[],
    stageId:'assembly:candidate-a',
    repoRoot:process.cwd(),
    allowedOutputRoot:fx.outputRoot,
    receiptPath:join(fx.receiptDir,'authority.json'),
    summaryPath:join(fx.controlDir,'authority-summary.json'),
  });

  assert.equal(result.summary.replanRequired,true);
  assert.equal(result.summary.automaticContinuationAllowed,false);
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
    assert.equal(result.summary[field],false,field);
  }
});

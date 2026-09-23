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
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA,
  HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
  executeHsmeReusePipelineStage,
} from '../scripts/run-hsme-reuse-pipeline-stage.mjs';
import {
  planHsmeReusePipelineResume,
} from '../scripts/plan-hsme-reuse-pipeline-resume.mjs';
import {
  domainDigest,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';

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
    rationale:['resume planner test keeps decision pending'],
    candidates:[
      placeholder('control-resume','CONTROL_BASELINE'),
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
      placeholder('adapt-resume','FROZEN_FOUNDATION_ADAPTATION'),
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

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-resume-'));
  const inputs=join(root,'inputs');
  const outputRoot=join(root,'out');
  const qualityOut=join(outputRoot,'quality');
  const assemblyOut=join(outputRoot,'assembly');
  const outcomeFreezeOut=join(outputRoot,'outcome-freeze');
  const outcomeOut=join(outputRoot,'outcome');
  const receiptDir=join(outputRoot,'receipts');
  const manifestDir=join(root,'manifest');
  await Promise.all([
    mkdir(inputs,{recursive:true}),
    mkdir(outputRoot,{recursive:true}),
    mkdir(qualityOut,{recursive:true}),
    mkdir(assemblyOut,{recursive:true}),
    mkdir(outcomeFreezeOut,{recursive:true}),
    mkdir(outcomeOut,{recursive:true}),
    mkdir(receiptDir,{recursive:true}),
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
    await writeJson(path,{scope:'resume-planner-only',name});
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
  const specBytes=Buffer.from(JSON.stringify(spec,null,2)+'\n','utf8');
  const specFileSha256=sha256Bytes(specBytes);
  const manifestPath=join(manifestDir,'manifest.json');
  const digestPath=join(manifestDir,'manifest-digest.json');

  const writePlan=async()=>{
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

  const initial=await writePlan();
  const stage=initial.manifest.stages.find(
    value=>value.kind==='CANDIDATE_ASSEMBLY',
  );
  assert.equal(stage.status,'READY');

  const receiptPath=join(receiptDir,'candidate-a.json');
  const receipt=await executeHsmeReusePipelineStage({
    manifestPath,
    digestPath,
    stageId:stage.stageId,
    allowedOutputRoot:outputRoot,
    receiptPath,
    repoRoot:process.cwd(),
    timeoutMs:60_000,
  });
  assert.equal(
    receipt.schemaVersion,
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V2_SCHEMA,
  );
  assert.equal(receipt.trackedTreeClean,true);
  assert.match(receipt.repositoryCommitSha,/^[0-9a-f]{40,64}$/);
  assert.match(receipt.stageScriptSha256,/^[0-9a-f]{64}$/);

  const current=await writePlan();
  return {
    root,
    sourcePath,
    outputRoot,
    assemblyOut,
    manifestPath,
    digestPath,
    receiptPath,
    receipt,
    current,
    writePlan,
  };
}

async function rewriteReceipt(path,mutate){
  const value=JSON.parse(await readFile(path,'utf8'));
  mutate(value);
  const payload={...value};
  delete payload.receiptSha256;
  value.receiptSha256=domainDigest(
    HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_DIGEST_DOMAIN,
    payload,
  );
  await writeFile(path,canonicalFileBytes(value));
}

test('real V2 receipt survives fresh re-plan as COMPLETED_OBSERVED',async()=>{
  const fx=await fixture();
  const resume=await planHsmeReusePipelineResume({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
    repoRoot:process.cwd(),
  });

  const stage=resume.plan.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(stage.resumeState,'COMPLETED_OBSERVED');
  assert.equal(stage.outputTrustState,'OBSERVED_NOT_PIN_AUTHORITY');
  assert.equal(stage.semanticEvidenceAuthorityGranted,false);
  assert.equal(resume.plan.verifiedReceipts.length,1);
  assert.equal(
    resume.plan.verifiedReceipts[0].receiptSha256,
    fx.receipt.receiptSha256,
  );
});

test('same stage outputs without a receipt are UNTRACKED_OUTPUTS',async()=>{
  const fx=await fixture();
  const resume=await planHsmeReusePipelineResume({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[],
    repoRoot:process.cwd(),
  });
  const stage=resume.plan.stages.find(
    value=>value.stageId==='assembly:candidate-a',
  );
  assert.equal(stage.resumeState,'UNTRACKED_OUTPUTS');
  assert.equal(resume.plan.pipelineResumeState,'BLOCKED_UNTRACKED_OUTPUTS');
});

test('one-byte output drift invalidates an otherwise valid receipt',async()=>{
  const fx=await fixture();
  const output=join(fx.assemblyOut,'hsme-reuse-candidate-assembly.json');
  await writeFile(
    output,
    Buffer.concat([await readFile(output),Buffer.from(' ')]),
  );
  await assert.rejects(
    ()=>planHsmeReusePipelineResume({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      receiptPaths:[fx.receiptPath],
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_resume_output_bytes_drift',
  );
});

test('input byte drift after execution invalidates receipt against fresh re-plan',async()=>{
  const fx=await fixture();
  await writeFile(
    fx.sourcePath,
    Buffer.concat([await readFile(fx.sourcePath),Buffer.from(' ')]),
  );
  await fx.writePlan();

  await assert.rejects(
    ()=>planHsmeReusePipelineResume({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      receiptPaths:[fx.receiptPath],
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_resume_stage_input_drift',
  );
});

test('forged repository commit remains invalid even with a recomputed receipt self-digest',async()=>{
  const fx=await fixture();
  await rewriteReceipt(fx.receiptPath,value=>{
    value.repositoryCommitSha='0'.repeat(40);
  });
  await assert.rejects(
    ()=>planHsmeReusePipelineResume({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      receiptPaths:[fx.receiptPath],
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_resume_repository_commit_drift',
  );
});

test('legacy V1 receipt is never accepted for resume',async()=>{
  const fx=await fixture();
  await rewriteReceipt(fx.receiptPath,value=>{
    value.schemaVersion=HSME_REUSE_PIPELINE_STAGE_EXECUTION_RECEIPT_V1_SCHEMA;
  });
  await assert.rejects(
    ()=>planHsmeReusePipelineResume({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      receiptPaths:[fx.receiptPath],
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_resume_receipt_schema_invalid',
  );
});

test('resume plan bytes are deterministic for exact manifest, receipt and repository state',async()=>{
  const fx=await fixture();
  const args={
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    receiptPaths:[fx.receiptPath],
    repoRoot:process.cwd(),
  };
  const first=await planHsmeReusePipelineResume(args);
  const second=await planHsmeReusePipelineResume(args);
  assert.deepEqual(first.files.plan,second.files.plan);
  assert.deepEqual(first.files.digest,second.files.digest);
  assert.equal(first.plan.plannerExecutesStages,false);
  assert.equal(first.plan.receiptsGrantSemanticTrust,false);
  assert.equal(first.plan.externalPinsAutoTrusted,false);
  assert.equal(first.plan.winnerSelectionAllowed,false);
  assert.equal(first.plan.productionAuthorityGranted,false);
});

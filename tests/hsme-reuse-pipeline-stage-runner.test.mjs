import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  mkdtemp,
  mkdir,
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
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
  HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
  HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
  canonicalFileBytes,
  domainDigest,
  planHsmeReuseEvidencePipeline,
  sha256Bytes,
} from '../scripts/plan-hsme-reuse-evidence-pipeline.mjs';
import {
  executeHsmeReusePipelineStage,
} from '../scripts/run-hsme-reuse-pipeline-stage.mjs';

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
    rationale:['bounded stage runner test keeps decision pending'],
    candidates:[
      placeholder('control-stage-runner','CONTROL_BASELINE'),
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
      placeholder('adapt-stage-runner','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function assemblyAuthority(){
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

async function writeManifestPair(manifest,digestPath,manifestPath){
  const manifestBytes=canonicalFileBytes(manifest);
  const digest={
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_V1_SCHEMA,
    specFileSha256:manifest.specFileSha256,
    manifestSha256:domainDigest(
      HSME_REUSE_EVIDENCE_PIPELINE_MANIFEST_DIGEST_DOMAIN,
      manifest,
    ),
    manifestFileSha256:sha256Bytes(manifestBytes),
    pipelineState:manifest.pipelineState,
    externalPinsAutoTrusted:false,
    plannerExecutesStages:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  };
  await writeFile(manifestPath,manifestBytes);
  await writeFile(digestPath,canonicalFileBytes(digest));
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hsme-stage-runner-'));
  const inputs=join(root,'inputs');
  const allowedOutputRoot=join(root,'out');
  const qualityOut=join(allowedOutputRoot,'quality');
  const assemblyOut=join(allowedOutputRoot,'assembly');
  const outcomeFreezeOut=join(allowedOutputRoot,'outcome-freeze');
  const outcomeOut=join(allowedOutputRoot,'outcome');
  const receiptDir=join(allowedOutputRoot,'receipts');
  const manifestDir=join(root,'manifest');
  await Promise.all([
    mkdir(inputs,{recursive:true}),
    mkdir(qualityOut,{recursive:true}),
    mkdir(assemblyOut,{recursive:true}),
    mkdir(outcomeFreezeOut,{recursive:true}),
    mkdir(outcomeOut,{recursive:true}),
    mkdir(receiptDir,{recursive:true}),
    mkdir(manifestDir,{recursive:true}),
  ]);

  const sourceDecisionPath=join(inputs,'source;decision.json');
  const sourceSha=await writeJson(sourceDecisionPath,sourceDecision());
  const campaignBytes=await readFile(campaignPath);
  const campaignSha=sha256Bytes(campaignBytes);
  const assemblyOriginPath=join(inputs,'assembly-origin-index.json');
  const assemblyOrigin={
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:CANDIDATE,
    sourceDecisionFileSha256:sourceSha,
    campaignFileSha256:campaignSha,
    proofs:[],
    ...assemblyAuthority(),
  };
  await writeJson(assemblyOriginPath,assemblyOrigin);
  const assemblyPin=candidateAssemblyOriginIndexDigest(assemblyOrigin);

  const dummy={scope:'planner-only'};
  const qualityInputs={};
  for(const name of [
    'trust','fixture-plan','fixture-pack','quality-rubric',
    'run-evidence','assessment-evidence','resource-evidence',
  ]){
    const path=join(inputs,name+'.json');
    await writeJson(path,{...dummy,name});
    qualityInputs[name]=path;
  }

  const assemblyPath=join(assemblyOut,'hsme-reuse-candidate-assembly.json');
  const frontierPath=join(qualityOut,'hsme-foundation-quality-frontier.json');
  const paretoPath=join(qualityOut,'hsme-foundation-pareto-efficiency.json');

  const spec={
    schemaVersion:HSME_REUSE_EVIDENCE_PIPELINE_SPEC_V1_SCHEMA,
    qualityPareto:{
      campaign:campaignPath,
      trust:qualityInputs['trust'],
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
      sourceDecision:sourceDecisionPath,
      campaign:campaignPath,
      proofs:[],
      originIndex:assemblyOriginPath,
      expectedOriginIndexSha256:assemblyPin,
      outputDir:assemblyOut,
    }],
    outcome:{
      sourceDecision:sourceDecisionPath,
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
  const manifestPath=join(manifestDir,'manifest.json');
  const digestPath=join(manifestDir,'manifest-digest.json');
  const planned=await planHsmeReuseEvidencePipeline({
    spec,
    specFileSha256:sha256Bytes(specBytes),
    manifestPath,
    digestPath,
  });
  await writeFile(manifestPath,planned.files.manifest);
  await writeFile(digestPath,planned.files.digest);

  const assemblyStage=planned.manifest.stages.find(
    stage=>stage.kind==='CANDIDATE_ASSEMBLY',
  );
  assert.equal(assemblyStage.status,'READY');
  assert.ok(assemblyStage.argv.includes(sourceDecisionPath));
  assert.ok(sourceDecisionPath.includes(';'));

  return {
    root,
    allowedOutputRoot,
    assemblyOut,
    receiptDir,
    manifestPath,
    digestPath,
    planned,
    stageId:assemblyStage.stageId,
  };
}

test('READY allowlisted stage executes with shell metacharacters as ordinary argv and receipt binds outputs',async()=>{
  const fx=await fixture();
  const receiptPath=join(fx.receiptDir,'assembly-receipt.json');
  const receipt=await executeHsmeReusePipelineStage({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    stageId:fx.stageId,
    allowedOutputRoot:fx.allowedOutputRoot,
    receiptPath,
    repoRoot:process.cwd(),
    timeoutMs:60_000,
  });

  assert.equal(receipt.executionState,'SUCCEEDED');
  assert.equal(receipt.stageKind,'CANDIDATE_ASSEMBLY');
  assert.equal(receipt.outputTrustState,'OBSERVED_NOT_PIN_AUTHORITY');
  assert.equal(receipt.externalPinCreated,false);
  assert.match(receipt.stageDefinitionSha256,/^[0-9a-f]{64}$/);
  assert.match(receipt.nodeResolutionHookSha256,/^[0-9a-f]{64}$/);
  assert.ok(receipt.inputs.length>=3);
  assert.ok(receipt.inputs.some(input=>input.path.includes('source;decision.json')));
  assert.ok(receipt.inputs.every(input=>/^[0-9a-f]{64}$/.test(input.fileSha256)));
  assert.equal(receipt.outputs.length,2);
  for(const output of receipt.outputs){
    const bytes=await readFile(output.path);
    assert.equal(output.fileSha256,sha256Bytes(bytes));
    assert.doesNotThrow(()=>JSON.parse(bytes.toString('utf8')));
  }
  const stored=JSON.parse(await readFile(receiptPath,'utf8'));
  assert.equal(stored.receiptSha256,receipt.receiptSha256);
});

test('non-READY downstream stage cannot execute',async()=>{
  const fx=await fixture();
  await assert.rejects(
    ()=>executeHsmeReusePipelineStage({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      stageId:'outcome-materialization',
      allowedOutputRoot:fx.allowedOutputRoot,
      receiptPath:join(fx.receiptDir,'blocked.json'),
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_stage_runner_stage_not_ready',
  );
});

test('internally re-digested manifest with tampered script is still rejected by hardcoded allowlist',async()=>{
  const fx=await fixture();
  const manifest=structuredClone(fx.planned.manifest);
  const stage=manifest.stages.find(value=>value.stageId===fx.stageId);
  stage.argv[1]='scripts/not-allowlisted.mjs';
  await writeManifestPair(manifest,fx.digestPath,fx.manifestPath);

  await assert.rejects(
    ()=>executeHsmeReusePipelineStage({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      stageId:fx.stageId,
      allowedOutputRoot:fx.allowedOutputRoot,
      receiptPath:join(fx.receiptDir,'tampered-script.json'),
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_stage_runner_stage_script_mismatch',
  );
});

test('internally re-digested manifest with tampered env is rejected',async()=>{
  const fx=await fixture();
  const manifest=structuredClone(fx.planned.manifest);
  const stage=manifest.stages.find(value=>value.stageId===fx.stageId);
  stage.env={HSME_REUSE_OUTCOME_MATERIALIZER_CLI:'1'};
  await writeManifestPair(manifest,fx.digestPath,fx.manifestPath);

  await assert.rejects(
    ()=>executeHsmeReusePipelineStage({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      stageId:fx.stageId,
      allowedOutputRoot:fx.allowedOutputRoot,
      receiptPath:join(fx.receiptDir,'tampered-env.json'),
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_stage_runner_stage_env_mismatch',
  );
});

test('tampered raw manifest bytes fail exact digest verification',async()=>{
  const fx=await fixture();
  await writeFile(
    fx.manifestPath,
    Buffer.concat([await readFile(fx.manifestPath),Buffer.from(' ')]),
  );
  await assert.rejects(
    ()=>executeHsmeReusePipelineStage({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      stageId:fx.stageId,
      allowedOutputRoot:fx.allowedOutputRoot,
      receiptPath:join(fx.receiptDir,'tampered-bytes.json'),
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_stage_runner_manifest_not_canonical',
  );
});

test('stage output root escape fails before execution',async()=>{
  const fx=await fixture();
  const narrowRoot=join(fx.allowedOutputRoot,'other');
  await mkdir(narrowRoot,{recursive:true});
  await assert.rejects(
    ()=>executeHsmeReusePipelineStage({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      stageId:fx.stageId,
      allowedOutputRoot:narrowRoot,
      receiptPath:join(narrowRoot,'receipt.json'),
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_stage_runner_output_root_escape',
  );
});

test('existing declared output fails before child execution',async()=>{
  const fx=await fixture();
  const output=join(fx.assemblyOut,'hsme-reuse-candidate-assembly.json');
  await writeJson(output,{stale:true});
  await assert.rejects(
    ()=>executeHsmeReusePipelineStage({
      manifestPath:fx.manifestPath,
      digestPath:fx.digestPath,
      stageId:fx.stageId,
      allowedOutputRoot:fx.allowedOutputRoot,
      receiptPath:join(fx.receiptDir,'existing-output.json'),
      repoRoot:process.cwd(),
    }),
    error=>error.code==='hsme_reuse_stage_runner_output_exists',
  );
});

test('execution receipt never grants trust, selection, training, install or production authority',async()=>{
  const fx=await fixture();
  const receipt=await executeHsmeReusePipelineStage({
    manifestPath:fx.manifestPath,
    digestPath:fx.digestPath,
    stageId:fx.stageId,
    allowedOutputRoot:fx.allowedOutputRoot,
    receiptPath:join(fx.receiptDir,'authority.json'),
    repoRoot:process.cwd(),
    timeoutMs:60_000,
  });
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
    assert.equal(receipt[field],false,field);
  }
});

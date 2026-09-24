import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA,
  coreHsmeDenseStudentExecutionResultV1Digest,
  runHsmeDenseStudentProtectedTrainingV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1_SCHEMA,
  coreHsmeDenseStudentRepresentationResultV1Digest,
  representHsmeDenseStudentCheckpointV1,
} from './HsmeDenseStudentRepresentationV1.ts';

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');

const BACKEND=Object.freeze({
  backendClass:'CUDA_GPU',
  providerId:'core-protected-gpu',
  accountId:'rnd-budget-account',
  executionEnvironmentId:'hsme-protected-training-v1',
});
const CEILINGS=Object.freeze({
  maxTrainingExamples:1_500_000,
  maxGpuSeconds:400_000,
  maxTrainingCostMicrousd:40_000_000,
});

function fixedArgv(values){
  return Object.freeze([
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    '--candidate-id',values.candidateId,
    '--request-evidence-sha256',values.requestEvidenceSha256,
    '--admission-evidence-sha256',values.admissionEvidenceSha256,
    '--teacher-decision-sha256',values.teacherDecisionSha256,
    '--reproduction-evidence-sha256',values.reproductionEvidenceSha256,
    '--corpus-root-digest',values.corpusRootDigest,
    '--recipe-digest',values.recipeDigest,
    '--checkpoint-sha256',values.checkpointSha256,
    '--resume-checkpoint-sha256',values.resumeCheckpointSha256,
    '--output-staging-authority-id',values.outputStagingAuthorityId,
    '--output-staging-policy-sha256',values.outputStagingPolicySha256,
    '--max-training-examples',String(CEILINGS.maxTrainingExamples),
    '--max-gpu-seconds',String(CEILINGS.maxGpuSeconds),
    '--max-training-cost-microusd',String(CEILINGS.maxTrainingCostMicrousd),
    '--target-step-count','4',
    '--active-parameters-millions','600',
    '--network-policy','SEALED_INPUTS_ONLY',
    '--cache-model-input-policy','READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  ]);
}

async function readyPreflight(){
  const values={
    requestEvidenceSha256:H('rep-run-request'),
    admissionEvidenceSha256:H('rep-core-admission'),
    toolchainManifestSha256:H('rep-toolchain'),
    candidateId:'bers-dense-core-v1-training-target',
    teacherDecisionSha256:H('rep-teacher-decision'),
    reproductionEvidenceSha256:H('rep-reproduction'),
    corpusRootDigest:H('rep-corpus-root'),
    recipeDigest:H('rep-recipe'),
    checkpointSha256:H('rep-input-checkpoint'),
    resumeCheckpointSha256:H('rep-resume-checkpoint'),
    outputStagingAuthorityId:'hsme-staging:training-candidate',
    outputStagingPolicySha256:H('rep-staging-policy'),
  };
  const launchBase={
    schemaVersion:HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
    state:'LAUNCH_SPEC_READY_NOT_EXECUTED',
    requestEvidenceSha256:values.requestEvidenceSha256,
    admissionEvidenceSha256:values.admissionEvidenceSha256,
    toolchainManifestSha256:values.toolchainManifestSha256,
    candidateId:values.candidateId,
    backend:BACKEND,
    repositoryCommitSha:'1'.repeat(40),
    interpreter:'python3.12',
    entrypointRelativePath:HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    entrypointFileSha256:H('rep-entrypoint'),
    dependencyLockRelativePath:HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
    dependencyLockFileSha256:H('rep-dependency-lock'),
    immutableEnvironmentSha256:H('rep-protected-environment'),
    acceleratorRuntimeIdentity:'cuda-runtime:13.0-driver:580.95',
    teacherDecisionSha256:values.teacherDecisionSha256,
    reproductionEvidenceSha256:values.reproductionEvidenceSha256,
    corpusRootDigest:values.corpusRootDigest,
    recipeDigest:values.recipeDigest,
    checkpointSha256:values.checkpointSha256,
    resumeCheckpointSha256:values.resumeCheckpointSha256,
    outputStagingAuthorityId:values.outputStagingAuthorityId,
    outputStagingPolicySha256:values.outputStagingPolicySha256,
    resourceCeilings:CEILINGS,
    targetStepCount:4,
    activeParametersMillions:600,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    argv:fixedArgv(values),
    processSpawned:false,
    trainingStarted:false,
    checkpointWritten:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    winnerSelectionAllowed:false,
    launchSpecSha256:H('rep-placeholder-launch'),
  };
  const launchSpecSha256=await hsmeDenseStudentLaunchSpecV1Digest(
    launchBase,hashPort,
  );
  const launchSpec=Object.freeze({...launchBase,launchSpecSha256});
  const preflightBase={
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state:'TRAINING_PREFLIGHT_READY_NOT_EXECUTED',
    blockers:Object.freeze([]),
    requestEvidenceSha256:values.requestEvidenceSha256,
    admissionEvidenceSha256:values.admissionEvidenceSha256,
    toolchainManifestSha256:values.toolchainManifestSha256,
    launchSpecSha256,
    launchSpec,
    preflightEvidenceSha256:H('rep-placeholder-preflight'),
    processSpawned:false,
    trainingStarted:false,
    checkpointWritten:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    winnerSelectionAllowed:false,
  };
  const preflightEvidenceSha256=await hsmeDenseStudentTrainingPreflightV1Digest(
    preflightBase,hashPort,
  );
  return Object.freeze({...preflightBase,preflightEvidenceSha256});
}

async function executionResult(preflight){
  const launch=preflight.launchSpec;
  const base={
    schemaVersion:CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA,
    state:'EXECUTION_ATTEMPT_PROCESS_COMPLETED',
    launchSpecSha256:launch.launchSpecSha256,
    executionAttemptId:'hsme-run-attempt:representation-0001',
    backend:launch.backend,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    startedAtMs:4_000_000,
    finishedAtMs:4_120_000,
    exitCode:0,
    processSpawned:true,
    trainingStarted:true,
    consumedTrainingExamples:1_000_000,
    consumedGpuSeconds:120_000,
    consumedTrainingCostMicrousd:25_000_000,
    stdoutEvidenceSha256:H('rep-training-stdout'),
    stderrEvidenceSha256:H('rep-training-stderr'),
    stagedCheckpoint:{
      checkpointSha256:H('rep-staged-checkpoint'),
      checkpointBytes:850_000_000,
      checkpointMetadataSha256:H('rep-checkpoint-metadata'),
      teacherDecisionSha256:launch.teacherDecisionSha256,
      reproductionEvidenceSha256:launch.reproductionEvidenceSha256,
      corpusRootDigest:launch.corpusRootDigest,
      recipeDigest:launch.recipeDigest,
      inputCheckpointSha256:launch.checkpointSha256,
      resumeCheckpointSha256:launch.resumeCheckpointSha256,
      outputStagingAuthorityId:launch.outputStagingAuthorityId,
      outputStagingPolicySha256:launch.outputStagingPolicySha256,
    },
    runnerResultSha256:H('rep-placeholder-runner'),
  };
  const runnerResultSha256=await coreHsmeDenseStudentExecutionResultV1Digest(
    base,hashPort,
  );
  return Object.freeze({...base,runnerResultSha256});
}

async function completedReceipt(preflight){
  const result=await executionResult(preflight);
  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    {async executeExactTrainingLaunch(){return result;}},
    {async verifyExecutionResult(value,expected){
      return value.runnerResultSha256===result.runnerResultSha256
        &&expected===result.runnerResultSha256;
    }},
    hashPort,
  );
  assert.equal(
    receipt.state,
    'TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED',
    JSON.stringify(receipt),
  );
  return receipt;
}

async function representationResult(request,{
  resource=true,
  state='REPRESENTATION_EXPORT_ATTEMPT_COMPLETED',
  artifactOverrides={},
  resultOverrides={},
  raw=false,
}={}){
  const artifact=state==='REPRESENTATION_EXPORT_ATTEMPT_COMPLETED'
    ?{
      representationArtifactSha256:H('dense-representation-artifact'),
      representationBytes:780_000_000,
      representationMetadataSha256:H('dense-representation-metadata'),
      components:{
        modelConfigSha256:H('dense-model-config'),
        tokenizerSha256:H('dense-tokenizer'),
        textConditionerSha256:H('dense-text-conditioner'),
        imageEncoderSha256:'NONE',
        vaeSha256:H('dense-vae'),
        schedulerConfigSha256:H('dense-scheduler'),
      },
      exportToolchainSha256:H('dense-export-toolchain'),
      resourceEvidence:resource?{
        peakMemoryBytes:1_100_000_000,
        maxResidentBytes:900_000_000,
        maxPrefetchBytes:200_000_000,
        resourceEvidenceSha256:H('dense-representation-resource'),
      }:null,
      ...artifactOverrides,
    }
    :null;
  const base={
    schemaVersion:CORE_HSME_DENSE_STUDENT_REPRESENTATION_RESULT_V1_SCHEMA,
    state,
    receiptEvidenceSha256:request.receiptEvidenceSha256,
    preflightEvidenceSha256:request.preflightEvidenceSha256,
    launchSpecSha256:request.launchSpecSha256,
    checkpointSha256:request.checkpointSha256,
    checkpointMetadataSha256:request.checkpointMetadataSha256,
    exportAttemptId:'hsme-export-attempt:0001',
    exportSpec:request.exportSpec,
    networkPolicy:request.networkPolicy,
    cacheModelInputPolicy:request.cacheModelInputPolicy,
    stdoutEvidenceSha256:H('dense-export-stdout'),
    stderrEvidenceSha256:H('dense-export-stderr'),
    artifact,
    exporterResultSha256:H('dense-placeholder-export-result'),
    ...resultOverrides,
  };
  if(raw)return Object.freeze(base);
  const exporterResultSha256=await coreHsmeDenseStudentRepresentationResultV1Digest(
    base,hashPort,
  );
  return Object.freeze({...base,exporterResultSha256});
}

function fakeExporter(factory){
  const calls=[];
  return {
    calls,
    async exportExactDenseStudentRepresentation(request){
      calls.push(structuredClone(request));
      return factory(request);
    },
  };
}

function trustedOrigin(){
  return {
    calls:0,
    async verifyRepresentationResult(result,expected){
      this.calls+=1;
      return result.exporterResultSha256===expected;
    },
  };
}

test('completed receipt exports deterministic READY_NOT_ADMITTED representation and HSME pack candidate',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const exporter=fakeExporter(request=>representationResult(request));
  const origin=trustedOrigin();
  const evidence=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter,origin,hashPort,
  );

  assert.equal(evidence.state,'REPRESENTATION_READY_NOT_ADMITTED');
  assert.deepEqual(evidence.blockers,[]);
  assert.equal(exporter.calls.length,1);
  assert.equal(origin.calls,1);
  assert.equal(
    evidence.representationArtifactSha256,
    H('dense-representation-artifact'),
  );
  assert.equal(evidence.representationBytes,780_000_000);
  assert.equal(evidence.architectureFamily,'COMPACT_DIT');
  assert.equal(evidence.activeParametersMillions,600);
  assert.equal(evidence.targetStepCount,4);
  assert.equal(evidence.packCandidateState,'PACK_CANDIDATE_READY_NOT_ADMITTED');
  assert.ok(evidence.packDescriptor);
  assert.equal(evidence.packDescriptor.schemaVersion,'BERS_HSME_PACK_V1');
  assert.equal(evidence.packDescriptor.roots.length,1);
  assert.equal(evidence.packDescriptor.roots[0].role,'BASE');
  assert.equal(
    evidence.packDescriptor.roots[0].sha256,
    evidence.representationArtifactSha256,
  );
  assert.equal(evidence.packDescriptor.routing.mode,'SHARED_ONLY');
  assert.equal(evidence.packDescriptor.routing.maxActiveExperts,0);
  assert.match(evidence.packDescriptorSha256,/^[0-9a-f]{64}$/);
  assert.match(evidence.evidenceSha256,/^[0-9a-f]{64}$/);
});

test('protected export adapter receives only exact staged identity and fixed export spec',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const exporter=fakeExporter(request=>representationResult(request));
  await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter,trustedOrigin(),hashPort,
  );
  const request=exporter.calls[0];
  assert.equal(request.candidateId,preflight.launchSpec.candidateId);
  assert.equal(request.repositoryCommitSha,preflight.launchSpec.repositoryCommitSha);
  assert.equal(
    request.immutableEnvironmentSha256,
    preflight.launchSpec.immutableEnvironmentSha256,
  );
  assert.equal(request.checkpointSha256,receipt.stagedCheckpointSha256);
  assert.equal(request.checkpointBytes,receipt.stagedCheckpointBytes);
  assert.equal(request.checkpointMetadataSha256,receipt.checkpointMetadataSha256);
  assert.deepEqual(request.exportSpec,{
    format:'BERS_DENSE_STUDENT_SAFETENSORS_BUNDLE_V1',
    formatVersion:'1',
    precision:'BF16',
    architectureFamily:'COMPACT_DIT',
    checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
  });
  assert.equal(request.networkPolicy,'SEALED_INPUTS_ONLY');
  assert.equal(
    request.cacheModelInputPolicy,
    'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  );
  for(const forbidden of [
    'checkpointUri','modelUri','executable','argv','shell','environment',
    'fleet','install','activate','promote',
  ]){
    assert.equal(Object.hasOwn(request,forbidden),false,forbidden);
  }
});

test('receipt or preflight tamper fails before protected exporter call',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  for(const [kind,badReceipt,badPreflight] of [
    [
      'receipt',
      {...receipt,recipeDigest:H('tampered-receipt-recipe')},
      preflight,
    ],
    [
      'preflight',
      receipt,
      {
        ...preflight,
        launchSpec:{
          ...preflight.launchSpec,
          candidateId:'tampered-candidate',
        },
      },
    ],
  ]){
    const exporter=fakeExporter(()=>{throw new Error('must not run');});
    const evidence=await representHsmeDenseStudentCheckpointV1(
      badReceipt,badPreflight,exporter,trustedOrigin(),hashPort,
    );
    assert.equal(evidence.state,'REPRESENTATION_INVALID',kind);
    assert.equal(exporter.calls.length,0,kind);
  }
});

test('unverified or rebound exporter result fails closed',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);

  const exporter1=fakeExporter(request=>representationResult(request));
  const unverified=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter1,
    {async verifyRepresentationResult(){return false;}},
    hashPort,
  );
  assert.equal(unverified.state,'REPRESENTATION_INVALID');
  assert.ok(
    unverified.blockers.includes('REPRESENTATION_EXPORT_RESULT_ORIGIN_UNVERIFIED'),
  );

  const exporter2=fakeExporter(request=>representationResult(request,{
    resultOverrides:{checkpointSha256:H('different-checkpoint')},
  }));
  const rebound=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter2,trustedOrigin(),hashPort,
  );
  assert.equal(rebound.state,'REPRESENTATION_INVALID');
  assert.ok(
    rebound.blockers.includes('REPRESENTATION_RESULT_CHECKPOINT_BINDING_MISMATCH'),
  );
});

test('missing resource evidence keeps representation ready but blocks HSME pack candidate',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const exporter=fakeExporter(request=>representationResult(request,{resource:false}));
  const evidence=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter,trustedOrigin(),hashPort,
  );
  assert.equal(evidence.state,'REPRESENTATION_READY_NOT_ADMITTED');
  assert.equal(
    evidence.packCandidateState,
    'PACK_CANDIDATE_BLOCKED_RESOURCE_EVIDENCE_REQUIRED',
  );
  assert.equal(evidence.packDescriptor,null);
  assert.equal(evidence.packDescriptorSha256,'UNKNOWN');
});

test('invalid resource bounds are rejected instead of inventing HSME pack budgets',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const exporter=fakeExporter(request=>representationResult(request,{
    artifactOverrides:{
      resourceEvidence:{
        peakMemoryBytes:100,
        maxResidentBytes:101,
        maxPrefetchBytes:0,
        resourceEvidenceSha256:H('invalid-resource-bounds'),
      },
    },
    raw:true,
  }));
  const evidence=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter,trustedOrigin(),hashPort,
  );
  assert.equal(evidence.state,'REPRESENTATION_INVALID');
  assert.ok(
    evidence.blockers.some(value=>
      value.includes('hsme_representation_resource_bounds')
    ),
  );
});

test('failed export remains EXPORT_FAILED and creates no pack identity',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const exporter=fakeExporter(request=>representationResult(request,{
    state:'REPRESENTATION_EXPORT_ATTEMPT_FAILED',
  }));
  const evidence=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter,trustedOrigin(),hashPort,
  );
  assert.equal(evidence.state,'REPRESENTATION_EXPORT_FAILED');
  assert.equal(evidence.representationArtifactSha256,'UNKNOWN');
  assert.equal(evidence.packCandidateState,'PACK_CANDIDATE_UNAVAILABLE');
  assert.equal(evidence.packDescriptor,null);
});

test('identical protected export result produces byte-identical evidence',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const resultRequest=[];
  const exporter=fakeExporter(async request=>{
    resultRequest.push(request);
    return representationResult(request);
  });
  const first=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,exporter,trustedOrigin(),hashPort,
  );
  const second=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,
    fakeExporter(request=>representationResult(request)),
    trustedOrigin(),
    hashPort,
  );
  assert.deepEqual(first,second);
  assert.equal(first.evidenceSha256,second.evidenceSha256);
});

test('representation evidence never grants checkpoint, fleet, provider or production authority',async()=>{
  const preflight=await readyPreflight();
  const receipt=await completedReceipt(preflight);
  const evidence=await representHsmeDenseStudentCheckpointV1(
    receipt,preflight,
    fakeExporter(request=>representationResult(request)),
    trustedOrigin(),
    hashPort,
  );
  for(const field of [
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    assert.equal(evidence[field],false,field);
  }
});

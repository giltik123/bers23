import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  hsmeDenseStudentRepresentationEvidenceV1Digest,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1_SCHEMA,
  HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA,
  coreHsmeDenseStudentStepMatrixResultV1Digest,
  hsmeDenseStudentBenchmarkBindingV1Digest,
  normalizeHsmeDenseStudentBenchmarkBindingV1,
  proveHsmeDenseStudentStepMatrixV1,
} from './HsmeDenseStudentStepMatrixV1.ts';

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');

async function representation(){
  const base={
    schemaVersion:'BERS_HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1',
    state:'REPRESENTATION_READY_NOT_ADMITTED',
    blockers:Object.freeze([]),
    receiptEvidenceSha256:H('matrix-receipt'),
    preflightEvidenceSha256:H('matrix-preflight'),
    launchSpecSha256:H('matrix-launch'),
    candidateId:'bers-dense-core-v1-training-target',
    architectureFamily:'COMPACT_DIT',
    activeParametersMillions:600,
    targetStepCount:4,
    repositoryCommitSha:'2'.repeat(40),
    immutableEnvironmentSha256:H('matrix-environment'),
    stagedCheckpointSha256:H('matrix-checkpoint'),
    stagedCheckpointBytes:850_000_000,
    checkpointMetadataSha256:H('matrix-checkpoint-metadata'),
    teacherDecisionSha256:H('matrix-teacher'),
    reproductionEvidenceSha256:H('matrix-reproduction'),
    corpusRootDigest:H('matrix-corpus'),
    recipeDigest:H('matrix-recipe'),
    inputCheckpointSha256:H('matrix-input-checkpoint'),
    resumeCheckpointSha256:H('matrix-resume-checkpoint'),
    exportAttemptId:'hsme-export-attempt:matrix-0001',
    exportSpec:{
      format:'BERS_DENSE_STUDENT_SAFETENSORS_BUNDLE_V1',
      formatVersion:'1',
      precision:'BF16',
      architectureFamily:'COMPACT_DIT',
      checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
    },
    representationArtifactSha256:H('matrix-representation'),
    representationBytes:780_000_000,
    representationMetadataSha256:H('matrix-representation-metadata'),
    components:{
      modelConfigSha256:H('matrix-config'),
      tokenizerSha256:H('matrix-tokenizer'),
      textConditionerSha256:H('matrix-text-conditioner'),
      imageEncoderSha256:'NONE',
      vaeSha256:H('matrix-vae'),
      schedulerConfigSha256:H('matrix-scheduler'),
    },
    exportToolchainSha256:H('matrix-export-toolchain'),
    resourceEvidence:null,
    exporterResultSha256:H('matrix-export-result'),
    packCandidateState:'PACK_CANDIDATE_BLOCKED_RESOURCE_EVIDENCE_REQUIRED',
    packDescriptor:null,
    packDescriptorSha256:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const evidenceSha256=await hsmeDenseStudentRepresentationEvidenceV1Digest(
    base,hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

function rawBinding(){
  return {
    schemaVersion:HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA,
    fixturePlanSha256:H('dense-fixture-plan'),
    fixtureSetSha256:H('dense-fixture-set'),
    blindedReviewRubricSha256:H('dense-review-rubric'),
    deterministicSeedContractSha256:H('dense-seed-contract'),
    requiredStepCounts:[2,4,6,8],
    capabilities:[
      {
        capability:'TEXT_TO_IMAGE',
        dimensionIds:['semantic-adherence','anatomy-artifact-failure'],
      },
      {
        capability:'IMAGE_EDITING',
        dimensionIds:[
          'identity-preservation',
          'garment-logo-pattern-preservation',
          'anatomy-artifact-failure',
        ],
      },
    ],
    postObservationMutationAllowed:false,
    scheduleSelectionAllowed:false,
    candidateSelectionAllowed:false,
    winnerSelectionAllowed:false,
  };
}

async function bindingFixture(){
  const binding=normalizeHsmeDenseStudentBenchmarkBindingV1(rawBinding());
  const digest=await hsmeDenseStudentBenchmarkBindingV1Digest(binding,hashPort);
  return {binding,digest};
}

function rowsFor(binding,representationValue){
  const rows=[];
  for(const capabilityBinding of binding.capabilities){
    for(const stepCount of [2,4,6,8]){
      const capability=capabilityBinding.capability;
      rows.push({
        stepCount,
        capability,
        outputSetSha256:H('output|'+capability+'|'+stepCount),
        sampleCount:10,
        successCount:10,
        failureCount:0,
        criticalFailureCount:0,
        qualityDimensions:capabilityBinding.dimensionIds.map(dimensionId=>({
          dimensionId,
          lossMicrounits:10_000+stepCount,
          criticalFailureObserved:false,
          evidenceSha256:H(
            'quality|'+capability+'|'+stepCount+'|'+dimensionId,
          ),
        })),
        coldEndToEndLatencyMicros:1_000_000+stepCount*100_000,
        warmEndToEndLatencyMicros:800_000+stepCount*80_000,
        perStepLatencyMicros:150_000,
        peakRamBytes:1_200_000_000,
        peakAcceleratorBytes:900_000_000,
        activeRepresentationBytes:700_000_000,
        residentRepresentationBytes:820_000_000,
        flashBytesMovedPerRun:300_000_000,
        hardwareProfileSha256:H('shared-hardware-profile'),
        runtimeIdentity:'cuda:13.0',
        providerIdentity:'core-protected-gpu',
        measurementMethodSha256:H('shared-measurement-method'),
        measurementEvidenceSha256:H(
          'measurement|'+capability+'|'+stepCount,
        ),
      });
    }
  }
  return rows;
}

async function matrixResult(request,binding,{
  state='STEP_MATRIX_MEASUREMENT_COMPLETED',
  transformRows=rows=>rows,
  overrides={},
  raw=false,
}={}){
  const representationValue=await representation();
  const rows=state==='STEP_MATRIX_MEASUREMENT_COMPLETED'
    ?transformRows(rowsFor(binding,representationValue))
    :[];
  const base={
    schemaVersion:CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1_SCHEMA,
    state,
    representationEvidenceSha256:request.representationEvidenceSha256,
    representationArtifactSha256:request.representationArtifactSha256,
    benchmarkBindingSha256:request.benchmarkBindingSha256,
    rows,
    stdoutEvidenceSha256:H('matrix-stdout'),
    stderrEvidenceSha256:H('matrix-stderr'),
    benchmarkAttemptId:'hsme-step-matrix:0001',
    benchmarkResultSha256:H('placeholder-matrix-result'),
    ...overrides,
  };
  if(raw)return Object.freeze(base);
  const benchmarkResultSha256=await coreHsmeDenseStudentStepMatrixResultV1Digest(
    base,binding,request,hashPort,
  );
  return Object.freeze({...base,benchmarkResultSha256});
}

function fakeBenchmarker(factory){
  const calls=[];
  return {
    calls,
    async measureExactDenseStudentStepMatrix(request){
      calls.push(structuredClone(request));
      return factory(request);
    },
  };
}

function trustedBindingOrigin(){
  return {
    calls:0,
    async verifyBenchmarkBinding(binding,expected){
      this.calls+=1;
      return /^[0-9a-f]{64}$/.test(expected)
        &&binding.schemaVersion===HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA;
    },
  };
}

function trustedResultOrigin(){
  return {
    calls:0,
    async verifyStepMatrixResult(result,expected){
      this.calls+=1;
      return result.benchmarkResultSha256===expected;
    },
  };
}

test('exact representation and trusted binding yield complete 2/4/6/8 READY_NOT_SELECTED matrix',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();
  const benchmarker=fakeBenchmarker(
    request=>matrixResult(request,binding),
  );
  const bindingOrigin=trustedBindingOrigin();
  const resultOrigin=trustedResultOrigin();
  const evidence=await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,bindingOrigin,benchmarker,resultOrigin,hashPort,
  );

  assert.equal(evidence.state,'STEP_MATRIX_READY_NOT_SELECTED');
  assert.deepEqual(evidence.blockers,[]);
  assert.equal(evidence.rows.length,8);
  assert.deepEqual(
    [...new Set(evidence.rows.map(row=>row.stepCount))],
    [2,4,6,8],
  );
  assert.deepEqual(
    [...new Set(evidence.rows.map(row=>row.capability))],
    ['IMAGE_EDITING','TEXT_TO_IMAGE'],
  );
  assert.equal(bindingOrigin.calls,1);
  assert.equal(resultOrigin.calls,1);
  assert.equal(benchmarker.calls.length,1);
  assert.match(evidence.evidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(evidence.weightedAggregateScoreAllowed,false);
  assert.equal(evidence.scheduleSelectionAllowed,false);
  assert.equal(evidence.candidateSelectionAllowed,false);
});

test('protected benchmark request contains fixed schedule and no provider/model acquisition override',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();
  const benchmarker=fakeBenchmarker(
    request=>matrixResult(request,binding),
  );
  await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,trustedBindingOrigin(),benchmarker,
    trustedResultOrigin(),hashPort,
  );
  const request=benchmarker.calls[0];
  assert.deepEqual(request.benchmarkBinding.requiredStepCounts,[2,4,6,8]);
  assert.equal(request.networkPolicy,'SEALED_INPUTS_ONLY');
  assert.equal(request.modelAcquisitionAllowed,false);
  assert.equal(request.providerSelectionAllowed,false);
  assert.equal(request.scheduleSelectionAllowed,false);
  for(const key of [
    'modelUri','checkpointUri','providerId','hardwareProfile','runtime',
    'executable','argv','shell','environment','install','promote',
  ]){
    assert.equal(Object.hasOwn(request,key),false,key);
  }
});

test('representation tamper fails before benchmark adapter call',async()=>{
  const rep=await representation();
  const tampered={
    ...rep,
    representationArtifactSha256:H('tampered-representation'),
  };
  const {binding,digest}=await bindingFixture();
  const benchmarker=fakeBenchmarker(()=>{throw new Error('must not run');});
  const evidence=await proveHsmeDenseStudentStepMatrixV1(
    tampered,binding,digest,trustedBindingOrigin(),benchmarker,
    trustedResultOrigin(),hashPort,
  );
  assert.equal(evidence.state,'STEP_MATRIX_INVALID');
  assert.ok(evidence.blockers.includes('STEP_MATRIX_REPRESENTATION_REHASH_MISMATCH'));
  assert.equal(benchmarker.calls.length,0);
});

test('binding digest or origin drift fails before benchmark adapter call',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();

  let benchmarker=fakeBenchmarker(()=>{throw new Error('must not run');});
  let evidence=await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,H('wrong-binding'),trustedBindingOrigin(),benchmarker,
    trustedResultOrigin(),hashPort,
  );
  assert.equal(evidence.state,'STEP_MATRIX_INVALID');
  assert.ok(evidence.blockers.includes('STEP_MATRIX_BINDING_REHASH_MISMATCH'));
  assert.equal(benchmarker.calls.length,0);

  benchmarker=fakeBenchmarker(()=>{throw new Error('must not run');});
  evidence=await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,
    {async verifyBenchmarkBinding(){return false;}},
    benchmarker,trustedResultOrigin(),hashPort,
  );
  assert.equal(evidence.state,'STEP_MATRIX_INVALID');
  assert.ok(evidence.blockers.includes('STEP_MATRIX_BINDING_ORIGIN_UNVERIFIED'));
  assert.equal(benchmarker.calls.length,0);
});

test('missing or duplicate schedule row fails canonical matrix roster',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();

  for(const transformRows of [
    rows=>rows.slice(1),
    rows=>[...rows.slice(0,7),rows[0]],
  ]){
    const benchmarker=fakeBenchmarker(
      request=>matrixResult(request,binding,{transformRows,raw:true}),
    );
    const evidence=await proveHsmeDenseStudentStepMatrixV1(
      rep,binding,digest,trustedBindingOrigin(),benchmarker,
      trustedResultOrigin(),hashPort,
    );
    assert.equal(evidence.state,'STEP_MATRIX_INVALID');
    assert.ok(
      evidence.blockers.some(value=>
        value.includes('hsme_step_matrix_result_roster')
      ),
    );
  }
});

test('quality dimension set drift fails instead of inventing aggregate quality score',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();
  const benchmarker=fakeBenchmarker(
    request=>matrixResult(request,binding,{
      transformRows(rows){
        const changed=structuredClone(rows);
        changed[0].qualityDimensions.pop();
        return changed;
      },
      raw:true,
    }),
  );
  const evidence=await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,trustedBindingOrigin(),benchmarker,
    trustedResultOrigin(),hashPort,
  );
  assert.equal(evidence.state,'STEP_MATRIX_INVALID');
  assert.ok(
    evidence.blockers.some(value=>
      value.includes('hsme_step_matrix_row_dimensions')
    ),
  );
  assert.equal(Object.hasOwn(evidence,'weightedScore'),false);
});

test('hardware or measurement-method drift across schedules fails comparability',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();
  for(const [field,value,code] of [
    ['hardwareProfileSha256',H('different-hardware'),'hsme_step_matrix_hardware_drift'],
    ['measurementMethodSha256',H('different-method'),'hsme_step_matrix_method_drift'],
  ]){
    const benchmarker=fakeBenchmarker(
      request=>matrixResult(request,binding,{
        transformRows(rows){
          const changed=structuredClone(rows);
          changed[1][field]=value;
          return changed;
        },
        raw:true,
      }),
    );
    const evidence=await proveHsmeDenseStudentStepMatrixV1(
      rep,binding,digest,trustedBindingOrigin(),benchmarker,
      trustedResultOrigin(),hashPort,
    );
    assert.equal(evidence.state,'STEP_MATRIX_INVALID',field);
    assert.ok(evidence.blockers.some(item=>item.includes(code)),field);
  }
});

test('unverified result origin and explicit measurement failure remain non-selecting',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();

  let benchmarker=fakeBenchmarker(request=>matrixResult(request,binding));
  let evidence=await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,trustedBindingOrigin(),benchmarker,
    {async verifyStepMatrixResult(){return false;}},
    hashPort,
  );
  assert.equal(evidence.state,'STEP_MATRIX_INVALID');
  assert.ok(evidence.blockers.includes('STEP_MATRIX_RESULT_ORIGIN_UNVERIFIED'));

  benchmarker=fakeBenchmarker(
    request=>matrixResult(request,binding,{
      state:'STEP_MATRIX_MEASUREMENT_FAILED',
    }),
  );
  evidence=await proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,trustedBindingOrigin(),benchmarker,
    trustedResultOrigin(),hashPort,
  );
  assert.equal(evidence.state,'STEP_MATRIX_MEASUREMENT_FAILED');
  assert.equal(evidence.rows.length,0);
  assert.equal(evidence.scheduleSelectionAllowed,false);
  assert.equal(evidence.winnerSelectionAllowed,false);
});

test('identical result produces byte-identical matrix evidence and no promotion authority',async()=>{
  const rep=await representation();
  const {binding,digest}=await bindingFixture();
  const make=()=>proveHsmeDenseStudentStepMatrixV1(
    rep,binding,digest,trustedBindingOrigin(),
    fakeBenchmarker(request=>matrixResult(request,binding)),
    trustedResultOrigin(),hashPort,
  );
  const first=await make();
  const second=await make();
  assert.deepEqual(first,second);
  for(const field of [
    'weightedAggregateScoreAllowed',
    'efficiencyMayOverrideQualityFailure',
    'scheduleSelectionAllowed',
    'candidateSelectionAllowed',
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
    assert.equal(first[field],false,field);
  }
});

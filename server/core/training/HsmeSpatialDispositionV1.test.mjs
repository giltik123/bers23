import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA,
  hsmeSpatialExecutionMatrixV1Digest,
} from './HsmeSpatialExecutionMatrixV1.ts';
import {
  HSME_SPATIAL_DISPOSITION_POLICY_V1_SCHEMA,
  decideHsmeSpatialDispositionV1,
  hsmeSpatialDispositionPolicyV1Digest,
  hsmeSpatialDispositionV1Digest,
} from './HsmeSpatialDispositionV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    selectionAllowed:false,
    spatialExecutionAllowed:false,
    spatialMapMutationAllowed:false,
    inferenceExecutionAllowed:false,
    fashionGeometryAuthorityGranted:false,
    projectMutationAllowed:false,
    artifactAuthorityGranted:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function quality(overrides={}){
  const values={
    ANATOMY_ARTIFACT:9800,
    GARMENT_LOGO_PATTERN:9700,
    IDENTITY_PERSON:9750,
    NON_TARGET_PRESERVATION:9650,
    SEMANTIC_ADHERENCE:9600,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    valueBps:values[dimension],
  }));
}

function hard(overrides={}){
  const values={
    ANATOMY_ARTIFACT:0,
    GARMENT_LOGO_PATTERN:0,
    IDENTITY_PERSON:0,
    NON_TARGET_PRESERVATION:0,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    failureCount:values[dimension],
  }));
}

function row(variant,patch={}){
  const values={
    FULL_SPATIAL_CONTROL:{
      implementationSha256:h('1'),
      mapReplayIdentitySha256:h('2'),
      wallClockUs:1_000_000,
      fullComputeTokenWork:1024,
      cheapPathTokenWork:0,
      prunedTokenWork:0,
      activeWeightsBytes:700_000_000,
      peakMemoryBytes:1_000_000_000,
      flashBytesMoved:500_000_000,
      ramBytesMoved:600_000_000,
      acceleratorBytesMoved:400_000_000,
    },
    PROTECTED_REGION_CHEAP_BACKGROUND:{
      implementationSha256:h('3'),
      mapReplayIdentitySha256:h('4'),
      wallClockUs:800_000,
      fullComputeTokenWork:768,
      cheapPathTokenWork:256,
      prunedTokenWork:0,
      activeWeightsBytes:680_000_000,
      peakMemoryBytes:950_000_000,
      flashBytesMoved:400_000_000,
      ramBytesMoved:500_000_000,
      acceleratorBytesMoved:300_000_000,
    },
    BOUNDED_BACKGROUND_PRUNING:{
      implementationSha256:h('5'),
      mapReplayIdentitySha256:h('6'),
      wallClockUs:760_000,
      fullComputeTokenWork:900,
      cheapPathTokenWork:0,
      prunedTokenWork:124,
      activeWeightsBytes:670_000_000,
      peakMemoryBytes:930_000_000,
      flashBytesMoved:380_000_000,
      ramBytesMoved:470_000_000,
      acceleratorBytesMoved:290_000_000,
    },
  }[variant];
  return {
    variant,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    networkBytesDuringExecution:0,
    realTargetDeviceMeasurement:true,
    ...values,
    ...patch,
  };
}

async function matrix(overrides={}){
  const base={
    schemaVersion:HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA,
    state:'SPATIAL_EXECUTION_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    experimentPlanSha256:h('7'),
    computeMapRosterSha256:h('8'),
    campaignPolicySha256:h('9'),
    hostResultSha256:h('a'),
    executionAttemptId:'synthetic-spatial-attempt-001',
    prototypeSha256:h('b'),
    denseBaselineContentSha256:h('c'),
    fixtureSetSha256:h('d'),
    runtimeRepresentationSha256:h('e'),
    hardwareClass:'synthetic-mobile-device-v1',
    evaluationContractSha256:h('f'),
    deterministicSeedContractSha256:h('1'),
    caseCount:20,
    qualityDimensions:[
      'ANATOMY_ARTIFACT',
      'GARMENT_LOGO_PATTERN',
      'IDENTITY_PERSON',
      'NON_TARGET_PRESERVATION',
      'SEMANTIC_ADHERENCE',
    ],
    hardPreservationDimensions:[
      'ANATOMY_ARTIFACT',
      'GARMENT_LOGO_PATTERN',
      'IDENTITY_PERSON',
      'NON_TARGET_PRESERVATION',
    ],
    rows:[
      row('FULL_SPATIAL_CONTROL'),
      row('PROTECTED_REGION_CHEAP_BACKGROUND'),
      row('BOUNDED_BACKGROUND_PRUNING'),
    ],
    matrixEvidenceSha256:h('0'),
    ...authority(),
    ...overrides,
  };
  const matrixEvidenceSha256=
    await hsmeSpatialExecutionMatrixV1Digest(base,hash);
  return {...base,matrixEvidenceSha256};
}

function rawPolicy(m,overrides={}){
  return {
    schemaVersion:HSME_SPATIAL_DISPOSITION_POLICY_V1_SCHEMA,
    executionMatrixSha256:m.matrixEvidenceSha256,
    experimentPlanSha256:m.experimentPlanSha256,
    computeMapRosterSha256:m.computeMapRosterSha256,
    fixtureSetSha256:m.fixtureSetSha256,
    evaluationContractSha256:m.evaluationContractSha256,
    deterministicSeedContractSha256:m.deterministicSeedContractSha256,
    runtimeRepresentationSha256:m.runtimeRepresentationSha256,
    hardwareClass:m.hardwareClass,
    qualityFloors:[
      {dimension:'ANATOMY_ARTIFACT',minimumBps:9400},
      {dimension:'GARMENT_LOGO_PATTERN',minimumBps:9400},
      {dimension:'IDENTITY_PERSON',minimumBps:9400},
      {dimension:'NON_TARGET_PRESERVATION',minimumBps:9400},
      {dimension:'SEMANTIC_ADHERENCE',minimumBps:9300},
    ],
    maxQualityRegressionVsControl:[
      {dimension:'ANATOMY_ARTIFACT',maxRegressionBps:200},
      {dimension:'GARMENT_LOGO_PATTERN',maxRegressionBps:200},
      {dimension:'IDENTITY_PERSON',maxRegressionBps:200},
      {dimension:'NON_TARGET_PRESERVATION',maxRegressionBps:200},
      {dimension:'SEMANTIC_ADHERENCE',maxRegressionBps:200},
    ],
    maxHardPreservationFailures:[
      {dimension:'ANATOMY_ARTIFACT',maxFailureCount:0},
      {dimension:'GARMENT_LOGO_PATTERN',maxFailureCount:0},
      {dimension:'IDENTITY_PERSON',maxFailureCount:0},
      {dimension:'NON_TARGET_PRESERVATION',maxFailureCount:0},
    ],
    maxCriticalFailureCount:0,
    minWallClockImprovementBps:1000,
    minTotalBytesMovedImprovementBps:1000,
    maxPeakMemoryRegressionBps:500,
    maxActiveWeightsRegressionBps:500,
    reviewState:'QUALITY_FIRST_SPATIAL_POLICY_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

const trueMatrixOrigin={
  async verifySpatialExecutionMatrix(){return true;},
};
const falseMatrixOrigin={
  async verifySpatialExecutionMatrix(){return false;},
};
const truePolicyOrigin={
  async verifySpatialDispositionPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifySpatialDispositionPolicy(){return false;},
};

async function fixture(matrixOverrides={}){
  const m=await matrix(matrixOverrides);
  const policy=rawPolicy(m);
  const policySha=await hsmeSpatialDispositionPolicyV1Digest(
    policy,
    hash,
  );
  return {m,policy,policySha};
}

async function decide(f,overrides={}){
  const selectedMatrix=overrides.matrix??f.m;
  return decideHsmeSpatialDispositionV1(
    selectedMatrix,
    overrides.matrixSha??selectedMatrix.matrixEvidenceSha256,
    overrides.matrixOrigin??trueMatrixOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

async function matrixWithRows(
  controlPatch={},
  cheapPatch={},
  prunePatch={},
){
  return matrix({
    rows:[
      row('FULL_SPATIAL_CONTROL',controlPatch),
      row('PROTECTED_REGION_CHEAP_BACKGROUND',cheapPatch),
      row('BOUNDED_BACKGROUND_PRUNING',prunePatch),
    ],
  });
}

test('quality-preserving efficient candidates may independently co-advance',async()=>{
  const f=await fixture();
  const result=await decide(f);

  assert.equal(result.state,'SPATIAL_DISPOSITION_READY');
  assert.deepEqual(
    result.advancedVariants,
    [
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
  );
  assert.deepEqual(result.redesignedVariants,[]);
  assert.deepEqual(result.rejectedVariants,[]);
  assert.equal(result.candidateDispositions.length,2);
  assert.equal(
    result.candidateDispositions.every(
      value=>
        value.qualityEligible
        &&value.efficiencyEligible
        &&value.disposition==='ADVANCE',
    ),
    true,
  );
  assert.equal(result.selectionAllowed,false);
  assert.equal(result.spatialExecutionAllowed,false);
  assert.equal(result.fashionGeometryAuthorityGranted,false);
  assert.equal(
    await hsmeSpatialDispositionV1Digest(result,hash),
    result.dispositionEvidenceSha256,
  );
});

test('control quality failure forces every candidate to REDESIGN before efficiency',async()=>{
  const m=await matrixWithRows({
    qualityVector:quality({IDENTITY_PERSON:9000}),
  });
  const f=await fixture();
  const policy=rawPolicy(m);
  const policySha=await hsmeSpatialDispositionPolicyV1Digest(
    policy,
    hash,
  );
  const result=await decide(f,{matrix:m,policy,policySha});

  assert.deepEqual(result.advancedVariants,[]);
  assert.deepEqual(
    result.redesignedVariants,
    [
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
  );
  assert.equal(
    result.candidateDispositions.every(
      value=>
        value.qualityEligible===false
        &&value.efficiencyEligible===false
        &&value.reasons.includes(
          'FULL_SPATIAL_CONTROL_QUALITY_BASELINE_INVALID',
        ),
    ),
    true,
  );
});

test('speed and bytes moved cannot rescue a candidate quality regression',async()=>{
  const m=await matrixWithRows({},{
    qualityVector:quality({GARMENT_LOGO_PATTERN:9000}),
    wallClockUs:300_000,
    flashBytesMoved:100_000_000,
    ramBytesMoved:100_000_000,
    acceleratorBytesMoved:100_000_000,
  });
  const f=await fixture();
  const policy=rawPolicy(m);
  const policySha=await hsmeSpatialDispositionPolicyV1Digest(
    policy,
    hash,
  );
  const result=await decide(f,{matrix:m,policy,policySha});
  const cheap=result.candidateDispositions[0];

  assert.equal(cheap.variant,'PROTECTED_REGION_CHEAP_BACKGROUND');
  assert.equal(cheap.disposition,'REDESIGN');
  assert.equal(cheap.qualityEligible,false);
  assert.equal(cheap.efficiencyEligible,false);
  assert.ok(
    cheap.reasons.some(value=>
      value==='QUALITY_FLOOR_FAILED:GARMENT_LOGO_PATTERN'
      ||value===
        'CONTROL_QUALITY_REGRESSION_EXCEEDED:GARMENT_LOGO_PATTERN'
    ),
  );
});

test('hard preservation or critical failure rejects only the affected candidate',async()=>{
  const f=await fixture();

  for(const patch of [
    {
      hardPreservationFailureCounts:
        hard({NON_TARGET_PRESERVATION:1}),
    },
    {criticalFailureCount:1},
  ]){
    const m=await matrixWithRows({},patch,{});
    const policy=rawPolicy(m);
    const policySha=await hsmeSpatialDispositionPolicyV1Digest(
      policy,
      hash,
    );
    const result=await decide(f,{matrix:m,policy,policySha});
    assert.equal(
      result.candidateDispositions[0].disposition,
      'REJECT',
    );
    assert.equal(
      result.candidateDispositions[0].hardRejected,
      true,
    );
    assert.equal(
      result.candidateDispositions[1].disposition,
      'ADVANCE',
    );
  }
});

test('real wall-clock bytes memory and active-weight gates are independent',async()=>{
  const cases=[
    [{wallClockUs:950_000},'WALL_CLOCK_IMPROVEMENT_INSUFFICIENT'],
    [
      {
        flashBytesMoved:490_000_000,
        ramBytesMoved:590_000_000,
        acceleratorBytesMoved:390_000_000,
      },
      'TOTAL_BYTES_MOVED_IMPROVEMENT_INSUFFICIENT',
    ],
    [
      {peakMemoryBytes:1_100_000_000},
      'PEAK_MEMORY_REGRESSION_EXCEEDED',
    ],
    [
      {activeWeightsBytes:800_000_000},
      'ACTIVE_WEIGHTS_REGRESSION_EXCEEDED',
    ],
  ];
  const f=await fixture();

  for(const [patch,reason] of cases){
    const m=await matrixWithRows({},patch,{});
    const policy=rawPolicy(m);
    const policySha=await hsmeSpatialDispositionPolicyV1Digest(
      policy,
      hash,
    );
    const result=await decide(f,{matrix:m,policy,policySha});
    const cheap=result.candidateDispositions[0];
    const prune=result.candidateDispositions[1];

    assert.equal(cheap.disposition,'REDESIGN');
    assert.equal(cheap.qualityEligible,true);
    assert.equal(cheap.efficiencyEligible,false);
    assert.ok(cheap.reasons.includes(reason));
    assert.equal(prune.disposition,'ADVANCE');
  }
});

test('token-work reduction alone cannot advance without real device benefit',async()=>{
  const m=await matrixWithRows({},{
    wallClockUs:1_000_000,
    flashBytesMoved:500_000_000,
    ramBytesMoved:600_000_000,
    acceleratorBytesMoved:400_000_000,
    fullComputeTokenWork:100,
    cheapPathTokenWork:10,
  });
  const f=await fixture();
  const policy=rawPolicy(m);
  const policySha=await hsmeSpatialDispositionPolicyV1Digest(
    policy,
    hash,
  );
  const result=await decide(f,{matrix:m,policy,policySha});
  const cheap=result.candidateDispositions[0];

  assert.equal(cheap.disposition,'REDESIGN');
  assert.equal(cheap.qualityEligible,true);
  assert.equal(cheap.efficiencyEligible,false);
  assert.ok(
    cheap.reasons.includes('WALL_CLOCK_IMPROVEMENT_INSUFFICIENT'),
  );
  assert.ok(
    cheap.reasons.includes(
      'TOTAL_BYTES_MOVED_IMPROVEMENT_INSUFFICIENT',
    ),
  );
  assert.equal(cheap.candidateFullComputeTokenWork,100);
});

test('matrix and disposition-policy exact origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await decide(f,{matrixOrigin:falseMatrixOrigin});
  assert.equal(a.state,'SPATIAL_DISPOSITION_INVALID');
  assert.ok(
    a.blockers.includes('SPATIAL_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'),
  );

  const b=await decide(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(b.state,'SPATIAL_DISPOSITION_INVALID');
  assert.ok(
    b.blockers.includes('SPATIAL_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'),
  );
});

test('policy must bind exact matrix plan roster fixture runtime and dimensions',async()=>{
  const f=await fixture();

  for(const policy of [
    {...f.policy,experimentPlanSha256:h('2')},
    {...f.policy,computeMapRosterSha256:h('3')},
    {...f.policy,fixtureSetSha256:h('4')},
    {...f.policy,runtimeRepresentationSha256:h('5')},
    {
      ...f.policy,
      qualityFloors:f.policy.qualityFloors.slice(0,4),
    },
  ]){
    const policySha=await hsmeSpatialDispositionPolicyV1Digest(
      policy,
      hash,
    );
    const result=await decide(f,{policy,policySha});
    assert.equal(result.state,'SPATIAL_DISPOSITION_INVALID');
    assert.ok(
      result.blockers.includes(
        'SPATIAL_DISPOSITION_POLICY_BINDING_MISMATCH',
      ),
    );
  }
});

test('unknown weighted score token novelty and authority widening fail exact schema',async()=>{
  const f=await fixture();

  for(const policy of [
    {...f.policy,weightedScore:{quality:0.5,work:0.5}},
    {...f.policy,theoreticalTokenReductionBps:9000},
    {...f.policy,selectionAllowed:true},
  ]){
    const result=await decide(f,{
      policy,
      policySha:h('0'),
    });
    assert.equal(result.state,'SPATIAL_DISPOSITION_INVALID');
    assert.ok(
      result.blockers.includes('SPATIAL_DISPOSITION_POLICY_INVALID'),
    );
  }
});

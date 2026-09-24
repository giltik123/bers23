import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
  hsmeStageRoutingComparisonMatrixV1Digest,
} from './HsmeStageRoutingComparisonMatrixV1.ts';
import {
  HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA,
  decideHsmeStageRoutingDispositionV1,
  hsmeStageRoutingDispositionPolicyV1Digest,
  hsmeStageRoutingDispositionV1Digest,
} from './HsmeStageRoutingDispositionV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    routeSelectionAllowed:false,
    stageRoutingExecutionAllowed:false,
    routeMutationAllowed:false,
    inferenceExecutionAllowed:false,
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
}

function quality(overrides={}){
  const values={
    ANATOMY_ARTIFACT:9800,
    IDENTITY_PRESERVATION:9700,
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
    IDENTITY_PRESERVATION:0,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    failureCount:values[dimension],
  }));
}

function row(variant,patch={}){
  const routed=variant==='STAGE_ROUTED';
  return {
    variant,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    wallClockUs:routed?800_000:1_000_000,
    activeWeightsBytes:routed?650_000_000:700_000_000,
    peakMemoryBytes:routed?900_000_000:1_000_000_000,
    flashBytesMoved:routed?400_000_000:500_000_000,
    ramBytesMoved:routed?500_000_000:600_000_000,
    acceleratorBytesMoved:routed?300_000_000:400_000_000,
    expertActivationCount:routed?60:0,
    transitionStallUs:routed?40_000:0,
    routerReplayIdentitySha256:routed?h('1'):h('2'),
    routeTableReplayIdentitySha256:routed?h('3'):'NONE',
    prefetchReplayIdentitySha256:routed?h('4'):'NONE',
    networkBytesDuringExecution:0,
    realTargetDeviceMeasurement:true,
    ...patch,
  };
}

async function matrix(overrides={}){
  const base={
    schemaVersion:HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
    state:'STAGE_ROUTING_COMPARISON_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    routeTableEvidenceSha256:h('3'),
    scheduleEvidenceSha256:h('4'),
    campaignPolicySha256:h('5'),
    hostResultSha256:h('6'),
    executionAttemptId:'synthetic-stage-routing-attempt-001',
    prototypeSha256:h('7'),
    denseBaselineContentSha256:h('8'),
    routerContentSha256:h('9'),
    runtimeRepresentationSha256:h('a'),
    hardwareClass:'synthetic-device-v1',
    fixtureSetSha256:h('b'),
    evaluationContractSha256:h('c'),
    deterministicSeedContractSha256:h('d'),
    caseCount:20,
    qualityDimensions:[
      'ANATOMY_ARTIFACT',
      'IDENTITY_PRESERVATION',
      'SEMANTIC_ADHERENCE',
    ],
    hardPreservationDimensions:[
      'ANATOMY_ARTIFACT',
      'IDENTITY_PRESERVATION',
    ],
    rows:[
      row('STATIC_SHARED_CONTROL'),
      row('STAGE_ROUTED'),
    ],
    matrixEvidenceSha256:h('0'),
    selectionAllowed:false,
    stageRoutingExecutionAllowed:false,
    routeMutationAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
    ...overrides,
  };
  const matrixEvidenceSha256=
    await hsmeStageRoutingComparisonMatrixV1Digest(base,hash);
  return {...base,matrixEvidenceSha256};
}

function rawPolicy(m,overrides={}){
  return {
    schemaVersion:HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA,
    routingMatrixSha256:m.matrixEvidenceSha256,
    routeTableEvidenceSha256:m.routeTableEvidenceSha256,
    scheduleEvidenceSha256:m.scheduleEvidenceSha256,
    fixtureSetSha256:m.fixtureSetSha256,
    evaluationContractSha256:m.evaluationContractSha256,
    deterministicSeedContractSha256:m.deterministicSeedContractSha256,
    runtimeRepresentationSha256:m.runtimeRepresentationSha256,
    hardwareClass:m.hardwareClass,
    qualityFloors:[
      {dimension:'ANATOMY_ARTIFACT',minimumBps:9400},
      {dimension:'IDENTITY_PRESERVATION',minimumBps:9400},
      {dimension:'SEMANTIC_ADHERENCE',minimumBps:9300},
    ],
    maxQualityRegressionVsStatic:[
      {dimension:'ANATOMY_ARTIFACT',maxRegressionBps:200},
      {dimension:'IDENTITY_PRESERVATION',maxRegressionBps:200},
      {dimension:'SEMANTIC_ADHERENCE',maxRegressionBps:200},
    ],
    maxHardPreservationFailures:[
      {dimension:'ANATOMY_ARTIFACT',maxFailureCount:0},
      {dimension:'IDENTITY_PRESERVATION',maxFailureCount:1},
    ],
    maxCriticalFailureCount:0,
    minWallClockImprovementBps:1000,
    minTotalBytesMovedImprovementBps:1000,
    maxPeakMemoryRegressionBps:500,
    maxActiveWeightsRegressionBps:500,
    maxTransitionStallUs:100_000,
    reviewState:'QUALITY_FIRST_STAGE_ROUTING_POLICY_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

const trueMatrixOrigin={
  async verifyRoutingMatrix(){return true;},
};
const falseMatrixOrigin={
  async verifyRoutingMatrix(){return false;},
};
const truePolicyOrigin={
  async verifyDispositionPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyDispositionPolicy(){return false;},
};

async function fixture(matrixOverrides={}){
  const m=await matrix(matrixOverrides);
  const policy=rawPolicy(m);
  const policySha=await hsmeStageRoutingDispositionPolicyV1Digest(
    policy,
    hash,
  );
  return {m,policy,policySha};
}

async function decide(f,overrides={}){
  const selectedMatrix=overrides.matrix??f.m;
  return decideHsmeStageRoutingDispositionV1(
    selectedMatrix,
    overrides.matrixSha??selectedMatrix.matrixEvidenceSha256,
    overrides.matrixOrigin??trueMatrixOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

async function matrixWithRows(staticPatch={},routedPatch={}){
  return matrix({
    rows:[
      row('STATIC_SHARED_CONTROL',staticPatch),
      row('STAGE_ROUTED',routedPatch),
    ],
  });
}

test('quality-eligible stage routing with all real efficiency gates passes ADVANCE',async()=>{
  const f=await fixture();
  const result=await decide(f);

  assert.equal(result.state,'STAGE_ROUTING_DISPOSITION_READY');
  assert.equal(result.disposition,'ADVANCE');
  assert.equal(result.hardRejected,false);
  assert.equal(result.qualityEligible,true);
  assert.equal(result.efficiencyEligible,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.staticWallClockUs,1_000_000);
  assert.equal(result.routedWallClockUs,800_000);
  assert.equal(result.staticTotalBytesMoved,1_500_000_000);
  assert.equal(result.routedTotalBytesMoved,1_200_000_000);
  assert.equal(result.routedTransitionStallUs,40_000);
  assert.equal(result.routeSelectionAllowed,false);
  assert.equal(result.stageRoutingExecutionAllowed,false);
  assert.equal(result.inferenceExecutionAllowed,false);
  assert.equal(
    await hsmeStageRoutingDispositionV1Digest(result,hash),
    result.dispositionEvidenceSha256,
  );
});

test('static control quality failure forces REDESIGN before routed efficiency is interpreted',async()=>{
  const m=await matrixWithRows({
    qualityVector:quality({SEMANTIC_ADHERENCE:9000}),
  });
  const f=await fixture();
  const policy=rawPolicy(m);
  const policySha=await hsmeStageRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide(f,{matrix:m,policy,policySha});

  assert.equal(result.disposition,'REDESIGN');
  assert.equal(result.qualityEligible,false);
  assert.equal(result.efficiencyEligible,false);
  assert.deepEqual(result.reasons,['STATIC_CONTROL_QUALITY_BASELINE_INVALID']);
});

test('speed cannot rescue routed quality regression',async()=>{
  const m=await matrixWithRows({},{
    qualityVector:quality({IDENTITY_PRESERVATION:9300}),
    wallClockUs:300_000,
    flashBytesMoved:100_000_000,
    ramBytesMoved:100_000_000,
    acceleratorBytesMoved:100_000_000,
  });
  const f=await fixture();
  const policy=rawPolicy(m);
  const policySha=await hsmeStageRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide(f,{matrix:m,policy,policySha});

  assert.equal(result.disposition,'REDESIGN');
  assert.equal(result.qualityEligible,false);
  assert.equal(result.efficiencyEligible,false);
  assert.ok(
    result.reasons.some(value=>
      value==='QUALITY_FLOOR_FAILED:IDENTITY_PRESERVATION'
      ||value==='STATIC_QUALITY_REGRESSION_EXCEEDED:IDENTITY_PRESERVATION'
    ),
  );
});

test('hard preservation or critical failure produces REJECT',async()=>{
  const f=await fixture();

  for(const routedPatch of [
    {hardPreservationFailureCounts:hard({ANATOMY_ARTIFACT:1})},
    {criticalFailureCount:1},
  ]){
    const m=await matrixWithRows({},routedPatch);
    const policy=rawPolicy(m);
    const policySha=await hsmeStageRoutingDispositionPolicyV1Digest(
      policy,
      hash,
    );
    const result=await decide(f,{matrix:m,policy,policySha});
    assert.equal(result.disposition,'REJECT');
    assert.equal(result.hardRejected,true);
    assert.equal(result.efficiencyEligible,false);
  }
});

test('each real efficiency gate applies only after quality eligibility',async()=>{
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
    [{peakMemoryBytes:1_100_000_000},'PEAK_MEMORY_REGRESSION_EXCEEDED'],
    [{activeWeightsBytes:800_000_000},'ACTIVE_WEIGHTS_REGRESSION_EXCEEDED'],
    [{transitionStallUs:100_001},'TRANSITION_STALL_EXCEEDED'],
  ];
  const f=await fixture();

  for(const [patch,reason] of cases){
    const m=await matrixWithRows({},patch);
    const policy=rawPolicy(m);
    const policySha=await hsmeStageRoutingDispositionPolicyV1Digest(
      policy,
      hash,
    );
    const result=await decide(f,{matrix:m,policy,policySha});
    assert.equal(result.disposition,'REDESIGN');
    assert.equal(result.qualityEligible,true);
    assert.equal(result.efficiencyEligible,false);
    assert.ok(result.reasons.includes(reason));
  }
});

test('matrix and disposition-policy exact origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await decide(f,{matrixOrigin:falseMatrixOrigin});
  assert.equal(a.state,'STAGE_ROUTING_DISPOSITION_INVALID');
  assert.ok(
    a.blockers.includes('STAGE_ROUTING_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'),
  );

  const b=await decide(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(b.state,'STAGE_ROUTING_DISPOSITION_INVALID');
  assert.ok(
    b.blockers.includes('STAGE_ROUTING_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'),
  );
});

test('policy must bind exact matrix route schedule fixture runtime and dimensions',async()=>{
  const f=await fixture();

  const policies=[
    {...f.policy,routeTableEvidenceSha256:h('e')},
    {...f.policy,scheduleEvidenceSha256:h('f')},
    {...f.policy,fixtureSetSha256:h('1')},
    {...f.policy,runtimeRepresentationSha256:h('2')},
    {
      ...f.policy,
      qualityFloors:f.policy.qualityFloors.slice(0,2),
    },
  ];
  for(const policy of policies){
    const policySha=await hsmeStageRoutingDispositionPolicyV1Digest(
      policy,
      hash,
    );
    const result=await decide(f,{policy,policySha});
    assert.equal(result.state,'STAGE_ROUTING_DISPOSITION_INVALID');
    assert.ok(
      result.blockers.includes(
        'STAGE_ROUTING_DISPOSITION_POLICY_BINDING_MISMATCH',
      ),
    );
  }
});

test('unknown score sparsity provider or authority fields fail exact policy schema',async()=>{
  const f=await fixture();

  for(const extra of [
    {weightedScore:{quality:0.5,latency:0.5}},
    {theoreticalSparsityBps:9000},
    {providerId:'cloud-provider'},
    {routeSelectionAllowed:true},
  ]){
    const policy={...f.policy,...extra};
    const result=await decide(f,{policy,policySha:h('0')});
    assert.equal(result.state,'STAGE_ROUTING_DISPOSITION_INVALID');
    assert.ok(
      result.blockers.includes('STAGE_ROUTING_DISPOSITION_POLICY_INVALID'),
    );
  }
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA,
  hsmeRealMobileQualificationPolicyV1Digest,
} from './HsmeRealMobileQualificationV1.ts';
import {
  HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1_SCHEMA,
  HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1,
  freezeHsmePhysicalMobileCapturePlanV1,
  hsmePhysicalMobileCapturePlanV1Digest,
  hsmePhysicalMobileCaptureRequestV1Digest,
} from './HsmePhysicalMobileCapturePlanV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function matrixAuthority(){
  return {
    selectionAllowed:false,
    benchmarkExecutionAllowed:false,
    representationMutationAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    fashionGeometryAuthorityGranted:false,
    artifactAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function policyAuthority(){
  return {
    selectionAllowed:false,
    mobileBackendAdmissionAllowed:false,
    benchmarkExecutionAllowed:false,
    representationMutationAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    fashionGeometryAuthorityGranted:false,
    artifactAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function requestAuthority(){
  return {
    physicalCaptureExecutionAllowed:false,
    qualificationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    fashionGeometryAuthorityGranted:false,
    artifactAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function quality(){
  return [
    {dimension:'ANATOMY_ARTIFACT',valueBps:9800},
    {dimension:'GARMENT_LOGO_PATTERN',valueBps:9700},
    {dimension:'IDENTITY_PERSON',valueBps:9750},
    {dimension:'NON_TARGET_PRESERVATION',valueBps:9650},
  ];
}

function hard(){
  return [
    {dimension:'ANATOMY_ARTIFACT',failureCount:0},
    {dimension:'GARMENT_LOGO_PATTERN',failureCount:0},
    {dimension:'IDENTITY_PERSON',failureCount:0},
    {dimension:'NON_TARGET_PRESERVATION',failureCount:0},
  ];
}

function row(candidateId,placement,overrides={}){
  return {
    candidateId,
    fleetModelId:'bers-hsme-'+candidateId,
    fleetVersion:'1.0.0',
    representationContentSha256:
      candidateId==='android-npu'?h('1'):h('2'),
    runtimeIdentity:
      candidateId==='android-npu'
        ?'litert-qnn-hexagon-v1'
        :'coreml-metal-ane-v1',
    formatIdentity:
      candidateId==='android-npu'
        ?'litert-tflite-v1'
        :'coreml-mlpackage-v1',
    platformFamily:
      candidateId==='android-npu'?'ANDROID':'APPLE',
    supportedDeviceClass:
      candidateId==='android-npu'
        ?'snapdragon-8-gen-3-mobile'
        :'apple-a17-pro-mobile',
    requestedPlacement:placement,
    actualPlacement:placement,
    runtimeFallbackUsed:false,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    coldLatencyUs:900_000,
    warmLatencyUs:700_000,
    activeRepresentationBytes:700_000_000,
    peakHostMemoryBytes:900_000_000,
    peakAcceleratorMemoryBytes:
      placement==='CPU'?0:500_000_000,
    flashBytesMoved:400_000_000,
    ramBytesMoved:500_000_000,
    acceleratorBytesMoved:
      placement==='CPU'?0:300_000_000,
    networkBytesDuringExecution:0,
    measurementMethodSha256:
      candidateId==='android-npu'?h('3'):h('4'),
    measurementEvidenceSha256:
      candidateId==='android-npu'?h('5'):h('6'),
    realTargetDeviceMeasurement:true,
    ...overrides,
  };
}

async function matrix(){
  const base={
    schemaVersion:HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
    state:'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    hardwareRepresentationRosterSha256:h('7'),
    campaignPolicySha256:h('8'),
    hostResultSha256:h('9'),
    executionAttemptId:'synthetic-placement-attempt-001',
    fixtureSetSha256:h('a'),
    evaluationContractSha256:h('b'),
    deterministicSeedContractSha256:h('c'),
    caseCount:20,
    qualityDimensions:quality().map(v=>v.dimension),
    hardPreservationDimensions:hard().map(v=>v.dimension),
    rows:[
      row('android-npu','NPU'),
      row('apple-npu','NPU'),
    ],
    matrixEvidenceSha256:h('0'),
    ...matrixAuthority(),
  };
  const matrixEvidenceSha256=
    await hsmeHardwarePlacementMatrixV1Digest(base,hash);
  return {...base,matrixEvidenceSha256};
}

function rawPolicy(m,overrides={}){
  return {
    schemaVersion:HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA,
    hardwarePlacementMatrixSha256:m.matrixEvidenceSha256,
    minRepeatedRunCount:5,
    maxWarmLatencyRegressionBps:1000,
    maxBatteryDrainBps:500,
    maxEnergyMicroJoulesPerRun:5_000_000,
    maxPeakThermalState:'HIGH',
    maxThrottledRunCount:1,
    maxPeakHostMemoryRegressionBps:1000,
    maxPeakAcceleratorMemoryRegressionBps:1000,
    requireBatteryPower:true,
    networkAllowed:false,
    reviewState:'REAL_MOBILE_QUALIFICATION_POLICY_REVIEWED',
    ...policyAuthority(),
    ...overrides,
  };
}

function rawRequest(m,overrides={}){
  const target=m.rows[0];
  return {
    schemaVersion:HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1_SCHEMA,
    hardwarePlacementMatrixSha256:m.matrixEvidenceSha256,
    candidateId:target.candidateId,
    requestedPlacement:target.requestedPlacement,
    supportedDeviceClass:target.supportedDeviceClass,
    platformFamily:target.platformFamily,
    fleetModelId:target.fleetModelId,
    fleetVersion:target.fleetVersion,
    representationContentSha256:
      target.representationContentSha256,
    placementMeasurementEvidenceSha256:
      target.measurementEvidenceSha256,
    runtimeIdentity:target.runtimeIdentity,
    repeatedRunCount:7,
    requiredTelemetry:
      [...HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1].reverse(),
    requireBatteryPower:true,
    networkBytesDuringExecution:0,
    requireFoundationPhysicalBundle:true,
    requireIndependentNativeTelemetryAttestation:true,
    reviewedAtMs:1_000,
    expiresAtMs:10_000,
    reviewState:'PHYSICAL_MOBILE_CAPTURE_REQUEST_REVIEWED',
    ...requestAuthority(),
    ...overrides,
  };
}

const trueMatrixOrigin={
  async verifyHardwarePlacementMatrix(){return true;},
};
const falseMatrixOrigin={
  async verifyHardwarePlacementMatrix(){return false;},
};
const truePolicyOrigin={
  async verifyRealMobileQualificationPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyRealMobileQualificationPolicy(){return false;},
};
const trueRequestOrigin={
  async verifyPhysicalMobileCaptureRequest(){return true;},
};
const falseRequestOrigin={
  async verifyPhysicalMobileCaptureRequest(){return false;},
};

async function fixture(){
  const m=await matrix();
  const policy=rawPolicy(m);
  const policySha=
    await hsmeRealMobileQualificationPolicyV1Digest(
      policy,
      hash,
    );
  const request=rawRequest(m);
  const requestSha=
    await hsmePhysicalMobileCaptureRequestV1Digest(
      request,
      hash,
    );
  return {m,policy,policySha,request,requestSha};
}

async function freeze(f,overrides={}){
  const selectedMatrix=overrides.matrix??f.m;
  return freezeHsmePhysicalMobileCapturePlanV1(
    selectedMatrix,
    overrides.matrixSha??selectedMatrix.matrixEvidenceSha256,
    overrides.matrixOrigin??trueMatrixOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    overrides.request??f.request,
    overrides.requestSha??f.requestSha,
    overrides.requestOrigin??trueRequestOrigin,
    overrides.nowMs??2_000,
    hash,
  );
}

test('reviewed exact candidate placement freezes deterministic pre-run plan',async()=>{
  const f=await fixture();
  const first=await freeze(f);

  const request={
    ...f.request,
    requiredTelemetry:
      [...f.request.requiredTelemetry].reverse(),
  };
  const requestSha=
    await hsmePhysicalMobileCaptureRequestV1Digest(
      request,
      hash,
    );
  const second=await freeze(f,{request,requestSha});

  assert.equal(
    first.state,
    'PHYSICAL_MOBILE_CAPTURE_PLAN_FROZEN_NOT_EXECUTED',
  );
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.candidateId,'android-npu');
  assert.equal(first.requestedPlacement,'NPU');
  assert.equal(
    first.supportedDeviceClass,
    'snapdragon-8-gen-3-mobile',
  );
  assert.equal(first.repeatedRunCount,7);
  assert.deepEqual(
    first.requiredTelemetry,
    HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1,
  );
  assert.equal(first.requireBatteryPower,true);
  assert.equal(first.networkBytesDuringExecution,0);
  assert.equal(first.requireFoundationPhysicalBundle,true);
  assert.equal(
    first.requireIndependentNativeTelemetryAttestation,
    true,
  );
  assert.equal(first.physicalCaptureExecutionAllowed,false);
  assert.equal(first.qualificationAllowed,false);
  assert.equal(first.durableModelFleetPromotionAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmePhysicalMobileCapturePlanV1Digest(first,hash),
    first.capturePlanEvidenceSha256,
  );
});

test('matrix policy and request origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await freeze(f,{matrixOrigin:falseMatrixOrigin});
  assert.equal(a.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID');
  assert.ok(
    a.blockers.includes(
      'PHYSICAL_MOBILE_CAPTURE_MATRIX_ORIGIN_UNVERIFIED',
    ),
  );

  const b=await freeze(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(b.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID');
  assert.ok(
    b.blockers.includes(
      'PHYSICAL_MOBILE_CAPTURE_QUALIFICATION_POLICY_ORIGIN_UNVERIFIED',
    ),
  );

  const c=await freeze(f,{requestOrigin:falseRequestOrigin});
  assert.equal(c.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID');
  assert.ok(
    c.blockers.includes(
      'PHYSICAL_MOBILE_CAPTURE_REQUEST_ORIGIN_UNVERIFIED',
    ),
  );
});

test('capture run count may not fall below frozen qualification minimum',async()=>{
  const f=await fixture();
  const request=rawRequest(f.m,{repeatedRunCount:4});
  const requestSha=
    await hsmePhysicalMobileCaptureRequestV1Digest(
      request,
      hash,
    );
  const result=await freeze(f,{request,requestSha});

  assert.equal(result.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID');
  assert.ok(
    result.blockers.includes(
      'PHYSICAL_MOBILE_CAPTURE_RUN_COUNT_BELOW_POLICY',
    ),
  );
});

test('stale or not-yet-reviewed capture request is BLOCKED before device execution',async()=>{
  const f=await fixture();

  const stale=rawRequest(f.m,{
    reviewedAtMs:1_000,
    expiresAtMs:2_000,
  });
  const staleSha=
    await hsmePhysicalMobileCaptureRequestV1Digest(stale,hash);
  const a=await freeze(f,{
    request:stale,
    requestSha:staleSha,
    nowMs:2_001,
  });
  assert.equal(a.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_BLOCKED');
  assert.ok(
    a.blockers.includes(
      'PHYSICAL_MOBILE_CAPTURE_REQUEST_NOT_CURRENT',
    ),
  );

  const future=rawRequest(f.m,{
    reviewedAtMs:5_000,
    expiresAtMs:10_000,
  });
  const futureSha=
    await hsmePhysicalMobileCaptureRequestV1Digest(
      future,
      hash,
    );
  const b=await freeze(f,{
    request:future,
    requestSha:futureSha,
    nowMs:4_999,
  });
  assert.equal(b.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_BLOCKED');
});

test('fleet runtime device placement and prior measurement binding cannot drift',async()=>{
  const f=await fixture();

  for(const overrides of [
    {fleetModelId:'other-model'},
    {fleetVersion:'2.0.0'},
    {representationContentSha256:h('f')},
    {supportedDeviceClass:'other-mobile'},
    {runtimeIdentity:'other-runtime'},
    {placementMeasurementEvidenceSha256:h('e')},
    {requestedPlacement:'CPU'},
  ]){
    const request=rawRequest(f.m,overrides);
    const requestSha=
      await hsmePhysicalMobileCaptureRequestV1Digest(
        request,
        hash,
      );
    const result=await freeze(f,{request,requestSha});
    assert.equal(
      result.state,
      'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID',
    );
    assert.ok(
      result.blockers.some(value=>
        value==='PHYSICAL_MOBILE_CAPTURE_REQUEST_ROW_BINDING_MISMATCH'
        ||value==='PHYSICAL_MOBILE_CAPTURE_PLACEMENT_ROW_MISSING'
      ),
    );
  }
});

test('battery zero-network and independent physical trust requirements are immutable',async()=>{
  const f=await fixture();

  for(const request of [
    {...f.request,requireBatteryPower:false},
    {...f.request,networkBytesDuringExecution:1},
    {...f.request,requireFoundationPhysicalBundle:false},
    {
      ...f.request,
      requireIndependentNativeTelemetryAttestation:false,
    },
    {...f.request,physicalCaptureExecutionAllowed:true},
    {...f.request,qualificationAllowed:true},
    {...f.request,providerAuthorityGranted:true},
  ]){
    const result=await freeze(f,{
      request,
      requestSha:h('0'),
    });
    assert.equal(
      result.state,
      'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID',
    );
    assert.ok(
      result.blockers.includes(
        'PHYSICAL_MOBILE_CAPTURE_REQUEST_INVALID',
      ),
    );
  }
});

test('required telemetry cannot be removed or augmented post review',async()=>{
  const f=await fixture();

  for(const requiredTelemetry of [
    f.request.requiredTelemetry.slice(0,-1),
    [...f.request.requiredTelemetry,'THEORETICAL_FLOPS'],
  ]){
    const request={
      ...f.request,
      requiredTelemetry,
    };
    const result=await freeze(f,{
      request,
      requestSha:h('0'),
    });
    assert.equal(
      result.state,
      'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID',
    );
    assert.ok(
      result.blockers.includes(
        'PHYSICAL_MOBILE_CAPTURE_REQUEST_INVALID',
      ),
    );
  }
});

test('unknown post-hoc selection fields fail exact request schema',async()=>{
  const f=await fixture();
  const request={
    ...f.request,
    selectedAfterResults:true,
  };
  const result=await freeze(f,{
    request,
    requestSha:h('0'),
  });

  assert.equal(result.state,'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID');
  assert.ok(
    result.blockers.includes(
      'PHYSICAL_MOBILE_CAPTURE_REQUEST_INVALID',
    ),
  );
});

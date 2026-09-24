import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA,
  HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA,
  evaluateHsmeRealMobileRecordV1,
  hsmeRealMobileDeviceEvidenceSetV1Digest,
  hsmeRealMobileQualificationPolicyV1Digest,
  normalizeHsmeRealMobileDeviceEvidenceSetV1,
  normalizeHsmeRealMobileQualificationPolicyV1,
  qualifyHsmeRealMobileEvidenceV1,
} from './HsmeRealMobileQualificationV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
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

function matrixAuthority(){
  const {
    mobileBackendAdmissionAllowed:_mobile,
    ...rest
  }=authority();
  return rest;
}

function quality(){
  return [
    {dimension:'ANATOMY_ARTIFACT',valueBps:9800},
    {dimension:'GARMENT_LOGO_PATTERN',valueBps:9700},
    {dimension:'IDENTITY_PERSON',valueBps:9750},
    {dimension:'NON_TARGET_PRESERVATION',valueBps:9650},
    {dimension:'SEMANTIC_ADHERENCE',valueBps:9600},
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

function placementRow(
  candidateId,
  platformFamily,
  placement,
  contentCh,
  evidenceCh,
){
  return {
    candidateId,
    fleetModelId:'bers-hsme-'+candidateId,
    fleetVersion:'1.0.0',
    representationContentSha256:h(contentCh),
    runtimeIdentity:
      platformFamily==='APPLE'
        ?'coreml-metal-ane-v1'
        :'litert-vulkan-qnn-v1',
    formatIdentity:
      platformFamily==='APPLE'
        ?'coreml-mlpackage-v1'
        :'litert-tflite-v1',
    platformFamily,
    supportedDeviceClass:
      platformFamily==='APPLE'
        ?'apple-a17-pro-mobile'
        :'snapdragon-8-gen-3-mobile',
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
    peakAcceleratorMemoryBytes:800_000_000,
    flashBytesMoved:600_000_000,
    ramBytesMoved:700_000_000,
    acceleratorBytesMoved:650_000_000,
    networkBytesDuringExecution:0,
    measurementMethodSha256:h('9'),
    measurementEvidenceSha256:h(evidenceCh),
    realTargetDeviceMeasurement:true,
  };
}

async function matrix(){
  const base={
    schemaVersion:HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
    state:'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    hardwareRepresentationRosterSha256:h('1'),
    campaignPolicySha256:h('2'),
    hostResultSha256:h('3'),
    executionAttemptId:'synthetic-placement-attempt-001',
    fixtureSetSha256:h('4'),
    evaluationContractSha256:h('5'),
    deterministicSeedContractSha256:h('6'),
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
      placementRow(
        'android-gpu',
        'ANDROID',
        'GPU',
        'a',
        'b',
      ),
      placementRow(
        'apple-npu',
        'APPLE',
        'NPU',
        'c',
        'd',
      ),
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
    maxWarmLatencyRegressionBps:1500,
    maxBatteryDrainBps:500,
    maxEnergyMicroJoulesPerRun:2_000_000_000,
    maxPeakThermalState:'ELEVATED',
    maxThrottledRunCount:0,
    maxPeakHostMemoryRegressionBps:500,
    maxPeakAcceleratorMemoryRegressionBps:500,
    requireBatteryPower:true,
    networkAllowed:false,
    reviewState:'REAL_MOBILE_QUALIFICATION_POLICY_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

function evidenceRecord(m,overrides={}){
  const row=m.rows[0];
  return {
    hardwarePlacementMatrixSha256:m.matrixEvidenceSha256,
    candidateId:row.candidateId,
    fleetModelId:row.fleetModelId,
    fleetVersion:row.fleetVersion,
    representationContentSha256:row.representationContentSha256,
    requestedPlacement:row.requestedPlacement,
    placementMeasurementEvidenceSha256:
      row.measurementEvidenceSha256,
    platformFamily:row.platformFamily,
    deviceClass:'MOBILE',
    supportedDeviceClass:row.supportedDeviceClass,
    physicalDeviceAttestationSha256:h('7'),
    deviceHardwareProfileSha256:h('8'),
    osBuildSha256:h('9'),
    runtimeBuildSha256:h('a'),
    repeatedRunCount:10,
    repeatedWarmLatencyP50Us:710_000,
    repeatedWarmLatencyP95Us:760_000,
    peakHostMemoryBytes:920_000_000,
    peakAcceleratorMemoryBytes:810_000_000,
    flashBytesMoved:610_000_000,
    ramBytesMoved:710_000_000,
    acceleratorBytesMoved:660_000_000,
    energyMicroJoulesPerRun:1_000_000_000,
    batteryStartBps:8000,
    batteryEndBps:7800,
    powerSource:'BATTERY',
    thermalStartState:'NORMAL',
    thermalPeakState:'ELEVATED',
    thermalEndState:'NORMAL',
    throttledRunCount:0,
    networkBytesDuringExecution:0,
    measurementMethodSha256:h('b'),
    batteryMeasurementEvidenceSha256:h('c'),
    thermalMeasurementEvidenceSha256:h('d'),
    realPhysicalMobileDeviceMeasurement:true,
    ...overrides,
  };
}

function rawEvidenceSet(m,overrides={}){
  return {
    schemaVersion:HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA,
    hardwarePlacementMatrixSha256:m.matrixEvidenceSha256,
    records:[evidenceRecord(m)],
    realPhysicalMobileDeviceEvidence:true,
    ...authority(),
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
const trueEvidenceOriginForInvalidCasesOnly={
  async verifyRealMobileDeviceEvidenceSet(){return true;},
};
const falseEvidenceOrigin={
  async verifyRealMobileDeviceEvidenceSet(){return false;},
};

async function fixture(){
  const m=await matrix();
  const policy=rawPolicy(m);
  const policySha=
    await hsmeRealMobileQualificationPolicyV1Digest(
      policy,
      hash,
    );
  const evidenceSet=rawEvidenceSet(m);
  const evidenceSetSha=
    await hsmeRealMobileDeviceEvidenceSetV1Digest(
      evidenceSet,
      hash,
    );
  return {
    m,
    policy,
    policySha,
    evidenceSet,
    evidenceSetSha,
  };
}

test('policy and real-device evidence normalize deterministically without granting admission',async()=>{
  const f=await fixture();
  const policy=normalizeHsmeRealMobileQualificationPolicyV1(
    f.policy,
  );
  const evidenceSet=normalizeHsmeRealMobileDeviceEvidenceSetV1(
    f.evidenceSet,
  );

  assert.equal(
    await hsmeRealMobileQualificationPolicyV1Digest(
      policy,
      hash,
    ),
    f.policySha,
  );
  assert.equal(
    await hsmeRealMobileDeviceEvidenceSetV1Digest(
      evidenceSet,
      hash,
    ),
    f.evidenceSetSha,
  );
  assert.equal(policy.mobileBackendAdmissionAllowed,false);
  assert.equal(evidenceSet.mobileBackendAdmissionAllowed,false);
});

test('missing external real-device evidence remains BLOCKED',async()=>{
  const f=await fixture();
  const result=await qualifyHsmeRealMobileEvidenceV1(
    f.m,
    f.m.matrixEvidenceSha256,
    trueMatrixOrigin,
    f.policy,
    f.policySha,
    truePolicyOrigin,
    null,
    h('0'),
    falseEvidenceOrigin,
    hash,
  );

  assert.equal(result.state,'REAL_MOBILE_QUALIFICATION_BLOCKED');
  assert.ok(
    result.blockers.includes('REAL_MOBILE_DEVICE_EVIDENCE_REQUIRED'),
  );
  assert.equal(result.qualificationEvidenceSha256,'UNKNOWN');
});

test('matrix and reviewed policy origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await qualifyHsmeRealMobileEvidenceV1(
    f.m,
    f.m.matrixEvidenceSha256,
    falseMatrixOrigin,
    f.policy,
    f.policySha,
    truePolicyOrigin,
    f.evidenceSet,
    f.evidenceSetSha,
    falseEvidenceOrigin,
    hash,
  );
  assert.equal(a.state,'REAL_MOBILE_QUALIFICATION_INVALID');
  assert.ok(
    a.blockers.includes('REAL_MOBILE_MATRIX_ORIGIN_UNVERIFIED'),
  );

  const b=await qualifyHsmeRealMobileEvidenceV1(
    f.m,
    f.m.matrixEvidenceSha256,
    trueMatrixOrigin,
    f.policy,
    f.policySha,
    falsePolicyOrigin,
    f.evidenceSet,
    f.evidenceSetSha,
    falseEvidenceOrigin,
    hash,
  );
  assert.equal(b.state,'REAL_MOBILE_QUALIFICATION_INVALID');
  assert.ok(
    b.blockers.includes(
      'REAL_MOBILE_QUALIFICATION_POLICY_ORIGIN_UNVERIFIED',
    ),
  );
});

test('synthetic evidence with an untrusted real-device origin cannot become READY',async()=>{
  const f=await fixture();
  const result=await qualifyHsmeRealMobileEvidenceV1(
    f.m,
    f.m.matrixEvidenceSha256,
    trueMatrixOrigin,
    f.policy,
    f.policySha,
    truePolicyOrigin,
    f.evidenceSet,
    f.evidenceSetSha,
    falseEvidenceOrigin,
    hash,
  );

  assert.equal(result.state,'REAL_MOBILE_QUALIFICATION_INVALID');
  assert.ok(
    result.blockers.includes(
      'REAL_MOBILE_DEVICE_EVIDENCE_ORIGIN_UNVERIFIED',
    ),
  );
  assert.equal(result.qualificationEvidenceSha256,'UNKNOWN');
});

test('trusted-but-misbinding evidence fails before any qualification is emitted',async()=>{
  const f=await fixture();
  const evidenceSet=rawEvidenceSet(f.m,{
    records:[
      evidenceRecord(f.m,{
        placementMeasurementEvidenceSha256:h('f'),
      }),
    ],
  });
  const evidenceSetSha=
    await hsmeRealMobileDeviceEvidenceSetV1Digest(
      evidenceSet,
      hash,
    );

  const result=await qualifyHsmeRealMobileEvidenceV1(
    f.m,
    f.m.matrixEvidenceSha256,
    trueMatrixOrigin,
    f.policy,
    f.policySha,
    truePolicyOrigin,
    evidenceSet,
    evidenceSetSha,
    trueEvidenceOriginForInvalidCasesOnly,
    hash,
  );

  assert.equal(result.state,'REAL_MOBILE_QUALIFICATION_INVALID');
  assert.ok(
    result.blockers.includes(
      'REAL_MOBILE_PLACEMENT_BINDING_MISMATCH',
    ),
  );
});

test('pure evaluator qualifies bounded battery thermal and repeated-run evidence',async()=>{
  const f=await fixture();
  const policy=normalizeHsmeRealMobileQualificationPolicyV1(
    f.policy,
  );
  const evidence=
    normalizeHsmeRealMobileDeviceEvidenceSetV1(
      f.evidenceSet,
    ).records[0];

  const result=evaluateHsmeRealMobileRecordV1(
    evidence,
    f.m.rows[0],
    policy,
  );

  assert.equal(result.qualification,'QUALIFIED');
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.batteryDrainBps,200);
});

test('pure evaluator rejects thermal latency battery energy memory and throttling violations',async()=>{
  const f=await fixture();
  const policy=normalizeHsmeRealMobileQualificationPolicyV1(
    f.policy,
  );
  const set=rawEvidenceSet(f.m,{
    records:[
      evidenceRecord(f.m,{
        repeatedRunCount:4,
        repeatedWarmLatencyP95Us:900_000,
        energyMicroJoulesPerRun:2_000_000_001,
        batteryStartBps:8000,
        batteryEndBps:7400,
        thermalPeakState:'CRITICAL',
        throttledRunCount:1,
        peakHostMemoryBytes:1_100_000_000,
        peakAcceleratorMemoryBytes:1_000_000_000,
      }),
    ],
  });
  const evidence=
    normalizeHsmeRealMobileDeviceEvidenceSetV1(set).records[0];

  const result=evaluateHsmeRealMobileRecordV1(
    evidence,
    f.m.rows[0],
    policy,
  );

  assert.equal(result.qualification,'REJECTED');
  assert.ok(result.reasons.includes('REPEATED_RUN_COUNT_INSUFFICIENT'));
  assert.ok(result.reasons.includes('WARM_LATENCY_REGRESSION_EXCEEDED'));
  assert.ok(result.reasons.includes('BATTERY_DRAIN_EXCEEDED'));
  assert.ok(result.reasons.includes('ENERGY_PER_RUN_EXCEEDED'));
  assert.ok(result.reasons.includes('CRITICAL_THERMAL_STATE'));
  assert.ok(result.reasons.includes('THROTTLED_RUN_COUNT_EXCEEDED'));
  assert.ok(result.reasons.includes('PEAK_HOST_MEMORY_REGRESSION_EXCEEDED'));
  assert.ok(
    result.reasons.includes(
      'PEAK_ACCELERATOR_MEMORY_REGRESSION_EXCEEDED',
    ),
  );
});

test('non-mobile power/network and impossible battery evidence fail exact schema',async()=>{
  const f=await fixture();
  for(const record of [
    evidenceRecord(f.m,{deviceClass:'DESKTOP'}),
    evidenceRecord(f.m,{powerSource:'CHARGING'}),
    evidenceRecord(f.m,{networkBytesDuringExecution:1}),
    evidenceRecord(f.m,{batteryStartBps:7000,batteryEndBps:7100}),
  ]){
    const set=rawEvidenceSet(f.m,{records:[record]});
    assert.throws(
      ()=>normalizeHsmeRealMobileDeviceEvidenceSetV1(set),
    );
  }
});

test('authority widening and unknown post-hoc fields fail exact policy/evidence schema',async()=>{
  const f=await fixture();

  assert.throws(
    ()=>normalizeHsmeRealMobileQualificationPolicyV1({
      ...f.policy,
      modelInstallAllowed:true,
    }),
  );
  assert.throws(
    ()=>normalizeHsmeRealMobileQualificationPolicyV1({
      ...f.policy,
      weightedThermalScore:0.5,
    }),
  );
  assert.throws(
    ()=>normalizeHsmeRealMobileDeviceEvidenceSetV1({
      ...f.evidenceSet,
      providerAuthorityGranted:true,
    }),
  );
  assert.throws(
    ()=>normalizeHsmeRealMobileDeviceEvidenceSetV1({
      ...f.evidenceSet,
      records:[
        {
          ...f.evidenceSet.records[0],
          syntheticDevice:true,
        },
      ],
    }),
  );
});

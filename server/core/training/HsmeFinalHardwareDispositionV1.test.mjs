import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA,
} from './HsmeDenseBaselineFinalizationV1.ts';
import {
  HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
} from './HsmeHardwareRepresentationQualificationRosterV1.ts';
import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA,
} from './HsmeRealMobileQualificationV1.ts';
import {
  HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1_SCHEMA,
  decideHsmeFinalHardwareDispositionV1,
  evaluateHsmeFinalHardwareCandidateV1,
  hsmeFinalHardwareDispositionPolicyV1Digest,
  normalizeHsmeFinalHardwareDispositionPolicyV1,
  rollupHsmeFinalHardwareArchitectureDispositionV1,
} from './HsmeFinalHardwareDispositionV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    productionAdmissionAllowed:false,
    candidateSelectionAllowed:false,
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

function representation(candidateId,bytes,sourceCh,overrides={}){
  return {
    candidateId,
    logicalModelFamily:
      candidateId==='dense-control'
        ?'bers-dense-mobile-v1'
        :'bers-hsme-mobile-v1',
    sourceModelContentSha256:h(sourceCh),
    fleetModelId:'fleet-'+candidateId,
    fleetVersion:'1.0.0',
    representationContentSha256:h(
      candidateId==='dense-control'?'3':'4',
    ),
    representationManifestSha256:h('5'),
    representationBytes:bytes,
    runtimeIdentity:'mobile-runtime-v1',
    formatIdentity:'mobile-format-v1',
    platformFamily:'ANDROID',
    hardwareBackend:'NPU',
    precisionTier:'MIXED',
    supportedDeviceClass:'snapdragon-8-gen-3-mobile',
    admissibleBenchmarkPlacements:['NPU'],
    runtimeCapabilityEvidenceSha256:h('6'),
    licenseProvenanceEvidenceSha256:h('7'),
    immutableFleetManifestEvidenceSha256:h('8'),
    representationReadyForBenchmark:true,
    ...overrides,
  };
}

function row(candidateId,patch={}){
  const dense=candidateId==='dense-control';
  return {
    candidateId,
    fleetModelId:'fleet-'+candidateId,
    fleetVersion:'1.0.0',
    representationContentSha256:h(dense?'3':'4'),
    runtimeIdentity:'mobile-runtime-v1',
    formatIdentity:'mobile-format-v1',
    platformFamily:'ANDROID',
    supportedDeviceClass:'snapdragon-8-gen-3-mobile',
    requestedPlacement:'NPU',
    actualPlacement:'NPU',
    runtimeFallbackUsed:false,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    coldLatencyUs:dense?1_200_000:900_000,
    warmLatencyUs:dense?1_000_000:750_000,
    activeRepresentationBytes:dense?750_000_000:550_000_000,
    peakHostMemoryBytes:dense?1_000_000_000:900_000_000,
    peakAcceleratorMemoryBytes:dense?800_000_000:720_000_000,
    flashBytesMoved:dense?500_000_000:380_000_000,
    ramBytesMoved:dense?600_000_000:450_000_000,
    acceleratorBytesMoved:dense?400_000_000:300_000_000,
    networkBytesDuringExecution:0,
    measurementMethodSha256:h('9'),
    measurementEvidenceSha256:h(dense?'a':'b'),
    realTargetDeviceMeasurement:true,
    ...patch,
  };
}

function mobile(candidateId,patch={}){
  const dense=candidateId==='dense-control';
  return {
    candidateId,
    requestedPlacement:'NPU',
    supportedDeviceClass:'snapdragon-8-gen-3-mobile',
    platformFamily:'ANDROID',
    qualification:'QUALIFIED',
    reasons:[],
    repeatedRunCount:10,
    repeatedWarmLatencyP50Us:dense?1_010_000:760_000,
    repeatedWarmLatencyP95Us:dense?1_050_000:790_000,
    energyMicroJoulesPerRun:dense?1_000_000_000:900_000_000,
    batteryDrainBps:dense?300:250,
    thermalPeakState:'ELEVATED',
    throttledRunCount:0,
    peakHostMemoryBytes:dense?1_020_000_000:920_000_000,
    peakAcceleratorMemoryBytes:dense?810_000_000:730_000_000,
    flashBytesMoved:dense?510_000_000:390_000_000,
    ramBytesMoved:dense?610_000_000:460_000_000,
    acceleratorBytesMoved:dense?410_000_000:310_000_000,
    physicalDeviceAttestationSha256:h('c'),
    deviceHardwareProfileSha256:h('d'),
    measurementMethodSha256:h('e'),
    batteryMeasurementEvidenceSha256:h('f'),
    thermalMeasurementEvidenceSha256:h('1'),
    ...patch,
  };
}

function rawPolicy(overrides={}){
  return {
    schemaVersion:HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1_SCHEMA,
    denseBaselineFinalizationSha256:h('1'),
    hardwareRepresentationRosterSha256:h('2'),
    hardwarePlacementMatrixSha256:h('3'),
    realMobileQualificationSha256:h('4'),
    denseControlCandidateId:'dense-control',
    denseControlPlacement:'NPU',
    denseLogicalModelFamily:'bers-dense-mobile-v1',
    targetDeviceClass:'snapdragon-8-gen-3-mobile',
    candidates:[
      {
        candidateId:'hsme-candidate',
        requestedPlacement:'NPU',
        expectedLogicalModelFamily:'bers-hsme-mobile-v1',
      },
    ],
    qualityFloors:[
      {dimension:'ANATOMY_ARTIFACT',minimumBps:9400},
      {dimension:'GARMENT_LOGO_PATTERN',minimumBps:9400},
      {dimension:'IDENTITY_PERSON',minimumBps:9400},
      {dimension:'NON_TARGET_PRESERVATION',minimumBps:9400},
      {dimension:'SEMANTIC_ADHERENCE',minimumBps:9300},
    ],
    maxQualityRegressionVsDense:[
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
    minWarmLatencyImprovementBps:1000,
    minTotalBytesMovedImprovementBps:1000,
    minInstalledBytesImprovementBps:1000,
    minActiveRepresentationBytesImprovementBps:1000,
    maxPeakHostMemoryRegressionBps:500,
    maxPeakAcceleratorMemoryRegressionBps:500,
    maxEnergyRegressionBps:500,
    maxBatteryDrainRegressionBps:500,
    maxThermalRegressionSteps:0,
    maxThrottledRunRegressionCount:0,
    reviewState:'FINAL_HARDWARE_DISPOSITION_POLICY_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

function evaluated(overrides={}){
  const policy=normalizeHsmeFinalHardwareDispositionPolicyV1(
    overrides.policy??rawPolicy(),
  );
  return evaluateHsmeFinalHardwareCandidateV1(
    overrides.denseCandidate??
      representation('dense-control',800_000_000,'1'),
    overrides.candidate??
      representation('hsme-candidate',600_000_000,'2'),
    overrides.denseRow??row('dense-control'),
    overrides.candidateRow??row('hsme-candidate'),
    overrides.denseMobile??mobile('dense-control'),
    overrides.candidateMobile??mobile('hsme-candidate'),
    policy,
  );
}

test('quality-preserving real-mobile efficient candidate advances',()=>{
  const result=evaluated();

  assert.equal(result.disposition,'ADVANCE');
  assert.equal(result.hardRejected,false);
  assert.equal(result.qualityEligible,true);
  assert.equal(result.mobileQualified,true);
  assert.equal(result.efficiencyEligible,true);
  assert.deepEqual(result.reasons,[]);
  assert.equal(result.denseInstalledBytes,800_000_000);
  assert.equal(result.candidateInstalledBytes,600_000_000);
});

test('speed storage and energy cannot rescue quality regression',()=>{
  const result=evaluated({
    candidateRow:row('hsme-candidate',{
      qualityVector:quality({GARMENT_LOGO_PATTERN:9000}),
      warmLatencyUs:300_000,
      flashBytesMoved:100_000_000,
      ramBytesMoved:100_000_000,
      acceleratorBytesMoved:100_000_000,
    }),
    candidate:representation(
      'hsme-candidate',
      300_000_000,
      '2',
    ),
    candidateMobile:mobile('hsme-candidate',{
      energyMicroJoulesPerRun:300_000_000,
      batteryDrainBps:100,
    }),
  });

  assert.equal(result.disposition,'REDESIGN');
  assert.equal(result.qualityEligible,false);
  assert.equal(result.efficiencyEligible,false);
  assert.ok(
    result.reasons.some(value=>
      value==='QUALITY_FLOOR_FAILED:GARMENT_LOGO_PATTERN'
      ||value===
        'DENSE_QUALITY_REGRESSION_EXCEEDED:GARMENT_LOGO_PATTERN'
    ),
  );
});

test('hard preservation or critical failure rejects the candidate',()=>{
  for(const candidateRow of [
    row('hsme-candidate',{
      hardPreservationFailureCounts:
        hard({NON_TARGET_PRESERVATION:1}),
    }),
    row('hsme-candidate',{criticalFailureCount:1}),
  ]){
    const result=evaluated({candidateRow});
    assert.equal(result.disposition,'REJECT');
    assert.equal(result.hardRejected,true);
    assert.equal(result.efficiencyEligible,false);
  }
});

test('real-mobile rejection cannot be rescued by efficient placement metrics',()=>{
  const result=evaluated({
    candidateMobile:mobile('hsme-candidate',{
      qualification:'REJECTED',
      reasons:['THERMAL_STATE_EXCEEDED'],
    }),
  });

  assert.equal(result.disposition,'REDESIGN');
  assert.equal(result.qualityEligible,true);
  assert.equal(result.mobileQualified,false);
  assert.equal(result.efficiencyEligible,false);
  assert.ok(
    result.reasons.includes('REAL_MOBILE_QUALIFICATION_REJECTED'),
  );
});

test('real device efficiency gates independently force REDESIGN after quality pass',()=>{
  const cases=[
    [
      {candidateRow:row('hsme-candidate',{warmLatencyUs:950_000})},
      'WARM_LATENCY_IMPROVEMENT_INSUFFICIENT',
    ],
    [
      {
        candidateRow:row('hsme-candidate',{
          flashBytesMoved:490_000_000,
          ramBytesMoved:590_000_000,
          acceleratorBytesMoved:390_000_000,
        }),
      },
      'TOTAL_BYTES_MOVED_IMPROVEMENT_INSUFFICIENT',
    ],
    [
      {
        candidate:representation(
          'hsme-candidate',
          760_000_000,
          '2',
        ),
      },
      'INSTALLED_BYTES_IMPROVEMENT_INSUFFICIENT',
    ],
    [
      {
        candidateRow:row('hsme-candidate',{
          activeRepresentationBytes:700_000_000,
        }),
      },
      'ACTIVE_BYTES_IMPROVEMENT_INSUFFICIENT',
    ],
    [
      {
        candidateRow:row('hsme-candidate',{
          peakHostMemoryBytes:1_100_000_000,
        }),
      },
      'PEAK_HOST_MEMORY_REGRESSION_EXCEEDED',
    ],
    [
      {
        candidateRow:row('hsme-candidate',{
          peakAcceleratorMemoryBytes:900_000_000,
        }),
      },
      'PEAK_ACCELERATOR_MEMORY_REGRESSION_EXCEEDED',
    ],
    [
      {
        candidateMobile:mobile('hsme-candidate',{
          energyMicroJoulesPerRun:1_100_000_000,
        }),
      },
      'ENERGY_REGRESSION_EXCEEDED',
    ],
    [
      {
        candidateMobile:mobile('hsme-candidate',{
          batteryDrainBps:400,
        }),
      },
      'BATTERY_DRAIN_REGRESSION_EXCEEDED',
    ],
    [
      {
        candidateMobile:mobile('hsme-candidate',{
          thermalPeakState:'HIGH',
        }),
      },
      'THERMAL_REGRESSION_EXCEEDED',
    ],
    [
      {
        candidateMobile:mobile('hsme-candidate',{
          throttledRunCount:1,
        }),
      },
      'THROTTLED_RUN_REGRESSION_EXCEEDED',
    ],
  ];

  for(const [overrides,reason] of cases){
    const result=evaluated(overrides);
    assert.equal(result.disposition,'REDESIGN');
    assert.equal(result.qualityEligible,true);
    assert.equal(result.mobileQualified,true);
    assert.equal(result.efficiencyEligible,false);
    assert.ok(result.reasons.includes(reason));
  }
});

test('architecture rollup advances on any advance rejects only when all reject',()=>{
  const advance=evaluated();
  const redesign={...advance,disposition:'REDESIGN'};
  const reject={...advance,disposition:'REJECT'};

  assert.equal(
    rollupHsmeFinalHardwareArchitectureDispositionV1(
      [redesign,advance,reject],
    ),
    'ADVANCE',
  );
  assert.equal(
    rollupHsmeFinalHardwareArchitectureDispositionV1(
      [reject,reject],
    ),
    'REJECT',
  );
  assert.equal(
    rollupHsmeFinalHardwareArchitectureDispositionV1(
      [reject,redesign],
    ),
    'REDESIGN',
  );
});

test('policy digest is deterministic and forbids weighted score or authority widening',async()=>{
  const policy=rawPolicy();
  const first=await hsmeFinalHardwareDispositionPolicyV1Digest(
    policy,
    hash,
  );
  const second=await hsmeFinalHardwareDispositionPolicyV1Digest(
    {
      ...policy,
      candidates:[...policy.candidates].reverse(),
      qualityFloors:[...policy.qualityFloors].reverse(),
      maxQualityRegressionVsDense:
        [...policy.maxQualityRegressionVsDense].reverse(),
      maxHardPreservationFailures:
        [...policy.maxHardPreservationFailures].reverse(),
    },
    hash,
  );
  assert.equal(first,second);

  assert.throws(
    ()=>normalizeHsmeFinalHardwareDispositionPolicyV1({
      ...policy,
      weightedArchitectureScore:{quality:0.5,efficiency:0.5},
    }),
  );
  assert.throws(
    ()=>normalizeHsmeFinalHardwareDispositionPolicyV1({
      ...policy,
      modelInstallAllowed:true,
    }),
  );
});

test('top-level final disposition remains BLOCKED without real-mobile READY evidence',async()=>{
  const dense={
    schemaVersion:HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA,
    state:'DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED',
    disposition:'ADVANCE',
    blockers:[],
    decisionCandidate:{
      baselinePin:{contentSha256:h('1')},
    },
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
  };
  const roster={
    schemaVersion:
      HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
    state:'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED',
    blockers:[],
    rosterEvidenceSha256:h('2'),
    candidates:[
      representation('dense-control',800_000_000,'1'),
      representation('hsme-candidate',600_000_000,'2'),
    ],
    modelInstallAllowed:false,
    durableModelFleetPromotionAllowed:false,
  };
  const matrix={
    schemaVersion:HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
    state:'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    matrixEvidenceSha256:h('3'),
    rows:[row('dense-control'),row('hsme-candidate')],
    modelInstallAllowed:false,
    durableModelFleetPromotionAllowed:false,
  };
  const realMobile={
    schemaVersion:HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA,
    state:'REAL_MOBILE_QUALIFICATION_BLOCKED',
    blockers:['REAL_MOBILE_DEVICE_EVIDENCE_REQUIRED'],
    qualificationEvidenceSha256:'UNKNOWN',
    records:[],
    mobileBackendAdmissionAllowed:false,
    modelInstallAllowed:false,
    durableModelFleetPromotionAllowed:false,
  };

  const neverOrigin=new Proxy({},{
    get(){
      return async()=>{throw new Error('origin must not run while blocked');};
    },
  });

  const result=await decideHsmeFinalHardwareDispositionV1(
    dense,
    h('1'),
    roster,
    h('2'),
    matrix,
    h('3'),
    realMobile,
    h('4'),
    rawPolicy(),
    h('5'),
    neverOrigin,
    hash,
  );

  assert.equal(result.state,'FINAL_HARDWARE_DISPOSITION_BLOCKED');
  assert.ok(
    result.blockers.includes(
      'FINAL_HARDWARE_REAL_MOBILE_QUALIFICATION_REQUIRED',
    ),
  );
  assert.equal(result.architectureDisposition,'NONE');
  assert.equal(result.dispositionEvidenceSha256,'UNKNOWN');
});

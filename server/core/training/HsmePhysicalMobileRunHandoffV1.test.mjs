import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA,
  HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1,
  hsmePhysicalMobileCapturePlanV1Digest,
} from './HsmePhysicalMobileCapturePlanV1.ts';
import {
  HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1_SCHEMA,
  compileHsmePhysicalMobileRunHandoffV1,
  hsmePhysicalMobileRunHandoffV1Digest,
  hsmePhysicalMobileRunnerBindingV1Digest,
} from './HsmePhysicalMobileRunHandoffV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    physicalExecutionAllowed:false,
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

function planAuthority(){
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

async function plan(platformFamily='ANDROID'){
  const android=platformFamily==='ANDROID';
  const base={
    schemaVersion:HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA,
    state:'PHYSICAL_MOBILE_CAPTURE_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    hardwarePlacementMatrixSha256:h('1'),
    qualificationPolicySha256:h('2'),
    captureRequestSha256:h('3'),
    candidateId:android?'android-npu':'apple-npu',
    requestedPlacement:'NPU',
    supportedDeviceClass:
      android
        ?'snapdragon-8-gen-3-mobile'
        :'apple-a17-pro-mobile',
    platformFamily,
    fleetModelId:
      android?'bers-hsme-android-npu':'bers-hsme-apple-npu',
    fleetVersion:'1.0.0',
    representationContentSha256:android?h('4'):h('5'),
    placementMeasurementEvidenceSha256:android?h('6'):h('7'),
    runtimeIdentity:
      android?'litert-qnn-hexagon-v1':'coreml-metal-ane-v1',
    repeatedRunCount:7,
    requiredTelemetry:[
      ...HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1,
    ],
    requireBatteryPower:true,
    networkBytesDuringExecution:0,
    requireFoundationPhysicalBundle:true,
    requireIndependentNativeTelemetryAttestation:true,
    reviewedAtMs:1_000,
    expiresAtMs:10_000,
    capturePlanEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const capturePlanEvidenceSha256=
    await hsmePhysicalMobileCapturePlanV1Digest(base,hash);
  return {...base,capturePlanEvidenceSha256};
}

function rawBinding(p,overrides={}){
  return {
    schemaVersion:HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1_SCHEMA,
    capturePlanEvidenceSha256:p.capturePlanEvidenceSha256,
    runnerKind:
      p.platformFamily==='ANDROID'
        ?'ANDROID_NATIVE'
        :'IOS_NATIVE',
    nativeHarnessBuildSha256:h('8'),
    nativeBridgeBuildSha256:h('9'),
    nativeTelemetryVerifierKeyId:'hsme-native-telemetry-key-v1',
    physicalEvidenceVerifierKeyId:'hsme-physical-evidence-key-v1',
    outputSchemaVersion:'hsme-mobile-capture-v1',
    outputEnvelopeMode:'CONTENT_ADDRESSED_AFTER_CAPTURE',
    modelAcquisitionState:'PREINSTALLED_VERIFIED_ONLY',
    networkDuringExecutionAllowed:false,
    postHocCandidateSelectionAllowed:false,
    postHocPlacementSelectionAllowed:false,
    modelMutationAllowed:false,
    reviewedBeforeExecution:true,
    ...authority(),
    ...overrides,
  };
}

const truePlanOrigin={
  async verifyPhysicalMobileCapturePlan(){return true;},
};
const falsePlanOrigin={
  async verifyPhysicalMobileCapturePlan(){return false;},
};
const trueBindingOrigin={
  async verifyPhysicalMobileRunnerBinding(){return true;},
};
const falseBindingOrigin={
  async verifyPhysicalMobileRunnerBinding(){return false;},
};

async function fixture(platform='ANDROID'){
  const p=await plan(platform);
  const binding=rawBinding(p);
  const bindingSha=
    await hsmePhysicalMobileRunnerBindingV1Digest(
      binding,
      hash,
    );
  return {p,binding,bindingSha};
}

async function compile(f,overrides={}){
  const selectedPlan=overrides.plan??f.p;
  return compileHsmePhysicalMobileRunHandoffV1(
    selectedPlan,
    overrides.planSha??selectedPlan.capturePlanEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.binding??f.binding,
    overrides.bindingSha??f.bindingSha,
    overrides.bindingOrigin??trueBindingOrigin,
    hash,
  );
}

test('android frozen plan compiles immutable non-executing native handoff',async()=>{
  const f=await fixture('ANDROID');
  const handoff=await compile(f);

  assert.equal(
    handoff.state,
    'PHYSICAL_MOBILE_RUN_HANDOFF_READY_NOT_EXECUTED',
  );
  assert.deepEqual(handoff.blockers,[]);
  assert.equal(handoff.candidateId,'android-npu');
  assert.equal(handoff.requestedPlacement,'NPU');
  assert.equal(handoff.runnerKind,'ANDROID_NATIVE');
  assert.equal(
    handoff.modelAcquisitionState,
    'PREINSTALLED_VERIFIED_ONLY',
  );
  assert.equal(handoff.networkDuringExecutionAllowed,false);
  assert.equal(handoff.expectedFoundationPhysicalBundle,true);
  assert.equal(handoff.expectedNativeEnergyThermalEvidence,true);
  assert.equal(handoff.physicalExecutionAllowed,false);
  assert.equal(handoff.modelInstallAllowed,false);
  assert.equal(handoff.durableModelFleetPromotionAllowed,false);
  assert.equal(
    await hsmePhysicalMobileRunHandoffV1Digest(
      handoff,
      hash,
    ),
    handoff.handoffEvidenceSha256,
  );
});

test('ios plan requires IOS_NATIVE and preserves exact Apple identity',async()=>{
  const f=await fixture('APPLE');
  const handoff=await compile(f);

  assert.equal(
    handoff.state,
    'PHYSICAL_MOBILE_RUN_HANDOFF_READY_NOT_EXECUTED',
  );
  assert.equal(handoff.runnerKind,'IOS_NATIVE');
  assert.equal(handoff.platformFamily,'APPLE');
  assert.equal(handoff.candidateId,'apple-npu');
  assert.equal(
    handoff.supportedDeviceClass,
    'apple-a17-pro-mobile',
  );
});

test('plan and runner-binding origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await compile(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID');
  assert.ok(
    a.blockers.includes(
      'PHYSICAL_MOBILE_RUN_HANDOFF_PLAN_ORIGIN_UNVERIFIED',
    ),
  );

  const b=await compile(f,{bindingOrigin:falseBindingOrigin});
  assert.equal(b.state,'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID');
  assert.ok(
    b.blockers.includes(
      'PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_ORIGIN_UNVERIFIED',
    ),
  );
});

test('platform and native runner kind cannot drift',async()=>{
  const f=await fixture('ANDROID');
  const binding=rawBinding(f.p,{runnerKind:'IOS_NATIVE'});
  const bindingSha=
    await hsmePhysicalMobileRunnerBindingV1Digest(
      binding,
      hash,
    );
  const result=await compile(f,{binding,bindingSha});

  assert.equal(result.state,'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID');
  assert.ok(
    result.blockers.includes(
      'PHYSICAL_MOBILE_RUN_HANDOFF_PLATFORM_RUNNER_MISMATCH',
    ),
  );
});

test('runner binding must pin the exact capture plan digest',async()=>{
  const f=await fixture();
  const binding=rawBinding(f.p,{
    capturePlanEvidenceSha256:h('f'),
  });
  const bindingSha=
    await hsmePhysicalMobileRunnerBindingV1Digest(
      binding,
      hash,
    );
  const result=await compile(f,{binding,bindingSha});

  assert.equal(result.state,'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID');
  assert.ok(
    result.blockers.includes(
      'PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_PLAN_MISMATCH',
    ),
  );
});

test('preinstalled-only zero-network no-post-hoc laws are immutable',async()=>{
  const f=await fixture();

  for(const binding of [
    {...f.binding,modelAcquisitionState:'DOWNLOAD_IF_MISSING'},
    {...f.binding,networkDuringExecutionAllowed:true},
    {...f.binding,postHocCandidateSelectionAllowed:true},
    {...f.binding,postHocPlacementSelectionAllowed:true},
    {...f.binding,modelMutationAllowed:true},
    {...f.binding,physicalExecutionAllowed:true},
    {...f.binding,providerAuthorityGranted:true},
  ]){
    const result=await compile(f,{
      binding,
      bindingSha:h('0'),
    });
    assert.equal(result.state,'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID');
    assert.ok(
      result.blockers.includes(
        'PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_INVALID',
      ),
    );
  }
});

test('mutable URI account and provider fields fail exact binding schema',async()=>{
  const f=await fixture();

  for(const extra of [
    {downloadUri:'https://mutable.example/model.bin'},
    {providerId:'paid-cloud-provider'},
    {accountId:'device-user-account'},
  ]){
    const binding={...f.binding,...extra};
    const result=await compile(f,{
      binding,
      bindingSha:h('0'),
    });
    assert.equal(result.state,'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID');
    assert.ok(
      result.blockers.includes(
        'PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_INVALID',
      ),
    );
  }
});

test('non-frozen capture plan remains BLOCKED',async()=>{
  const f=await fixture();
  const plan={
    ...f.p,
    state:'PHYSICAL_MOBILE_CAPTURE_PLAN_BLOCKED',
    blockers:['PHYSICAL_DEVICE_REQUIRED'],
    capturePlanEvidenceSha256:'UNKNOWN',
  };
  const result=await compile(f,{plan});

  assert.equal(result.state,'PHYSICAL_MOBILE_RUN_HANDOFF_BLOCKED');
  assert.ok(
    result.blockers.includes(
      'PHYSICAL_MOBILE_RUN_HANDOFF_FROZEN_PLAN_REQUIRED',
    ),
  );
});

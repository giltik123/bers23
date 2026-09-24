import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA,
  hsmeAdapterMoePrototypeRosterV1Digest,
} from './HsmeAdapterMoePrototypeRosterV1.ts';
import {
  HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1_SCHEMA,
  HSME_ADAPTIVE_RESIDENCY_POLICY_V1_SCHEMA,
  freezeHsmeAdaptiveResidencyExperimentPlanV1,
  hsmeAdaptiveResidencyDeviceProfileV1Digest,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  hsmeAdaptiveResidencyPolicyV1Digest,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
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
async function roster(){
  const prototypes=[
    {
      variant:'SHARED_TOP1_ADAPTER',
      routerKind:'TASK_COARSE_STATIC',
      routerContentSha256:h('1'),
      routerConfigSha256:h('2'),
      routerBytes:10_000_000,
      routerUri:'bers://router/top1',
      routerRevision:'3'.repeat(40),
      routerToolchainSha256:h('4'),
      routerLicense:'synthetic',
      routerLicenseEvidenceSha256:h('5'),
      expertIds:['fashion-adapter-v1'],
      expertManifestSha256s:[h('6')],
      expertContentSha256s:[h('7')],
      maxActiveExperts:1,
      sharedPathRequired:true,
      deterministicReplayRequired:true,
      fullBackboneExpertAllowed:false,
      denseBaselinePackageBytes:700_000_000,
      totalExpertArtifactBytes:100_000_000,
      packageBytes:810_000_000,
      assemblyAttestationSha256:h('8'),
      prototypeSha256:h('9'),
    },
    {
      variant:'SHARED_TOP2_ADAPTER',
      routerKind:'BLOCK_COARSE_STATIC',
      routerContentSha256:h('a'),
      routerConfigSha256:h('b'),
      routerBytes:12_000_000,
      routerUri:'bers://router/top2',
      routerRevision:'c'.repeat(40),
      routerToolchainSha256:h('d'),
      routerLicense:'synthetic',
      routerLicenseEvidenceSha256:h('e'),
      expertIds:['fashion-adapter-v1'],
      expertManifestSha256s:[h('6')],
      expertContentSha256s:[h('7')],
      maxActiveExperts:2,
      sharedPathRequired:true,
      deterministicReplayRequired:true,
      fullBackboneExpertAllowed:false,
      denseBaselinePackageBytes:700_000_000,
      totalExpertArtifactBytes:100_000_000,
      packageBytes:812_000_000,
      assemblyAttestationSha256:h('f'),
      prototypeSha256:h('0'),
    },
  ];
  const base={
    schemaVersion:HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA,
    state:'ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED',
    blockers:[],
    experimentPlanSha256:h('1'),
    expertPackSetSha256:h('2'),
    denseBaselineDecisionSha256:h('3'),
    denseBaselineContentSha256:h('4'),
    denseBaselinePackageBytes:700_000_000,
    realEvidenceSha256s:[h('5')],
    prototypes,
    rosterEvidenceSha256:h('6'),
    ...authority(),
  };
  const rosterEvidenceSha256=await hsmeAdapterMoePrototypeRosterV1Digest(base,hash);
  return {...base,rosterEvidenceSha256};
}
function profile(overrides={}){
  return {
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_DEVICE_PROFILE_V1_SCHEMA,
    profileId:'synthetic-device-profile-001',
    hardwareClass:'SYNTHETIC_MOBILE_ACCELERATOR',
    runtimeRepresentationSha256:h('1'),
    measurementEnvironmentSha256:h('2'),
    measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,
    physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,
    thermalClass:'SYNTHETIC_THERMAL',
    batteryClass:'SYNTHETIC_BATTERY',
    realMeasuredEvidence:true,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    productionAuthorityGranted:false,
    ...overrides,
  };
}
function policy(rosterSha,prototypeSha,overrides={}){
  return {
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_POLICY_V1_SCHEMA,
    prototypeRosterSha256:rosterSha,
    prototypeSha256:prototypeSha,
    maxRamBudgetBytes:2_000_000_000,
    maxAcceleratorBudgetBytes:2_000_000_000,
    maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:200_000_000,
    maxPredictivePrefetchBytesPerStage:100_000_000,
    maxPredictionLookaheadStages:2,
    maxConcurrentTransfers:2,
    evictionPolicy:'USAGE_AWARE_LRU_BOUNDED',
    deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,
    doubleBufferingAllowed:true,
    networkDuringExecutionAllowed:false,
    maxWastedPrefetchRatioBps:1500,
    movementExecutionAllowed:false,
    ...authority(),
    ...overrides,
  };
}
const trueRosterOrigin={async verifyPrototypeRoster(){return true;}};
const falseRosterOrigin={async verifyPrototypeRoster(){return false;}};
const trueProfileOrigin={async verifyDeviceProfile(){return true;}};
const falseProfileOrigin={async verifyDeviceProfile(){return false;}};
const truePolicyOrigin={async verifyResidencyPolicy(){return true;}};

async function fixture(){
  const r=await roster();
  const p=profile();
  const pSha=await hsmeAdaptiveResidencyDeviceProfileV1Digest(p,hash);
  const pol=policy(r.rosterEvidenceSha256,r.prototypes[0].prototypeSha256);
  const polSha=await hsmeAdaptiveResidencyPolicyV1Digest(pol,hash);
  return {r,p,pSha,pol,polSha};
}
async function freeze(f,overrides={}){
  return freezeHsmeAdaptiveResidencyExperimentPlanV1(
    f.r,
    f.r.rosterEvidenceSha256,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.prototypeSha??f.r.prototypes[0].prototypeSha256,
    overrides.profile??f.p,
    overrides.profileSha??f.pSha,
    overrides.profileOrigin??trueProfileOrigin,
    overrides.policy??f.pol,
    overrides.policySha??f.polSha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

test('measured device profile and reviewed policy freeze deterministic no-execution plan',async()=>{
  const f=await fixture();
  const first=await freeze(f);
  const second=await freeze(f);
  assert.equal(first.state,'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED');
  assert.equal(first.prototypeVariant,'SHARED_TOP1_ADAPTER');
  assert.equal(first.prototypePackageBytes,810_000_000);
  assert.equal(first.maxRamBudgetBytes,2_000_000_000);
  assert.equal(first.predictivePrefetchAllowed,true);
  assert.equal(first.doubleBufferingAllowed,true);
  assert.ok(first.telemetryDimensions.includes('WASTED_PREFETCH_BYTES'));
  assert.ok(first.telemetryDimensions.includes('NETWORK_BYTES_DURING_EXECUTION'));
  assert.equal(first.movementExecutionAllowed,false);
  assert.equal(first.inferenceExecutionAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdaptiveResidencyExperimentPlanV1Digest(first,hash),
    first.planEvidenceSha256,
  );
});

test('prototype must belong to exact trusted ready roster',async()=>{
  const f=await fixture();
  const untrusted=await freeze(f,{rosterOrigin:falseRosterOrigin});
  assert.equal(untrusted.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
  assert.ok(untrusted.blockers.includes('ADAPTIVE_RESIDENCY_ROSTER_ORIGIN_UNVERIFIED'));
  const missing=await freeze(f,{prototypeSha:h('f')});
  assert.equal(missing.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
  assert.ok(missing.blockers.includes('ADAPTIVE_RESIDENCY_PROTOTYPE_NOT_IN_ROSTER'));
});

test('device profile exact origin and real-measured marker are mandatory',async()=>{
  const f=await fixture();
  const untrusted=await freeze(f,{profileOrigin:falseProfileOrigin});
  assert.equal(untrusted.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
  const synthetic=profile({realMeasuredEvidence:false});
  const result=await freeze(f,{profile:synthetic,profileSha:h('0')});
  assert.equal(result.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
  assert.ok(result.blockers.includes('ADAPTIVE_RESIDENCY_DEVICE_PROFILE_INVALID'));
});

test('RAM accelerator and storage caps cannot exceed measured physical limits',async()=>{
  const f=await fixture();
  for(const overrides of [
    {maxRamBudgetBytes:f.p.physicalRamBytes+1},
    {maxAcceleratorBudgetBytes:f.p.physicalAcceleratorBytes+1},
    {maxColdStorageCacheBytes:f.p.availableStorageBytes+1},
  ]){
    const pol=policy(
      f.r.rosterEvidenceSha256,
      f.r.prototypes[0].prototypeSha256,
      overrides,
    );
    const polSha=await hsmeAdaptiveResidencyPolicyV1Digest(pol,hash);
    const result=await freeze(f,{policy:pol,policySha:polSha});
    assert.equal(result.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
    assert.ok(result.blockers.includes('ADAPTIVE_RESIDENCY_POLICY_PHYSICAL_BUDGET_EXCEEDED'));
  }
});

test('predictive prefetch cannot exceed deterministic safety cap or exist while disabled',async()=>{
  const f=await fixture();
  for(const overrides of [
    {maxPredictivePrefetchBytesPerStage:200_000_001},
    {
      predictivePrefetchAllowed:false,
      maxPredictivePrefetchBytesPerStage:1,
      maxPredictionLookaheadStages:0,
    },
  ]){
    const pol=policy(
      f.r.rosterEvidenceSha256,
      f.r.prototypes[0].prototypeSha256,
      overrides,
    );
    const result=await freeze(f,{policy:pol,policySha:h('0')});
    assert.equal(result.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
    assert.ok(result.blockers.includes('ADAPTIVE_RESIDENCY_POLICY_INVALID'));
  }
});

test('network during execution and authority widening are rejected by exact policy schema',async()=>{
  const f=await fixture();
  for(const overrides of [
    {networkDuringExecutionAllowed:true},
    {movementExecutionAllowed:true},
    {providerAuthorityGranted:true},
  ]){
    const pol=policy(
      f.r.rosterEvidenceSha256,
      f.r.prototypes[0].prototypeSha256,
      overrides,
    );
    const result=await freeze(f,{policy:pol,policySha:h('0')});
    assert.equal(result.state,'ADAPTIVE_RESIDENCY_PLAN_INVALID');
  }
});

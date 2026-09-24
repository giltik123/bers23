import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  HSME_DENSE_BLOCK_PROFILE_ROSTER_V1_SCHEMA,
  HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1_SCHEMA,
  freezeHsmeSelectiveSparseBlockPlanV1,
  hsmeDenseBlockProfileRosterV1Digest,
  hsmeSelectiveSparseBlockPlanV1Digest,
  hsmeSelectiveSparseBlockPolicyV1Digest,
} from './HsmeSelectiveSparseBlockPlanV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function planAuthority(){
  return {
    movementExecutionAllowed:false,inferenceExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
async function residencyPlan(){
  const base={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED',blockers:[],
    prototypeRosterSha256:h('1'),prototypeSha256:h('2'),
    prototypeVariant:'SHARED_TOP1_ADAPTER',
    denseBaselineContentSha256:h('3'),routerContentSha256:h('4'),
    expertIds:['fashion-adapter-v1'],expertContentSha256s:[h('5')],
    maxActiveExperts:1,denseBaselinePackageBytes:700_000_000,
    totalExpertArtifactBytes:80_000_000,routerBytes:10_000_000,
    prototypePackageBytes:790_000_000,deviceProfileSha256:h('6'),
    policySha256:h('7'),hardwareClass:'SYNTHETIC_MOBILE',
    runtimeRepresentationSha256:h('8'),measurementEnvironmentSha256:h('9'),
    measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,maxRamBudgetBytes:2_000_000_000,
    maxAcceleratorBudgetBytes:1_000_000_000,maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:200_000_000,
    maxPredictivePrefetchBytesPerStage:100_000_000,maxPredictionLookaheadStages:2,
    maxConcurrentTransfers:2,deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,doubleBufferingAllowed:true,
    maxWastedPrefetchRatioBps:1500,telemetryDimensions:['FLASH_READ_BYTES'],
    planEvidenceSha256:h('0'),...planAuthority(),
  };
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
function roster(plan,overrides={}){
  return {
    schemaVersion:HSME_DENSE_BLOCK_PROFILE_ROSTER_V1_SCHEMA,
    residencyPlanSha256:plan.planEvidenceSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,totalDenseCoreWallClockUs:1000,
    profiles:[
      {
        blockId:'block-early',denseBlockContentSha256:h('a'),
        blockArchitectureSha256:h('b'),inputOutputContractSha256:h('c'),
        denseWeightsBytes:100_000_000,denseActiveWeightsBytes:100_000_000,
        denseActivationBytes:20_000_000,denseWallClockUs:300,
        denseFlashBytesMoved:100_000_000,denseRamBytesMoved:120_000_000,
        denseAcceleratorBytesMoved:100_000_000,denseKernelDispatchCount:8,
        densePeakMemoryBytes:180_000_000,qualitySensitivityEvidenceSha256:h('d'),
        runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
        hardwareClass:plan.hardwareClass,
      },
      {
        blockId:'block-late',denseBlockContentSha256:h('e'),
        blockArchitectureSha256:h('f'),inputOutputContractSha256:h('1'),
        denseWeightsBytes:90_000_000,denseActiveWeightsBytes:90_000_000,
        denseActivationBytes:18_000_000,denseWallClockUs:200,
        denseFlashBytesMoved:90_000_000,denseRamBytesMoved:100_000_000,
        denseAcceleratorBytesMoved:90_000_000,denseKernelDispatchCount:7,
        densePeakMemoryBytes:160_000_000,qualitySensitivityEvidenceSha256:h('2'),
        runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
        hardwareClass:plan.hardwareClass,
      },
    ],
    realMeasuredEvidence:true,conversionExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,...overrides,
  };
}
function policy(plan,rosterSha,overrides={}){
  return {
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_POLICY_V1_SCHEMA,
    residencyPlanSha256:plan.planEvidenceSha256,
    blockProfileRosterSha256:rosterSha,
    candidateBlockIds:['block-early','block-late'],
    maxConvertedBlockCount:2,maxExpertsPerConvertedBlock:4,
    maxActiveExpertsPerBlock:2,maxRouterBytes:5_000_000,
    maxSparseBlockPackageBytes:140_000_000,
    qualityPreservationContractSha256:h('3'),
    minDenseWallClockShareBps:1500,fullBackboneExpertAllowed:false,
    conversionExecutionAllowed:false,blockExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,...overrides,
  };
}
const truePlanOrigin={async verifyResidencyPlan(){return true;}};
const falsePlanOrigin={async verifyResidencyPlan(){return false;}};
const trueRosterOrigin={async verifyBlockProfileRoster(){return true;}};
const falseRosterOrigin={async verifyBlockProfileRoster(){return false;}};
const truePolicyOrigin={async verifySparseBlockPolicy(){return true;}};

async function fixture(){
  const p=await residencyPlan();
  const r=roster(p);
  const rSha=await hsmeDenseBlockProfileRosterV1Digest(r,hash);
  const pol=policy(p,rSha);
  const polSha=await hsmeSelectiveSparseBlockPolicyV1Digest(pol,hash);
  return {p,r,rSha,pol,polSha};
}
async function freeze(f,overrides={}){
  return freezeHsmeSelectiveSparseBlockPlanV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    overrides.roster??f.r,overrides.rosterSha??f.rSha,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.policy??f.pol,overrides.policySha??f.polSha,
    truePolicyOrigin,hash,
  );
}

test('measured candidate blocks freeze deterministic no-execution sparse plan',async()=>{
  const f=await fixture();
  const a=await freeze(f),b=await freeze(f);
  assert.equal(a.state,'SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED');
  assert.deepEqual(a.candidateProfiles.map(v=>v.blockId),['block-early','block-late']);
  assert.equal(a.totalDenseCoreWallClockUs,1000);
  assert.equal(a.maxExpertsPerConvertedBlock,4);
  assert.equal(a.maxActiveExpertsPerBlock,2);
  assert.equal(a.conversionExecutionAllowed,false);
  assert.equal(a.blockExecutionAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeSelectiveSparseBlockPlanV1Digest(a,hash),
    a.planEvidenceSha256,
  );
});

test('residency plan and block-profile roster trusted origins are mandatory',async()=>{
  const f=await fixture();
  const a=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID');
  assert.ok(a.blockers.includes('SELECTIVE_SPARSE_BLOCK_RESIDENCY_PLAN_ORIGIN_UNVERIFIED'));
  const b=await freeze(f,{rosterOrigin:falseRosterOrigin});
  assert.equal(b.state,'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID');
  assert.ok(b.blockers.includes('SELECTIVE_SPARSE_BLOCK_PROFILE_ROSTER_ORIGIN_UNVERIFIED'));
});

test('block profile dense runtime and hardware identities cannot drift',async()=>{
  const f=await fixture();
  const r=roster(f.p,{
    denseBaselineContentSha256:h('f'),
  });
  const rSha=await hsmeDenseBlockProfileRosterV1Digest(r,hash);
  const result=await freeze(f,{roster:r,rosterSha:rSha});
  assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID');
  assert.ok(result.blockers.includes('SELECTIVE_SPARSE_BLOCK_PROFILE_ROSTER_BINDING_MISMATCH'));
});

test('candidate block must be measured and exceed frozen wall-clock share floor',async()=>{
  const f=await fixture();
  const unknown=policy(f.p,f.rSha,{candidateBlockIds:['not-profiled']});
  const unknownSha=await hsmeSelectiveSparseBlockPolicyV1Digest(unknown,hash);
  const a=await freeze(f,{policy:unknown,policySha:unknownSha});
  assert.equal(a.state,'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID');
  assert.ok(a.blockers.includes('SELECTIVE_SPARSE_BLOCK_CANDIDATE_NOT_MEASURED'));

  const strict=policy(f.p,f.rSha,{
    candidateBlockIds:['block-late'],minDenseWallClockShareBps:2500,
  });
  const strictSha=await hsmeSelectiveSparseBlockPolicyV1Digest(strict,hash);
  const b=await freeze(f,{policy:strict,policySha:strictSha});
  assert.equal(b.state,'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID');
  assert.ok(b.blockers.includes('SELECTIVE_SPARSE_BLOCK_CANDIDATE_SHARE_TOO_SMALL'));
});

test('expert count top-k and authority widening fail exact policy schema',async()=>{
  const f=await fixture();
  for(const pol of [
    policy(f.p,f.rSha,{maxExpertsPerConvertedBlock:5}),
    policy(f.p,f.rSha,{maxActiveExpertsPerBlock:3}),
    policy(f.p,f.rSha,{fullBackboneExpertAllowed:true}),
    policy(f.p,f.rSha,{conversionExecutionAllowed:true}),
  ]){
    const result=await freeze(f,{policy:pol,policySha:h('0')});
    assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_PLAN_INVALID');
    assert.ok(result.blockers.includes('SELECTIVE_SPARSE_BLOCK_POLICY_INVALID'));
  }
});

test('profile roster caller order canonicalizes by block id',async()=>{
  const f=await fixture();
  const r={...f.r,profiles:[...f.r.profiles].reverse()};
  const rSha=await hsmeDenseBlockProfileRosterV1Digest(r,hash);
  const pol=policy(f.p,rSha);
  const polSha=await hsmeSelectiveSparseBlockPolicyV1Digest(pol,hash);
  const result=await freeze(f,{roster:r,rosterSha:rSha,policy:pol,policySha:polSha});
  assert.deepEqual(result.candidateProfiles.map(v=>v.blockId),['block-early','block-late']);
});

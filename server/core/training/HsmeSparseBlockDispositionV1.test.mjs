import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
  hsmeSelectiveSparseBlockPlanV1Digest,
} from './HsmeSelectiveSparseBlockPlanV1.ts';
import {
  HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1_SCHEMA,
  hsmeSparseBlockExecutionMatrixV1Digest,
} from './HsmeSparseBlockExecutionMatrixV1.ts';
import {
  HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1_SCHEMA,
  decideHsmeSparseBlockDispositionV1,
  hsmeSparseBlockDispositionPolicyV1Digest,
  hsmeSparseBlockDispositionV1Digest,
} from './HsmeSparseBlockDispositionV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function planAuthority(){
  return {
    conversionExecutionAllowed:false,blockExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
function outputAuthority(){
  return {
    blockExecutionAllowed:false,selectionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
  };
}
async function plan(){
  const base={
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
    state:'SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED',blockers:[],
    residencyPlanSha256:h('1'),blockProfileRosterSha256:h('2'),
    sparseBlockPolicySha256:h('3'),denseBaselineContentSha256:h('4'),
    runtimeRepresentationSha256:h('5'),hardwareClass:'SYNTHETIC_MOBILE',
    totalDenseCoreWallClockUs:1000,
    candidateProfiles:[
      {
        blockId:'block-early',denseBlockContentSha256:h('a'),
        blockArchitectureSha256:h('b'),inputOutputContractSha256:h('c'),
        denseWeightsBytes:100_000_000,denseActiveWeightsBytes:100_000_000,
        denseActivationBytes:20_000_000,denseWallClockUs:300,
        denseFlashBytesMoved:100_000_000,denseRamBytesMoved:120_000_000,
        denseAcceleratorBytesMoved:100_000_000,denseKernelDispatchCount:8,
        densePeakMemoryBytes:180_000_000,qualitySensitivityEvidenceSha256:h('d'),
        runtimeRepresentationSha256:h('5'),hardwareClass:'SYNTHETIC_MOBILE',
      },
      {
        blockId:'block-late',denseBlockContentSha256:h('e'),
        blockArchitectureSha256:h('f'),inputOutputContractSha256:h('6'),
        denseWeightsBytes:90_000_000,denseActiveWeightsBytes:90_000_000,
        denseActivationBytes:18_000_000,denseWallClockUs:200,
        denseFlashBytesMoved:90_000_000,denseRamBytesMoved:100_000_000,
        denseAcceleratorBytesMoved:90_000_000,denseKernelDispatchCount:7,
        densePeakMemoryBytes:160_000_000,qualitySensitivityEvidenceSha256:h('7'),
        runtimeRepresentationSha256:h('5'),hardwareClass:'SYNTHETIC_MOBILE',
      },
    ],
    maxConvertedBlockCount:2,maxExpertsPerConvertedBlock:4,
    maxActiveExpertsPerBlock:2,maxRouterBytes:5_000_000,
    maxSparseBlockPackageBytes:140_000_000,
    qualityPreservationContractSha256:h('8'),
    minDenseWallClockShareBps:1500,planEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const planEvidenceSha256=await hsmeSelectiveSparseBlockPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
function denseRow(p,profile,overrides={}){
  return {
    blockId:profile.blockId,variant:'DENSE_CONTROL',
    implementationSha256:profile.denseBlockContentSha256,
    inputOutputContractSha256:profile.inputOutputContractSha256,
    fixtureSha256:h('1'),inputBatchSha256:h('2'),
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,caseCount:32,
    wallClockUs:profile.denseWallClockUs,
    weightsBytes:profile.denseWeightsBytes,
    activeWeightsBytes:profile.denseActiveWeightsBytes,
    activationBytes:profile.denseActivationBytes,
    flashBytesMoved:profile.denseFlashBytesMoved,
    ramBytesMoved:profile.denseRamBytesMoved,
    acceleratorBytesMoved:profile.denseAcceleratorBytesMoved,
    kernelDispatchCount:profile.denseKernelDispatchCount,
    peakMemoryBytes:profile.densePeakMemoryBytes,
    qualityPreservationContractSha256:p.qualityPreservationContractSha256,
    qualityPreservationEvidenceSha256:h('3'),
    qualityPreservationPass:true,
    hardPreservationFailureCount:0,
    criticalFailureCount:0,
    deterministicReplayIdentitySha256:h('4'),
    realMeasuredEvidence:true,networkBytesDuringExecution:0,
    ...overrides,
  };
}
function sparseRow(p,profile,index,overrides={}){
  return {
    blockId:profile.blockId,variant:'SPARSE_CANDIDATE',
    implementationSha256:h(index===0?'9':'a'),
    inputOutputContractSha256:profile.inputOutputContractSha256,
    fixtureSha256:h('1'),inputBatchSha256:h('2'),
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,caseCount:32,
    wallClockUs:Math.trunc(profile.denseWallClockUs*0.8),
    weightsBytes:68_000_000,activeWeightsBytes:50_000_000,
    activationBytes:Math.trunc(profile.denseActivationBytes*0.9),
    flashBytesMoved:Math.trunc(profile.denseFlashBytesMoved*0.75),
    ramBytesMoved:Math.trunc(profile.denseRamBytesMoved*0.75),
    acceleratorBytesMoved:Math.trunc(profile.denseAcceleratorBytesMoved*0.75),
    kernelDispatchCount:profile.denseKernelDispatchCount+1,
    peakMemoryBytes:Math.trunc(profile.densePeakMemoryBytes*0.9),
    qualityPreservationContractSha256:p.qualityPreservationContractSha256,
    qualityPreservationEvidenceSha256:h('5'),
    qualityPreservationPass:true,
    hardPreservationFailureCount:0,
    criticalFailureCount:0,
    deterministicReplayIdentitySha256:h('6'),
    realMeasuredEvidence:true,networkBytesDuringExecution:0,
    ...overrides,
  };
}
async function matrix(p,rowOverrides={}){
  const rows=[];
  for(let i=0;i<p.candidateProfiles.length;i+=1){
    const profile=p.candidateProfiles[i];
    rows.push(
      denseRow(p,profile,rowOverrides[profile.blockId]?.dense??{}),
      sparseRow(p,profile,i,rowOverrides[profile.blockId]?.sparse??{}),
    );
  }
  const base={
    schemaVersion:HSME_SPARSE_BLOCK_EXECUTION_MATRIX_V1_SCHEMA,
    state:'SPARSE_BLOCK_EXECUTION_MATRIX_READY_NOT_DISPOSED',
    blockers:[],sparseBlockPlanSha256:p.planEvidenceSha256,
    candidateRosterSha256:h('7'),campaignSha256:h('8'),
    executionAttemptId:'synthetic-execution-001',rows,
    matrixEvidenceSha256:h('0'),
    furtherBlockExecutionAllowed:false,...outputAuthority(),
  };
  const matrixEvidenceSha256=await hsmeSparseBlockExecutionMatrixV1Digest(base,hash);
  return {...base,matrixEvidenceSha256};
}
function policy(p,m,overrides={}){
  return {
    schemaVersion:HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1_SCHEMA,
    sparseBlockPlanSha256:p.planEvidenceSha256,
    executionMatrixSha256:m.matrixEvidenceSha256,
    maxHardPreservationFailureCount:0,
    maxCriticalFailureCount:0,
    minWallClockImprovementBps:1000,
    minBytesMovedImprovementBps:1000,
    maxPeakMemoryRegressionBps:500,
    maxKernelDispatchRegressionBps:2000,
    reviewState:'QUALITY_FIRST_DEVICE_EFFICIENCY_POLICY_REVIEWED',
    ...outputAuthority(),...overrides,
  };
}
const truePlanOrigin={async verifySparseBlockPlan(){return true;}};
const falsePlanOrigin={async verifySparseBlockPlan(){return false;}};
const trueMatrixOrigin={async verifyExecutionMatrix(){return true;}};
const falseMatrixOrigin={async verifyExecutionMatrix(){return false;}};
const truePolicyOrigin={async verifyDispositionPolicy(){return true;}};

async function fixture(rowOverrides={}){
  const p=await plan();
  const m=await matrix(p,rowOverrides);
  const pol=policy(p,m);
  const polSha=await hsmeSparseBlockDispositionPolicyV1Digest(pol,hash);
  return {p,m,pol,polSha};
}
async function decide(f,overrides={}){
  return decideHsmeSparseBlockDispositionV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    f.m,f.m.matrixEvidenceSha256,overrides.matrixOrigin??trueMatrixOrigin,
    overrides.policy??f.pol,overrides.policySha??f.polSha,
    truePolicyOrigin,hash,
  );
}

test('quality-preserving wall-clock and bytes-moved improvements ADVANCE blocks independently',async()=>{
  const f=await fixture();
  const a=await decide(f);
  const b=await decide(f);
  assert.equal(a.state,'SPARSE_BLOCK_DISPOSITION_READY');
  assert.deepEqual(a.advancedBlockIds,['block-early','block-late']);
  assert.deepEqual(a.redesignedBlockIds,[]);
  assert.deepEqual(a.rejectedBlockIds,[]);
  assert.ok(a.blockDispositions.every(v=>v.qualityEligible&&v.efficiencyEligible));
  assert.equal(a.selectionAllowed,false);
  assert.equal(a.modelInstallAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeSparseBlockDispositionV1Digest(a,hash),
    a.dispositionEvidenceSha256,
  );
});

test('quality failure cannot be rescued by large speed and traffic improvements',async()=>{
  const f=await fixture({
    'block-early':{sparse:{
      qualityPreservationPass:false,
      wallClockUs:30,flashBytesMoved:1,ramBytesMoved:1,
      acceleratorBytesMoved:1,peakMemoryBytes:1,kernelDispatchCount:1,
    }},
  });
  const result=await decide(f);
  const early=result.blockDispositions.find(v=>v.blockId==='block-early');
  assert.equal(early.disposition,'REDESIGN');
  assert.equal(early.qualityEligible,false);
  assert.equal(early.efficiencyEligible,false);
  assert.ok(early.reasons.includes('SPARSE_QUALITY_PRESERVATION_FAILED'));
});

test('hard preservation or critical failures REJECT a sparse block',async()=>{
  const f=await fixture({
    'block-early':{sparse:{
      hardPreservationFailureCount:1,
      criticalFailureCount:1,
    }},
  });
  const result=await decide(f);
  const early=result.blockDispositions.find(v=>v.blockId==='block-early');
  assert.equal(early.disposition,'REJECT');
  assert.equal(early.hardRejected,true);
  assert.ok(early.reasons.includes('SPARSE_HARD_QUALITY_GATE_FAILED'));
});

test('quality pass with insufficient wall-clock improvement REDESIGNs only that block',async()=>{
  const p=await plan();
  const profile=p.candidateProfiles[0];
  const f=await fixture({
    'block-early':{sparse:{wallClockUs:Math.trunc(profile.denseWallClockUs*0.96)}},
  });
  const result=await decide(f);
  assert.deepEqual(result.advancedBlockIds,['block-late']);
  assert.deepEqual(result.redesignedBlockIds,['block-early']);
  const early=result.blockDispositions.find(v=>v.blockId==='block-early');
  assert.ok(early.reasons.includes('WALL_CLOCK_IMPROVEMENT_INSUFFICIENT'));
});

test('bytes-moved improvement is an independent mandatory efficiency gate',async()=>{
  const p=await plan();
  const profile=p.candidateProfiles[0];
  const f=await fixture({
    'block-early':{sparse:{
      flashBytesMoved:profile.denseFlashBytesMoved,
      ramBytesMoved:profile.denseRamBytesMoved,
      acceleratorBytesMoved:profile.denseAcceleratorBytesMoved,
    }},
  });
  const result=await decide(f);
  const early=result.blockDispositions.find(v=>v.blockId==='block-early');
  assert.equal(early.disposition,'REDESIGN');
  assert.ok(early.reasons.includes('BYTES_MOVED_IMPROVEMENT_INSUFFICIENT'));
});

test('peak-memory and dispatch regressions are bounded only after quality passes',async()=>{
  const p=await plan();
  const profile=p.candidateProfiles[0];
  const f=await fixture({
    'block-early':{sparse:{
      peakMemoryBytes:Math.trunc(profile.densePeakMemoryBytes*1.1),
      kernelDispatchCount:profile.denseKernelDispatchCount*2,
    }},
  });
  const result=await decide(f);
  const early=result.blockDispositions.find(v=>v.blockId==='block-early');
  assert.equal(early.qualityEligible,true);
  assert.equal(early.efficiencyEligible,false);
  assert.ok(early.reasons.includes('PEAK_MEMORY_REGRESSION_EXCEEDED'));
  assert.ok(early.reasons.includes('KERNEL_DISPATCH_REGRESSION_EXCEEDED'));
});

test('dense control quality failure forces REDESIGN before sparse efficiency interpretation',async()=>{
  const f=await fixture({
    'block-early':{
      dense:{qualityPreservationPass:false},
      sparse:{wallClockUs:1,flashBytesMoved:1,ramBytesMoved:1,acceleratorBytesMoved:1},
    },
  });
  const result=await decide(f);
  const early=result.blockDispositions.find(v=>v.blockId==='block-early');
  assert.equal(early.disposition,'REDESIGN');
  assert.ok(early.reasons.includes('DENSE_CONTROL_QUALITY_GATE_FAILED'));
  assert.equal(early.efficiencyEligible,false);
});

test('plan and matrix exact origins remain mandatory',async()=>{
  const f=await fixture();
  const a=await decide(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'SPARSE_BLOCK_DISPOSITION_INVALID');
  assert.ok(a.blockers.includes('SPARSE_BLOCK_DISPOSITION_PLAN_ORIGIN_UNVERIFIED'));
  const b=await decide(f,{matrixOrigin:falseMatrixOrigin});
  assert.equal(b.state,'SPARSE_BLOCK_DISPOSITION_INVALID');
  assert.ok(b.blockers.includes('SPARSE_BLOCK_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'));
});

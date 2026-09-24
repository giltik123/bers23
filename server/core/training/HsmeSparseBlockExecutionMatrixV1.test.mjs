import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
  hsmeSelectiveSparseBlockPlanV1Digest,
} from './HsmeSelectiveSparseBlockPlanV1.ts';
import {
  HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA,
  HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1_SCHEMA,
  hsmeSelectiveSparseBlockCandidateRosterV1Digest,
  hsmeSparseBlockCandidateManifestV1Digest,
} from './HsmeSparseBlockCandidateRosterV1.ts';
import {
  CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1_SCHEMA,
  HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1_SCHEMA,
  coreHsmeSparseBlockExecutionResultV1Digest,
  executeHsmeSparseBlockComparisonMatrixV1,
  hsmeSparseBlockExecutionCampaignV1Digest,
  hsmeSparseBlockExecutionMatrixV1Digest,
} from './HsmeSparseBlockExecutionMatrixV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function matrixAuthority(){
  return {
    selectionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
}
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
function manifest(p,profile,index){
  return {
    schemaVersion:HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA,
    sparseBlockPlanSha256:p.planEvidenceSha256,
    blockId:profile.blockId,
    originalDenseBlockContentSha256:profile.denseBlockContentSha256,
    inputOutputContractSha256:profile.inputOutputContractSha256,
    conversionToolchainSha256:h(index===0?'9':'1'),
    conversionReceiptSha256:h(index===0?'2':'3'),
    sharedPathContentSha256:h(index===0?'4':'5'),sharedPathBytes:30_000_000,
    routerContentSha256:h(index===0?'6':'7'),
    routerConfigSha256:h(index===0?'8':'9'),routerBytes:2_000_000,
    experts:[
      {expertId:profile.blockId+'-a',contentSha256:h(index===0?'a':'b'),bytes:20_000_000},
      {expertId:profile.blockId+'-b',contentSha256:h(index===0?'c':'d'),bytes:18_000_000},
    ],
    maxActiveExperts:2,sparseBlockPackageBytes:70_000_000,
    totalWeightsBytes:68_000_000,activeWeightsBytes:50_000_000,
    qualityPreservationContractSha256:p.qualityPreservationContractSha256,
    deterministicReplayContractSha256:h(index===0?'e':'f'),
    requiresSharedPath:true,containsFullDenseBlockCopy:false,
    standaloneExecutionAllowed:false,
    conversionExecutionAllowed:false,blockExecutionAllowed:false,
    selectionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
}
async function roster(p){
  const candidates=[];
  for(let i=0;i<p.candidateProfiles.length;i+=1){
    const m=manifest(p,p.candidateProfiles[i],i);
    const manifestSha256=await hsmeSparseBlockCandidateManifestV1Digest(m,hash);
    candidates.push({manifestSha256,manifest:m});
  }
  const base={
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1_SCHEMA,
    state:'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_READY_NOT_EXECUTED',
    blockers:[],sparseBlockPlanSha256:p.planEvidenceSha256,
    denseBaselineContentSha256:p.denseBaselineContentSha256,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,candidates,candidateCount:candidates.length,
    totalSparsePackageBytes:140_000_000,rosterEvidenceSha256:h('0'),
    conversionExecutionAllowed:false,blockExecutionAllowed:false,
    selectionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
  const rosterEvidenceSha256=
    await hsmeSelectiveSparseBlockCandidateRosterV1Digest(base,hash);
  return {...base,rosterEvidenceSha256};
}
function campaign(p,r,overrides={}){
  return {
    schemaVersion:HSME_SPARSE_BLOCK_EXECUTION_CAMPAIGN_V1_SCHEMA,
    sparseBlockPlanSha256:p.planEvidenceSha256,
    candidateRosterSha256:r.rosterEvidenceSha256,
    fixtureSha256:h('1'),inputBatchSha256:h('2'),caseCount:32,
    warmupIterations:5,measuredIterations:20,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,
    sameInputsAcrossVariants:true,sameRuntimeAcrossVariants:true,
    networkDuringExecutionAllowed:false,blockExecutionAllowed:false,
    ...matrixAuthority(),...overrides,
  };
}
const truePlanOrigin={async verifySparseBlockPlan(){return true;}};
const falsePlanOrigin={async verifySparseBlockPlan(){return false;}};
const trueRosterOrigin={async verifyCandidateRoster(){return true;}};
const falseRosterOrigin={async verifyCandidateRoster(){return false;}};
const trueCampaignOrigin={async verifyExecutionCampaign(){return true;}};
const falseCampaignOrigin={async verifyExecutionCampaign(){return false;}};
const trueResultOrigin={async verifyExecutionResult(){return true;}};
const falseResultOrigin={async verifyExecutionResult(){return false;}};

function fakeHost(p,r,c,mode='OK'){
  const calls=[];
  return {
    calls,
    async executeExactDenseSparseBlockCampaign(request){
      calls.push(request);
      const rows=[];
      for(const profile of p.candidateProfiles){
        const candidate=r.candidates.find(v=>v.manifest.blockId===profile.blockId);
        rows.push({
          blockId:profile.blockId,variant:'DENSE_CONTROL',
          implementationSha256:profile.denseBlockContentSha256,
          inputOutputContractSha256:profile.inputOutputContractSha256,
          fixtureSha256:c.fixtureSha256,inputBatchSha256:c.inputBatchSha256,
          runtimeRepresentationSha256:c.runtimeRepresentationSha256,
          hardwareClass:c.hardwareClass,caseCount:c.caseCount,
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
        },{
          blockId:profile.blockId,variant:'SPARSE_CANDIDATE',
          implementationSha256:candidate.manifestSha256,
          inputOutputContractSha256:profile.inputOutputContractSha256,
          fixtureSha256:c.fixtureSha256,inputBatchSha256:c.inputBatchSha256,
          runtimeRepresentationSha256:c.runtimeRepresentationSha256,
          hardwareClass:c.hardwareClass,caseCount:c.caseCount,
          wallClockUs:Math.max(1,profile.denseWallClockUs-40),
          weightsBytes:candidate.manifest.totalWeightsBytes,
          activeWeightsBytes:candidate.manifest.activeWeightsBytes,
          activationBytes:Math.max(1,profile.denseActivationBytes-2_000_000),
          flashBytesMoved:Math.max(0,profile.denseFlashBytesMoved-20_000_000),
          ramBytesMoved:Math.max(0,profile.denseRamBytesMoved-20_000_000),
          acceleratorBytesMoved:Math.max(0,profile.denseAcceleratorBytesMoved-20_000_000),
          kernelDispatchCount:profile.denseKernelDispatchCount+2,
          peakMemoryBytes:Math.max(1,profile.densePeakMemoryBytes-10_000_000),
          qualityPreservationContractSha256:p.qualityPreservationContractSha256,
          qualityPreservationEvidenceSha256:h('5'),
          qualityPreservationPass:true,
          hardPreservationFailureCount:0,
          criticalFailureCount:0,
          deterministicReplayIdentitySha256:h('6'),
          realMeasuredEvidence:true,networkBytesDuringExecution:0,
        });
      }
      if(mode==='REVERSED')rows.reverse();
      if(mode==='MISSING')rows.pop();
      if(mode==='DENSE_SOURCE_DRIFT')rows[0]={...rows[0],implementationSha256:h('0')};
      if(mode==='INPUT_DRIFT')rows[0]={...rows[0],inputBatchSha256:h('0')};
      if(mode==='NETWORK')rows[0]={...rows[0],networkBytesDuringExecution:1};
      const raw={
        schemaVersion:CORE_HSME_SPARSE_BLOCK_EXECUTION_RESULT_V1_SCHEMA,
        state:'SPARSE_BLOCK_EXECUTION_CAMPAIGN_COMPLETED',
        sparseBlockPlanSha256:p.planEvidenceSha256,
        candidateRosterSha256:r.rosterEvidenceSha256,
        campaignSha256:await hsmeSparseBlockExecutionCampaignV1Digest(c,hash),
        executionAttemptId:'synthetic-block-execution-001',
        rows,
        ...matrixAuthority(),
        hostResultSha256:h('0'),
      };
      if(mode==='BAD_DIGEST')return raw;
      if(mode==='NETWORK')return raw;
      const hostResultSha256=
        await coreHsmeSparseBlockExecutionResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}

async function fixture(){
  const p=await plan();
  const r=await roster(p);
  const c=campaign(p,r);
  const cSha=await hsmeSparseBlockExecutionCampaignV1Digest(c,hash);
  return {p,r,c,cSha};
}
async function execute(f,host=fakeHost(f.p,f.r,f.c),overrides={}){
  return executeHsmeSparseBlockComparisonMatrixV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    f.r,f.r.rosterEvidenceSha256,overrides.rosterOrigin??trueRosterOrigin,
    overrides.campaign??f.c,overrides.campaignSha??f.cSha,
    overrides.campaignOrigin??trueCampaignOrigin,
    host,overrides.resultOrigin??trueResultOrigin,hash,
  );
}

test('exact protected dense-vs-sparse campaign yields deterministic matrix independent of host row order',async()=>{
  const f=await fixture();
  const a=await execute(f,fakeHost(f.p,f.r,f.c,'OK'));
  const b=await execute(f,fakeHost(f.p,f.r,f.c,'REVERSED'));
  assert.equal(a.state,'SPARSE_BLOCK_EXECUTION_MATRIX_READY_NOT_DISPOSED');
  assert.equal(a.rows.length,4);
  assert.deepEqual(
    a.rows.map(v=>v.blockId+':'+v.variant),
    [
      'block-early:DENSE_CONTROL','block-early:SPARSE_CANDIDATE',
      'block-late:DENSE_CONTROL','block-late:SPARSE_CANDIDATE',
    ],
  );
  assert.equal(a.furtherBlockExecutionAllowed,false);
  assert.equal(a.selectionAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeSparseBlockExecutionMatrixV1Digest(a,hash),
    a.matrixEvidenceSha256,
  );
});

test('plan roster and campaign trusted origins are mandatory before host execution',async()=>{
  const f=await fixture();
  for(const overrides of [
    {planOrigin:falsePlanOrigin},
    {rosterOrigin:falseRosterOrigin},
    {campaignOrigin:falseCampaignOrigin},
  ]){
    const host=fakeHost(f.p,f.r,f.c);
    const result=await execute(f,host,overrides);
    assert.equal(result.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
    assert.equal(host.calls.length,0);
  }
});

test('missing dense/sparse pair is rejected',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.r,f.c,'MISSING'));
  assert.equal(result.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
  assert.ok(result.blockers.includes('SPARSE_BLOCK_EXECUTION_HOST_BINDING_MISMATCH'));
});

test('dense source identity drift fails closed',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.r,f.c,'DENSE_SOURCE_DRIFT'));
  assert.equal(result.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
  assert.ok(result.blockers.includes('SPARSE_BLOCK_EXECUTION_DENSE_IDENTITY_MISMATCH'));
});

test('same input runtime and quality contract binding cannot drift',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.r,f.c,'INPUT_DRIFT'));
  assert.equal(result.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
  assert.ok(result.blockers.includes('SPARSE_BLOCK_EXECUTION_ROW_BINDING_MISMATCH'));
});

test('network bytes during protected block execution are forbidden',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.r,f.c,'NETWORK'));
  assert.equal(result.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
  assert.ok(result.blockers.includes('SPARSE_BLOCK_EXECUTION_HOST_RESULT_INVALID'));
});

test('host result digest and origin are independently enforced',async()=>{
  const f=await fixture();
  const digestDrift=await execute(f,fakeHost(f.p,f.r,f.c,'BAD_DIGEST'));
  assert.equal(digestDrift.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
  assert.ok(
    digestDrift.blockers.includes('SPARSE_BLOCK_EXECUTION_HOST_RESULT_REHASH_MISMATCH'),
  );
  const origin=await execute(
    f,fakeHost(f.p,f.r,f.c,'OK'),{resultOrigin:falseResultOrigin},
  );
  assert.equal(origin.state,'SPARSE_BLOCK_EXECUTION_MATRIX_INVALID');
  assert.ok(
    origin.blockers.includes('SPARSE_BLOCK_EXECUTION_HOST_RESULT_ORIGIN_UNVERIFIED'),
  );
});

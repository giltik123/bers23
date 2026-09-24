import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
  hsmeSelectiveSparseBlockPlanV1Digest,
} from './HsmeSelectiveSparseBlockPlanV1.ts';
import {
  HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA,
  freezeHsmeSelectiveSparseBlockCandidateRosterV1,
  hsmeSelectiveSparseBlockCandidateRosterV1Digest,
  hsmeSparseBlockCandidateManifestV1Digest,
} from './HsmeSparseBlockCandidateRosterV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
    conversionExecutionAllowed:false,blockExecutionAllowed:false,
    selectionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
}
async function plan(){
  const base={
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
    state:'SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
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
    minDenseWallClockShareBps:1500,
    planEvidenceSha256:h('0'),
    conversionExecutionAllowed:false,blockExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const planEvidenceSha256=await hsmeSelectiveSparseBlockPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
function manifest(p,blockId,overrides={}){
  const profile=p.candidateProfiles.find(v=>v.blockId===blockId);
  const isEarly=blockId==='block-early';
  return {
    schemaVersion:HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA,
    sparseBlockPlanSha256:p.planEvidenceSha256,
    blockId,
    originalDenseBlockContentSha256:profile.denseBlockContentSha256,
    inputOutputContractSha256:profile.inputOutputContractSha256,
    conversionToolchainSha256:h(isEarly?'9':'1'),
    conversionReceiptSha256:h(isEarly?'2':'3'),
    sharedPathContentSha256:h(isEarly?'4':'5'),
    sharedPathBytes:30_000_000,
    routerContentSha256:h(isEarly?'6':'7'),
    routerConfigSha256:h(isEarly?'8':'9'),
    routerBytes:2_000_000,
    experts:[
      {expertId:blockId+'-expert-a',contentSha256:h(isEarly?'a':'b'),bytes:20_000_000},
      {expertId:blockId+'-expert-b',contentSha256:h(isEarly?'c':'d'),bytes:18_000_000},
    ],
    maxActiveExperts:2,
    sparseBlockPackageBytes:70_000_000,
    totalWeightsBytes:68_000_000,
    activeWeightsBytes:50_000_000,
    qualityPreservationContractSha256:p.qualityPreservationContractSha256,
    deterministicReplayContractSha256:h(isEarly?'e':'f'),
    requiresSharedPath:true,
    containsFullDenseBlockCopy:false,
    standaloneExecutionAllowed:false,
    ...authority(),
    ...overrides,
  };
}
async function binding(rawManifest){
  return {
    rawManifest,
    expectedManifestSha256:
      await hsmeSparseBlockCandidateManifestV1Digest(rawManifest,hash),
  };
}
const truePlanOrigin={async verifySparseBlockPlan(){return true;}};
const falsePlanOrigin={async verifySparseBlockPlan(){return false;}};
const trueManifestOrigin={async verifySparseBlockCandidateManifest(){return true;}};
const falseManifestOrigin={async verifySparseBlockCandidateManifest(){return false;}};

async function fixture(){
  const p=await plan();
  const early=await binding(manifest(p,'block-early'));
  const late=await binding(manifest(p,'block-late'));
  return {p,early,late};
}
async function freeze(f,bindings=[f.early,f.late],overrides={}){
  return freezeHsmeSelectiveSparseBlockCandidateRosterV1(
    f.p,
    overrides.planSha??f.p.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    bindings,
    overrides.manifestOrigin??trueManifestOrigin,
    hash,
  );
}

test('exact sparse manifests freeze deterministic READY_NOT_EXECUTED roster independent of caller order',async()=>{
  const f=await fixture();
  const a=await freeze(f,[f.late,f.early]);
  const b=await freeze(f,[f.early,f.late]);
  assert.equal(
    a.state,
    'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_READY_NOT_EXECUTED',
  );
  assert.deepEqual(a.blockers,[]);
  assert.deepEqual(
    a.candidates.map(v=>v.manifest.blockId),
    ['block-early','block-late'],
  );
  assert.equal(a.candidateCount,2);
  assert.equal(a.totalSparsePackageBytes,140_000_000);
  assert.equal(a.conversionExecutionAllowed,false);
  assert.equal(a.blockExecutionAllowed,false);
  assert.equal(a.selectionAllowed,false);
  assert.equal(a.modelInstallAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeSelectiveSparseBlockCandidateRosterV1Digest(a,hash),
    a.rosterEvidenceSha256,
  );
});

test('plan and candidate manifest exact origins are mandatory',async()=>{
  const f=await fixture();
  const a=await freeze(f,undefined,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
  assert.ok(a.blockers.includes('SPARSE_BLOCK_CANDIDATE_PLAN_ORIGIN_UNVERIFIED'));

  const b=await freeze(f,undefined,{manifestOrigin:falseManifestOrigin});
  assert.equal(b.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
  assert.ok(b.blockers.includes('SPARSE_BLOCK_CANDIDATE_MANIFEST_ORIGIN_UNVERIFIED'));
});

test('dense block I/O and quality contract binding cannot drift',async()=>{
  const f=await fixture();
  for(const overrides of [
    {originalDenseBlockContentSha256:h('0')},
    {inputOutputContractSha256:h('0')},
    {qualityPreservationContractSha256:h('0')},
  ]){
    const raw=manifest(f.p,'block-early',overrides);
    const result=await freeze(f,[await binding(raw),f.late]);
    assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
    assert.ok(result.blockers.includes('SPARSE_BLOCK_CANDIDATE_MANIFEST_BINDING_MISMATCH'));
  }
});

test('expert router and package frozen caps fail closed',async()=>{
  const f=await fixture();
  const cases=[
    manifest(f.p,'block-early',{
      experts:[
        {expertId:'a',contentSha256:h('1'),bytes:10_000_000},
        {expertId:'b',contentSha256:h('2'),bytes:10_000_000},
        {expertId:'c',contentSha256:h('3'),bytes:10_000_000},
        {expertId:'d',contentSha256:h('4'),bytes:10_000_000},
      ],
      maxActiveExperts:3,
      sharedPathBytes:30_000_000,routerBytes:2_000_000,
      sparseBlockPackageBytes:72_000_000,totalWeightsBytes:70_000_000,
      activeWeightsBytes:60_000_000,
    }),
    manifest(f.p,'block-early',{
      routerBytes:5_000_001,
      sparseBlockPackageBytes:73_000_001,
      totalWeightsBytes:70_000_000,activeWeightsBytes:50_000_000,
    }),
    manifest(f.p,'block-early',{
      sharedPathBytes:60_000_000,routerBytes:4_000_000,
      sparseBlockPackageBytes:142_000_000,
      totalWeightsBytes:130_000_000,activeWeightsBytes:90_000_000,
    }),
  ];
  for(const raw of cases){
    const result=await freeze(f,[await binding(raw),f.late]);
    assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
    assert.ok(result.blockers.includes('SPARSE_BLOCK_CANDIDATE_FROZEN_CAP_EXCEEDED'));
  }
});

test('package accounting must exactly equal shared router and expert bytes',async()=>{
  const f=await fixture();
  const raw=manifest(f.p,'block-early',{sparseBlockPackageBytes:70_000_001});
  const result=await freeze(f,[{
    rawManifest:raw,expectedManifestSha256:h('0'),
  },f.late]);
  assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
  assert.ok(result.blockers.includes('SPARSE_BLOCK_CANDIDATE_MANIFEST_INVALID'));
});

test('full dense copy standalone execution and authority widening are invalid',async()=>{
  const f=await fixture();
  for(const overrides of [
    {containsFullDenseBlockCopy:true},
    {standaloneExecutionAllowed:true},
    {blockExecutionAllowed:true},
    {modelInstallAllowed:true},
  ]){
    const raw=manifest(f.p,'block-early',overrides);
    const result=await freeze(f,[{
      rawManifest:raw,expectedManifestSha256:h('0'),
    },f.late]);
    assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
    assert.ok(result.blockers.includes('SPARSE_BLOCK_CANDIDATE_MANIFEST_INVALID'));
  }
});

test('duplicate expert id or content identity is rejected by manifest normalization',async()=>{
  const f=await fixture();
  const raw=manifest(f.p,'block-early',{
    experts:[
      {expertId:'same',contentSha256:h('1'),bytes:20_000_000},
      {expertId:'same',contentSha256:h('2'),bytes:18_000_000},
    ],
  });
  const result=await freeze(f,[{
    rawManifest:raw,expectedManifestSha256:h('0'),
  },f.late]);
  assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
  assert.ok(result.blockers.includes('SPARSE_BLOCK_CANDIDATE_MANIFEST_INVALID'));
});

test('roster must cover each frozen candidate exactly once',async()=>{
  const f=await fixture();
  const result=await freeze(f,[f.early,f.early]);
  assert.equal(result.state,'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes('SPARSE_BLOCK_CANDIDATE_ROSTER_DUPLICATE')
    ||result.blockers.includes('SPARSE_BLOCK_CANDIDATE_ROSTER_COVERAGE_MISMATCH'),
  );
});

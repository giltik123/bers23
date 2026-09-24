import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA,
  hsmeAdapterMoePrototypeRosterV1Digest,
} from './HsmeAdapterMoePrototypeRosterV1.ts';
import {
  HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1_SCHEMA,
  HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA,
  buildHsmeAdapterMoeRoutingComparisonMatrixV1,
  hsmeAdapterMoeRoutingCampaignFixtureV1Digest,
  hsmeAdapterMoeRoutingComparisonMatrixV1Digest,
  hsmeAdapterMoeRoutingMeasurementV1Digest,
} from './HsmeAdapterMoeRoutingComparisonMatrixV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
function h(ch){return ch.repeat(64);}
function planAuthority(){
  return {
    trainingExecutionAllowed:false,
    prototypeAssemblyAllowed:false,
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
function measurementAuthority(){
  return {
    selectionAllowed:false,
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
function matrixAuthority(){
  return {
    selectionAllowed:false,
    prototypeAssemblyAllowed:false,
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

const measurements=[
  'QUALITY_VECTOR','SEMANTIC_ADHERENCE','PRESERVATION_FAILURES',
  'PACKAGE_BYTES','RESIDENT_BYTES','ACTIVE_WEIGHTS_BYTES',
  'PEAK_MEMORY_BYTES','FLASH_BYTES_MOVED','RAM_BYTES_MOVED',
  'ACCELERATOR_BYTES_MOVED','COLD_LATENCY_MS','WARM_LATENCY_MS',
  'END_TO_END_LATENCY_MS','EXPERT_ACTIVATION_COUNT',
  'ROUTER_REPLAY_IDENTITY',
];

async function plan(){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    experimentId:'hsme3-routing-001',
    denseBaselineDecisionSha256:h('1'),
    denseBaselineModelId:'bers-dense-core-v1',
    denseBaselineVersion:'synthetic-v1',
    denseBaselineContentSha256:h('2'),
    denseBaselinePackageBytes:700_000_000,
    denseBaselineRepresentationManifestSha256:h('3'),
    denseBaselineEvaluationContractSha256:h('4'),
    denseBaselineQualityEvidenceSha256:h('5'),
    denseBaselineRuntimeEvidenceSha256:h('6'),
    denseBaselineHsmeBindingEvidenceSha256:h('7'),
    topologyPolicySha256:h('8'),
    comparisonVariants:[
      'DENSE_CONTROL','SHARED_TOP1_ADAPTER','SHARED_TOP2_ADAPTER',
    ],
    specialistHypotheses:['FASHION','IDENTITY_FACE'],
    maxExpertCount:2,
    maxExpertArtifactBytes:150_000_000,
    maxTotalExpertArtifactBytes:300_000_000,
    maxActiveSpecialistsPerDecision:2,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    qualityDimensions:['A','B','C'],
    hardPreservationDimensions:['A'],
    qualityPriority:['A','B','C'],
    measurementDimensions:measurements,
    routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED',
    planEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const planEvidenceSha256=await hsmeAdapterMoeExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}

async function roster(p){
  const prototypes=[
    {
      variant:'SHARED_TOP1_ADAPTER',
      routerKind:'TASK_COARSE_STATIC',
      routerContentSha256:h('9'),
      routerConfigSha256:h('a'),
      routerBytes:2_000_000,
      routerUri:'bers://router/top1',
      routerRevision:h('b'),
      routerToolchainSha256:h('c'),
      routerLicense:'SYNTHETIC',
      routerLicenseEvidenceSha256:h('d'),
      expertIds:['fashion-adapter-v1','identity-adapter-v1'],
      expertManifestSha256s:[h('e'),h('f')],
      expertContentSha256s:[h('3'),h('4')],
      maxActiveExperts:1,
      sharedPathRequired:true,
      deterministicReplayRequired:true,
      fullBackboneExpertAllowed:false,
      denseBaselinePackageBytes:p.denseBaselinePackageBytes,
      totalExpertArtifactBytes:170_000_000,
      packageBytes:872_000_000,
      assemblyAttestationSha256:h('5'),
      prototypeSha256:h('6'),
    },
    {
      variant:'SHARED_TOP2_ADAPTER',
      routerKind:'TASK_COARSE_STATIC',
      routerContentSha256:h('7'),
      routerConfigSha256:h('8'),
      routerBytes:2_000_000,
      routerUri:'bers://router/top2',
      routerRevision:h('9'),
      routerToolchainSha256:h('a'),
      routerLicense:'SYNTHETIC',
      routerLicenseEvidenceSha256:h('b'),
      expertIds:['fashion-adapter-v1','identity-adapter-v1'],
      expertManifestSha256s:[h('e'),h('f')],
      expertContentSha256s:[h('3'),h('4')],
      maxActiveExperts:2,
      sharedPathRequired:true,
      deterministicReplayRequired:true,
      fullBackboneExpertAllowed:false,
      denseBaselinePackageBytes:p.denseBaselinePackageBytes,
      totalExpertArtifactBytes:170_000_000,
      packageBytes:872_000_000,
      assemblyAttestationSha256:h('c'),
      prototypeSha256:h('d'),
    },
  ];
  const base={
    schemaVersion:HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA,
    state:'ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED',
    blockers:[],
    experimentPlanSha256:p.planEvidenceSha256,
    expertPackSetSha256:h('e'),
    denseBaselineDecisionSha256:p.denseBaselineDecisionSha256,
    denseBaselineContentSha256:p.denseBaselineContentSha256,
    denseBaselinePackageBytes:p.denseBaselinePackageBytes,
    realEvidenceSha256s:[h('f'),h('1')],
    prototypes,
    rosterEvidenceSha256:h('0'),
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
  const rosterEvidenceSha256=await hsmeAdapterMoePrototypeRosterV1Digest(base,hash);
  return {...base,rosterEvidenceSha256};
}

function rawFixture(p,r,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1_SCHEMA,
    experimentPlanSha256:p.planEvidenceSha256,
    prototypeRosterSha256:r.rosterEvidenceSha256,
    fixtureId:'hsme3-routing-fixture-001',
    fixtureManifestSha256:h('2'),
    evaluationContractSha256:h('3'),
    deterministicSeedScheduleSha256:h('4'),
    runtimeRepresentationSha256:h('5'),
    hardwareClass:'SYNTHETIC_GPU_CLASS',
    caseCount:100,
    qualityScale:'NORMALIZED_0_TO_1_HIGHER_BETTER',
    qualityDimensions:p.qualityDimensions,
    hardPreservationDimensions:p.hardPreservationDimensions,
    requiredMeasurementDimensions:p.measurementDimensions,
    sameInputsAcrossVariants:true,
    sameSeedsAcrossVariants:true,
    sameRuntimeRepresentationAcrossVariants:true,
    noSilentCloudFallback:true,
    ...measurementAuthority(),
    ...overrides,
  };
}

function rawRow(p,r,fixture,fixtureSha,variant,overrides={}){
  const prototype=r.prototypes.find(x=>x.variant===variant);
  const sourceIdentitySha256=variant==='DENSE_CONTROL'
    ?p.denseBaselineDecisionSha256
    :prototype.prototypeSha256;
  const packageBytes=variant==='DENSE_CONTROL'
    ?p.denseBaselinePackageBytes
    :prototype.packageBytes;
  return {
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA,
    variant,
    sourceIdentitySha256,
    campaignFixtureSha256:fixtureSha,
    fixtureManifestSha256:fixture.fixtureManifestSha256,
    evaluationContractSha256:fixture.evaluationContractSha256,
    deterministicSeedScheduleSha256:fixture.deterministicSeedScheduleSha256,
    runtimeRepresentationSha256:fixture.runtimeRepresentationSha256,
    caseCount:fixture.caseCount,
    quality:[
      {dimension:'A',value:0.90},
      {dimension:'B',value:0.88},
      {dimension:'C',value:0.86},
    ],
    hardPreservationFailures:[
      {dimension:'A',failureCount:0},
    ],
    criticalFailureCount:0,
    packageBytes,
    residentBytes:600_000_000,
    activeWeightsBytes:500_000_000,
    peakMemoryBytes:800_000_000,
    flashBytesMoved:200_000_000,
    ramBytesMoved:300_000_000,
    acceleratorBytesMoved:400_000_000,
    coldLatencyMs:1200,
    warmLatencyMs:900,
    endToEndLatencyMs:1300,
    expertActivationCount:
      variant==='DENSE_CONTROL'?0:variant==='SHARED_TOP1_ADAPTER'?100:180,
    routerReplayIdentitySha256:
      variant==='DENSE_CONTROL'?'NONE':variant==='SHARED_TOP1_ADAPTER'?h('6'):h('7'),
    realMeasuredEvidence:true,
    ...measurementAuthority(),
    ...overrides,
  };
}

const truePlanOrigin={async verifyExperimentPlan(){return true;}};
const trueRosterOrigin={async verifyPrototypeRoster(){return true;}};
const trueFixtureOrigin={async verifyCampaignFixture(){return true;}};
const trueMeasurementOrigin={async verifyRoutingMeasurement(){return true;}};
const falseMeasurementOrigin={async verifyRoutingMeasurement(){return false;}};

async function fixture(){
  const p=await plan();
  const r=await roster(p);
  const f=rawFixture(p,r);
  const fixtureSha=await hsmeAdapterMoeRoutingCampaignFixtureV1Digest(f,hash);
  const rows=[];
  for(const variant of ['DENSE_CONTROL','SHARED_TOP1_ADAPTER','SHARED_TOP2_ADAPTER']){
    const row=rawRow(p,r,f,fixtureSha,variant);
    rows.push({
      rawMeasurement:row,
      expectedMeasurementSha256:
        await hsmeAdapterMoeRoutingMeasurementV1Digest(row,hash),
    });
  }
  return {p,r,f,fixtureSha,rows};
}

async function build(x,overrides={}){
  return buildHsmeAdapterMoeRoutingComparisonMatrixV1(
    overrides.p??x.p,
    overrides.planSha??x.p.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.r??x.r,
    overrides.rosterSha??x.r.rosterEvidenceSha256,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.f??x.f,
    overrides.fixtureSha??x.fixtureSha,
    overrides.fixtureOrigin??trueFixtureOrigin,
    overrides.rows??x.rows,
    overrides.measurementOrigin??trueMeasurementOrigin,
    hash,
  );
}

test('same frozen fixture yields deterministic dense Top-1 Top-2 matrix independent of row order',async()=>{
  const x=await fixture();
  const first=await build(x);
  const second=await build(x,{rows:[...x.rows].reverse()});

  assert.equal(first.state,'ADAPTER_MOE_ROUTING_MATRIX_READY_NOT_DISPOSED');
  assert.deepEqual(first.rows.map(row=>row.variant),[
    'DENSE_CONTROL','SHARED_TOP1_ADAPTER','SHARED_TOP2_ADAPTER',
  ]);
  assert.equal(first.selectionAllowed,false);
  assert.equal(first.winnerSelectionAllowed,false);
  assert.equal(first.prototypeAssemblyAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdapterMoeRoutingComparisonMatrixV1Digest(first,hash),
    first.matrixEvidenceSha256,
  );
});

test('same fixture seed runtime and evaluation identities are mandatory',async()=>{
  const x=await fixture();
  const drift={...x.rows[1].rawMeasurement,runtimeRepresentationSha256:h('f')};
  const driftSha=await hsmeAdapterMoeRoutingMeasurementV1Digest(drift,hash);
  const result=await build(x,{
    rows:[x.rows[0],{rawMeasurement:drift,expectedMeasurementSha256:driftSha},x.rows[2]],
  });
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_ROUTING_MEASUREMENT_BINDING_MISMATCH'),
  );
});

test('dense and sparse source identities bind exact baseline and prototype hashes',async()=>{
  const x=await fixture();
  const drift={...x.rows[2].rawMeasurement,sourceIdentitySha256:h('f')};
  const driftSha=await hsmeAdapterMoeRoutingMeasurementV1Digest(drift,hash);
  const result=await build(x,{
    rows:[x.rows[0],x.rows[1],{rawMeasurement:drift,expectedMeasurementSha256:driftSha}],
  });
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');
});

test('missing or duplicate mandatory variant fails closed',async()=>{
  const x=await fixture();
  const result=await build(x,{rows:[x.rows[0],x.rows[1],x.rows[1]]});
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_ROUTING_VARIANT_DUPLICATE_OR_MISSING')
    ||result.blockers.includes('ADAPTER_MOE_ROUTING_MEASUREMENT_BINDING_MISMATCH'),
  );
});

test('quality and hard-preservation dimensions cannot drift post-hoc',async()=>{
  const x=await fixture();
  const drift={
    ...x.rows[1].rawMeasurement,
    quality:[
      {dimension:'B',value:0.88},
      {dimension:'A',value:0.90},
      {dimension:'C',value:0.86},
    ],
  };
  const driftSha=await hsmeAdapterMoeRoutingMeasurementV1Digest(drift,hash);
  const result=await build(x,{
    rows:[x.rows[0],{rawMeasurement:drift,expectedMeasurementSha256:driftSha},x.rows[2]],
  });
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');
});

test('Top-1 and Top-2 activation counts are bounded by frozen case count',async()=>{
  const x=await fixture();
  const top1={
    ...x.rows[1].rawMeasurement,
    expertActivationCount:x.f.caseCount+1,
  };
  const top1Sha=await hsmeAdapterMoeRoutingMeasurementV1Digest(top1,hash);
  let result=await build(x,{
    rows:[x.rows[0],{rawMeasurement:top1,expectedMeasurementSha256:top1Sha},x.rows[2]],
  });
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');

  const top2={
    ...x.rows[2].rawMeasurement,
    expertActivationCount:x.f.caseCount*2+1,
  };
  const top2Sha=await hsmeAdapterMoeRoutingMeasurementV1Digest(top2,hash);
  result=await build(x,{
    rows:[x.rows[0],x.rows[1],{rawMeasurement:top2,expectedMeasurementSha256:top2Sha}],
  });
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');
});

test('measurement trusted origin is required for every row',async()=>{
  const x=await fixture();
  const result=await build(x,{measurementOrigin:falseMeasurementOrigin});
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_ROUTING_MEASUREMENT_ORIGIN_OR_DIGEST_INVALID'),
  );
});

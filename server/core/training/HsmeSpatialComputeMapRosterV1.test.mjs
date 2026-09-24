import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_SPATIAL_MEASUREMENTS_V1,
  HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeSpatialSparsityExperimentPlanV1Digest,
} from './HsmeSpatialSparsityExperimentPlanV1.ts';
import {
  HSME_SPATIAL_COMPUTE_MAP_SET_V1_SCHEMA,
  freezeHsmeSpatialComputeMapRosterV1,
  hsmeSpatialComputeMapRosterV1Digest,
  hsmeSpatialComputeMapSetV1Digest,
} from './HsmeSpatialComputeMapRosterV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
function h(ch){return ch.repeat(64);}

function authority(){
  return {
    spatialExecutionAllowed:false,
    spatialMapMutationAllowed:false,
    inferenceExecutionAllowed:false,
    fashionGeometryAuthorityGranted:false,
    projectMutationAllowed:false,
    artifactAuthorityGranted:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
  };
}

async function plan(){
  const base={
    schemaVersion:HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    stageRoutingPlanSha256:h('1'),
    regionFixtureSha256:h('2'),
    spatialPolicySha256:h('3'),
    prototypeSha256:h('4'),
    denseBaselineContentSha256:h('5'),
    runtimeRepresentationSha256:h('6'),
    hardwareClass:'synthetic-mobile-device-v1',
    fixtureSetSha256:h('7'),
    spatialRegionEvidenceSha256:h('8'),
    caseCount:20,
    gridWidth:32,
    gridHeight:32,
    regions:[
      {role:'CRITICAL_IDENTITY',evidenceSha256:h('9'),coveredCellCount:120},
      {role:'CRITICAL_GARMENT_LOGO_PATTERN',evidenceSha256:h('a'),coveredCellCount:180},
      {role:'CRITICAL_HANDS_ANATOMY',evidenceSha256:h('b'),coveredCellCount:80},
      {role:'CRITICAL_FINE_TEXTURE',evidenceSha256:h('c'),coveredCellCount:100},
      {role:'LOW_INFORMATION_BACKGROUND',evidenceSha256:h('d'),coveredCellCount:300},
    ],
    variants:[
      'FULL_SPATIAL_CONTROL',
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
    protectedRegionRoles:[
      'CRITICAL_IDENTITY',
      'CRITICAL_GARMENT_LOGO_PATTERN',
      'CRITICAL_HANDS_ANATOMY',
      'CRITICAL_FINE_TEXTURE',
    ],
    cheapPathAllowedRoles:['LOW_INFORMATION_BACKGROUND'],
    prunableRoles:['LOW_INFORMATION_BACKGROUND'],
    maxCheapPathAreaBps:3000,
    maxPrunedAreaBps:1000,
    minFullComputeAreaBps:7000,
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
    requiredMeasurements:[...HSME_SPATIAL_MEASUREMENTS_V1],
    deterministicSpatialMapRequired:true,
    sharedPathRequired:true,
    planEvidenceSha256:h('0'),
    ...authority(),
  };
  const planEvidenceSha256=
    await hsmeSpatialSparsityExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}

const roles=[
  'CRITICAL_IDENTITY',
  'CRITICAL_GARMENT_LOGO_PATTERN',
  'CRITICAL_HANDS_ANATOMY',
  'CRITICAL_FINE_TEXTURE',
  'LOW_INFORMATION_BACKGROUND',
];

function actions(backgroundAction){
  return roles.map((role,index)=>({
    role,
    action:role==='LOW_INFORMATION_BACKGROUND'
      ?backgroundAction
      :'FULL_SHARED',
    actionEvidenceSha256:h(String((index+1)%10)),
  }));
}

function candidate(p,variant,overrides={}){
  const values={
    FULL_SPATIAL_CONTROL:{
      regionActions:actions('FULL_SHARED'),
      fullComputeAreaBps:10000,
      cheapPathAreaBps:0,
      prunedAreaBps:0,
      fullComputeTokenWork:1024,
      cheapPathTokenWork:0,
      prunedTokenWork:0,
    },
    PROTECTED_REGION_CHEAP_BACKGROUND:{
      regionActions:actions('CHEAP_SHARED'),
      fullComputeAreaBps:7500,
      cheapPathAreaBps:2500,
      prunedAreaBps:0,
      fullComputeTokenWork:768,
      cheapPathTokenWork:256,
      prunedTokenWork:0,
    },
    BOUNDED_BACKGROUND_PRUNING:{
      regionActions:actions('PRUNED'),
      fullComputeAreaBps:9000,
      cheapPathAreaBps:0,
      prunedAreaBps:1000,
      fullComputeTokenWork:900,
      cheapPathTokenWork:0,
      prunedTokenWork:124,
    },
  }[variant];
  return {
    variant,
    experimentPlanSha256:p.planEvidenceSha256,
    spatialMapSha256:h(
      variant==='FULL_SPATIAL_CONTROL'
        ?'a'
        :variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
          ?'b'
          :'c',
    ),
    spatialMapEvidenceSha256:h(
      variant==='FULL_SPATIAL_CONTROL'
        ?'d'
        :variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
          ?'e'
          :'f',
    ),
    gridWidth:p.gridWidth,
    gridHeight:p.gridHeight,
    ...values,
    deterministicReplayIdentitySha256:h(
      variant==='FULL_SPATIAL_CONTROL'
        ?'1'
        :variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
          ?'2'
          :'3',
    ),
    reviewedBeforeExecution:true,
    ...overrides,
  };
}

function rawMapSet(p,overrides={}){
  return {
    schemaVersion:HSME_SPATIAL_COMPUTE_MAP_SET_V1_SCHEMA,
    experimentPlanSha256:p.planEvidenceSha256,
    prototypeSha256:p.prototypeSha256,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,
    fixtureSetSha256:p.fixtureSetSha256,
    candidates:[
      candidate(p,'BOUNDED_BACKGROUND_PRUNING'),
      candidate(p,'FULL_SPATIAL_CONTROL'),
      candidate(p,'PROTECTED_REGION_CHEAP_BACKGROUND'),
    ],
    ...authority(),
    ...overrides,
  };
}

const truePlanOrigin={
  async verifySpatialExperimentPlan(){return true;},
};
const falsePlanOrigin={
  async verifySpatialExperimentPlan(){return false;},
};
const trueSetOrigin={
  async verifySpatialComputeMapSet(){return true;},
};
const falseSetOrigin={
  async verifySpatialComputeMapSet(){return false;},
};

async function fixture(){
  const p=await plan();
  const set=rawMapSet(p);
  const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
  return {p,set,setSha};
}

async function freeze(f,overrides={}){
  return freezeHsmeSpatialComputeMapRosterV1(
    overrides.plan??f.p,
    overrides.planSha??f.p.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.set??f.set,
    overrides.setSha??f.setSha,
    overrides.setOrigin??trueSetOrigin,
    hash,
  );
}

test('reviewed map candidates freeze in canonical variant order',async()=>{
  const f=await fixture();
  const first=await freeze(f);
  const reversed={...f.set,candidates:[...f.set.candidates].reverse()};
  const reversedSha=await hsmeSpatialComputeMapSetV1Digest(reversed,hash);
  const second=await freeze(f,{set:reversed,setSha:reversedSha});

  assert.equal(
    first.state,
    'SPATIAL_COMPUTE_MAP_ROSTER_FROZEN_NOT_EXECUTED',
  );
  assert.deepEqual(first.blockers,[]);
  assert.deepEqual(
    first.candidates.map(value=>value.variant),
    [
      'FULL_SPATIAL_CONTROL',
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
  );
  assert.equal(
    first.candidates[0].regionActions.every(
      value=>value.action==='FULL_SHARED',
    ),
    true,
  );
  assert.equal(
    first.candidates[1].regionActions.at(-1).action,
    'CHEAP_SHARED',
  );
  assert.equal(
    first.candidates[2].regionActions.at(-1).action,
    'PRUNED',
  );
  assert.equal(first.spatialExecutionAllowed,false);
  assert.equal(first.fashionGeometryAuthorityGranted,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeSpatialComputeMapRosterV1Digest(first,hash),
    first.rosterEvidenceSha256,
  );
});

test('plan and map-set exact origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
  assert.ok(a.blockers.includes('SPATIAL_COMPUTE_MAP_PLAN_ORIGIN_UNVERIFIED'));

  const b=await freeze(f,{setOrigin:falseSetOrigin});
  assert.equal(b.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
  assert.ok(b.blockers.includes('SPATIAL_COMPUTE_MAP_SET_ORIGIN_UNVERIFIED'));
});

test('protected critical region cannot enter cheap or pruned path',async()=>{
  const f=await fixture();

  for(const action of ['CHEAP_SHARED','PRUNED']){
    const set=rawMapSet(f.p,{
      candidates:f.set.candidates.map(value=>
        value.variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
          ?{
            ...value,
            regionActions:value.regionActions.map(entry=>
              entry.role==='CRITICAL_IDENTITY'
                ?{...entry,action}
                :entry
            ),
          }
          :value
      ),
    });
    const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
    const result=await freeze(f,{set,setSha});
    assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
    assert.ok(
      result.blockers.includes(
        'SPATIAL_COMPUTE_MAP_PROTECTED_REGION_ACTION_INVALID',
      ),
    );
  }
});

test('full spatial control is exactly 100 percent full shared compute',async()=>{
  const f=await fixture();
  const set=rawMapSet(f.p,{
    candidates:f.set.candidates.map(value=>
      value.variant==='FULL_SPATIAL_CONTROL'
        ?{
          ...value,
          fullComputeAreaBps:9000,
          cheapPathAreaBps:1000,
        }
        :value
    ),
  });
  const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
  const result=await freeze(f,{set,setSha});
  assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes('SPATIAL_COMPUTE_MAP_FULL_CONTROL_INVALID'),
  );
});

test('cheap and pruned area budgets cannot exceed the frozen plan',async()=>{
  const f=await fixture();

  const cases=[
    {
      variant:'PROTECTED_REGION_CHEAP_BACKGROUND',
      patch:{
        fullComputeAreaBps:6500,
        cheapPathAreaBps:3500,
      },
    },
    {
      variant:'BOUNDED_BACKGROUND_PRUNING',
      patch:{
        fullComputeAreaBps:8500,
        prunedAreaBps:1500,
      },
    },
  ];
  for(const item of cases){
    const set=rawMapSet(f.p,{
      candidates:f.set.candidates.map(value=>
        value.variant===item.variant?{...value,...item.patch}:value
      ),
    });
    const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
    const result=await freeze(f,{set,setSha});
    assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
    assert.ok(
      result.blockers.includes('SPATIAL_COMPUTE_MAP_AREA_BUDGET_EXCEEDED'),
    );
  }
});

test('map set must contain exactly the frozen plan variants',async()=>{
  const f=await fixture();
  const set={
    ...f.set,
    candidates:f.set.candidates.slice(0,2),
  };
  const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
  const result=await freeze(f,{set,setSha});
  assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes('SPATIAL_COMPUTE_MAP_VARIANT_SET_MISMATCH'),
  );
});

test('grid prototype fixture and runtime binding drift fail closed',async()=>{
  const f=await fixture();
  for(const patch of [
    {prototypeSha256:h('f')},
    {fixtureSetSha256:h('e')},
    {runtimeRepresentationSha256:h('d')},
  ]){
    const set=rawMapSet(f.p,patch);
    const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
    const result=await freeze(f,{set,setSha});
    assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
    assert.ok(
      result.blockers.includes('SPATIAL_COMPUTE_MAP_SET_BINDING_MISMATCH'),
    );
  }

  const set=rawMapSet(f.p,{
    candidates:f.set.candidates.map(value=>
      value.variant==='FULL_SPATIAL_CONTROL'
        ?{...value,gridWidth:64}
        :value
    ),
  });
  const setSha=await hsmeSpatialComputeMapSetV1Digest(set,hash);
  const result=await freeze(f,{set,setSha});
  assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes(
      'SPATIAL_COMPUTE_MAP_CANDIDATE_BINDING_MISMATCH',
    ),
  );
});

test('map authority widening and unknown fields fail exact schema',async()=>{
  const f=await fixture();
  for(const set of [
    {...f.set,spatialExecutionAllowed:true},
    {...f.set,fashionGeometryAuthorityGranted:true},
    {...f.set,runtimeMutableTokenList:[1,2,3]},
  ]){
    const result=await freeze(f,{set,setSha:h('0')});
    assert.equal(result.state,'SPATIAL_COMPUTE_MAP_ROSTER_INVALID');
    assert.ok(result.blockers.includes('SPATIAL_COMPUTE_MAP_SET_INVALID'));
  }
});

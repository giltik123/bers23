import {
  HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeStageRoutingExperimentPlanV1Digest,
  type HsmeStageRoutingExperimentPlanV1,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPATIAL_REGION_FIXTURE_V1_SCHEMA =
  'BERS_HSME_SPATIAL_REGION_FIXTURE_V1' as const;
export const HSME_SPATIAL_REGION_FIXTURE_DIGEST_DOMAIN =
  'bers:hsme:spatial-region-fixture:v1\0' as const;
export const HSME_SPATIAL_SPARSITY_POLICY_V1_SCHEMA =
  'BERS_HSME_SPATIAL_SPARSITY_POLICY_V1' as const;
export const HSME_SPATIAL_SPARSITY_POLICY_DIGEST_DOMAIN =
  'bers:hsme:spatial-sparsity-policy:v1\0' as const;
export const HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA =
  'BERS_HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1' as const;
export const HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_DIGEST_DOMAIN =
  'bers:hsme:spatial-sparsity-experiment-plan:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export const HSME_SPATIAL_REGION_ROLES_V1=Object.freeze([
  'CRITICAL_IDENTITY',
  'CRITICAL_GARMENT_LOGO_PATTERN',
  'CRITICAL_HANDS_ANATOMY',
  'CRITICAL_FINE_TEXTURE',
  'LOW_INFORMATION_BACKGROUND',
] as const);

export const HSME_SPATIAL_VARIANTS_V1=Object.freeze([
  'FULL_SPATIAL_CONTROL',
  'PROTECTED_REGION_CHEAP_BACKGROUND',
  'BOUNDED_BACKGROUND_PRUNING',
] as const);

export const HSME_SPATIAL_REQUIRED_QUALITY_DIMENSIONS_V1=Object.freeze([
  'ANATOMY_ARTIFACT',
  'GARMENT_LOGO_PATTERN',
  'IDENTITY_PERSON',
  'NON_TARGET_PRESERVATION',
] as const);

export const HSME_SPATIAL_MEASUREMENTS_V1=Object.freeze([
  'QUALITY_VECTOR',
  'HARD_PRESERVATION_FAILURES',
  'CRITICAL_FAILURE_COUNT',
  'WALL_CLOCK_US',
  'FULL_COMPUTE_TOKEN_WORK',
  'CHEAP_PATH_TOKEN_WORK',
  'PRUNED_TOKEN_WORK',
  'ACTIVE_WEIGHTS_BYTES',
  'PEAK_MEMORY_BYTES',
  'FLASH_BYTES_MOVED',
  'RAM_BYTES_MOVED',
  'ACCELERATOR_BYTES_MOVED',
  'SPATIAL_MAP_REPLAY_IDENTITY',
] as const);

export type HsmeSpatialRegionRoleV1=
  typeof HSME_SPATIAL_REGION_ROLES_V1[number];
export type HsmeSpatialVariantV1=
  typeof HSME_SPATIAL_VARIANTS_V1[number];
export type HsmeSpatialMeasurementV1=
  typeof HSME_SPATIAL_MEASUREMENTS_V1[number];

export type HsmeSpatialRegionEvidenceV1=Readonly<{
  role:HsmeSpatialRegionRoleV1;
  evidenceSha256:string;
  coveredCellCount:number;
}>;

export type HsmeSpatialRegionFixtureV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_REGION_FIXTURE_V1_SCHEMA;
  stageRoutingPlanSha256:string;
  fixtureSetSha256:string;
  spatialRegionEvidenceSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  gridWidth:number;
  gridHeight:number;
  regions:readonly HsmeSpatialRegionEvidenceV1[];
  realReviewedRegionEvidence:true;
  spatialExecutionAllowed:false;
  spatialMapMutationAllowed:false;
  inferenceExecutionAllowed:false;
  fashionGeometryAuthorityGranted:false;
  projectMutationAllowed:false;
  artifactAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
}>;

export type HsmeSpatialSparsityPolicyV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_SPARSITY_POLICY_V1_SCHEMA;
  stageRoutingPlanSha256:string;
  regionFixtureSha256:string;
  prototypeSha256:string;
  denseBaselineContentSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  variants:readonly HsmeSpatialVariantV1[];
  protectedRegionRoles:readonly HsmeSpatialRegionRoleV1[];
  cheapPathAllowedRoles:readonly HsmeSpatialRegionRoleV1[];
  prunableRoles:readonly HsmeSpatialRegionRoleV1[];
  maxCheapPathAreaBps:number;
  maxPrunedAreaBps:number;
  minFullComputeAreaBps:number;
  deterministicSpatialMapRequired:true;
  sharedPathRequired:true;
  postHocThresholdMutationAllowed:false;
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  requiredMeasurements:readonly HsmeSpatialMeasurementV1[];
  reviewState:'SPATIAL_SPARSITY_POLICY_REVIEWED';
  spatialExecutionAllowed:false;
  spatialMapMutationAllowed:false;
  inferenceExecutionAllowed:false;
  fashionGeometryAuthorityGranted:false;
  projectMutationAllowed:false;
  artifactAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
}>;

export interface HsmeSpatialStageRoutingPlanOriginVerifierV1{
  verifyStageRoutingPlan(
    plan:HsmeStageRoutingExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSpatialRegionFixtureOriginVerifierV1{
  verifySpatialRegionFixture(
    fixture:HsmeSpatialRegionFixtureV1,
    expectedFixtureSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSpatialSparsityPolicyOriginVerifierV1{
  verifySpatialSparsityPolicy(
    policy:HsmeSpatialSparsityPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeSpatialSparsityExperimentPlanV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA;
  state:
    |'SPATIAL_SPARSITY_PLAN_INVALID'
    |'SPATIAL_SPARSITY_PLAN_BLOCKED'
    |'SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  stageRoutingPlanSha256:string|'UNKNOWN';
  regionFixtureSha256:string|'UNKNOWN';
  spatialPolicySha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  spatialRegionEvidenceSha256:string|'UNKNOWN';
  caseCount:number|'UNKNOWN';
  gridWidth:number|'UNKNOWN';
  gridHeight:number|'UNKNOWN';
  regions:readonly HsmeSpatialRegionEvidenceV1[];
  variants:readonly HsmeSpatialVariantV1[];
  protectedRegionRoles:readonly HsmeSpatialRegionRoleV1[];
  cheapPathAllowedRoles:readonly HsmeSpatialRegionRoleV1[];
  prunableRoles:readonly HsmeSpatialRegionRoleV1[];
  maxCheapPathAreaBps:number|'UNKNOWN';
  maxPrunedAreaBps:number|'UNKNOWN';
  minFullComputeAreaBps:number|'UNKNOWN';
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  requiredMeasurements:readonly HsmeSpatialMeasurementV1[];
  deterministicSpatialMapRequired:boolean;
  sharedPathRequired:boolean;
  planEvidenceSha256:string|'UNKNOWN';
  spatialExecutionAllowed:false;
  spatialMapMutationAllowed:false;
  inferenceExecutionAllowed:false;
  fashionGeometryAuthorityGranted:false;
  projectMutationAllowed:false;
  artifactAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
}>;

export class HsmeSpatialSparsityExperimentPlanV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSpatialSparsityExperimentPlanV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSpatialRegionFixtureV1(
  raw:unknown,
):HsmeSpatialRegionFixtureV1{
  const r=exactRecord(raw,[
    'schemaVersion','stageRoutingPlanSha256','fixtureSetSha256',
    'spatialRegionEvidenceSha256','runtimeRepresentationSha256',
    'hardwareClass','caseCount','gridWidth','gridHeight','regions',
    'realReviewedRegionEvidence','spatialExecutionAllowed',
    'spatialMapMutationAllowed','inferenceExecutionAllowed',
    'fashionGeometryAuthorityGranted','projectMutationAllowed',
    'artifactAuthorityGranted','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','aeeExecutionAuthorityGranted',
  ],'fixture');
  if(r.schemaVersion!==HSME_SPATIAL_REGION_FIXTURE_V1_SCHEMA){
    fail('hsme_spatial_fixture_schema','spatial fixture schema unsupported');
  }
  if(r.realReviewedRegionEvidence!==true){
    fail(
      'hsme_spatial_fixture_review',
      'realReviewedRegionEvidence must be true',
    );
  }
  assertNoAuthority(r,'fixture');
  if(
    !Array.isArray(r.regions)
    ||r.regions.length!==HSME_SPATIAL_REGION_ROLES_V1.length
  ){
    fail(
      'hsme_spatial_fixture_regions',
      'fixture must cover every required spatial role exactly once',
    );
  }
  const regions=r.regions.map((value,index)=>
    normalizeRegionEvidence(value,'fixture.regions['+index+']')
  ).sort(compareRegionRoles);
  if(
    new Set(regions.map(value=>value.role)).size!==regions.length
    ||regions.some(
      (value,index)=>value.role!==HSME_SPATIAL_REGION_ROLES_V1[index],
    )
  ){
    fail(
      'hsme_spatial_fixture_regions',
      'fixture spatial role coverage is incomplete or duplicated',
    );
  }
  const gridWidth=safeInteger(
    r.gridWidth,'fixture.gridWidth',1,4096,
  );
  const gridHeight=safeInteger(
    r.gridHeight,'fixture.gridHeight',1,4096,
  );
  const maxCells=checkedMultiply(gridWidth,gridHeight);
  if(regions.some(region=>region.coveredCellCount>maxCells)){
    fail(
      'hsme_spatial_fixture_region_cells',
      'region coverage exceeds spatial grid',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_REGION_FIXTURE_V1_SCHEMA,
    stageRoutingPlanSha256:sha256(
      r.stageRoutingPlanSha256,'fixture.stageRoutingPlanSha256',
    ),
    fixtureSetSha256:sha256(
      r.fixtureSetSha256,'fixture.fixtureSetSha256',
    ),
    spatialRegionEvidenceSha256:sha256(
      r.spatialRegionEvidenceSha256,
      'fixture.spatialRegionEvidenceSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'fixture.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'fixture.hardwareClass',160),
    caseCount:safeInteger(r.caseCount,'fixture.caseCount',1,1_000_000),
    gridWidth,
    gridHeight,
    regions:Object.freeze(regions),
    realReviewedRegionEvidence:true,
    ...authorityBoundary(),
  });
}

export async function hsmeSpatialRegionFixtureV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPATIAL_REGION_FIXTURE_DIGEST_DOMAIN,
    normalizeHsmeSpatialRegionFixtureV1(raw),
    hash,
  );
}

export function normalizeHsmeSpatialSparsityPolicyV1(
  raw:unknown,
):HsmeSpatialSparsityPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','stageRoutingPlanSha256','regionFixtureSha256',
    'prototypeSha256','denseBaselineContentSha256',
    'runtimeRepresentationSha256','hardwareClass','variants',
    'protectedRegionRoles','cheapPathAllowedRoles','prunableRoles',
    'maxCheapPathAreaBps','maxPrunedAreaBps','minFullComputeAreaBps',
    'deterministicSpatialMapRequired','sharedPathRequired',
    'postHocThresholdMutationAllowed','qualityDimensions',
    'hardPreservationDimensions','requiredMeasurements','reviewState',
    'spatialExecutionAllowed','spatialMapMutationAllowed',
    'inferenceExecutionAllowed','fashionGeometryAuthorityGranted',
    'projectMutationAllowed','artifactAuthorityGranted',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'aeeExecutionAuthorityGranted',
  ],'policy');
  if(r.schemaVersion!==HSME_SPATIAL_SPARSITY_POLICY_V1_SCHEMA){
    fail('hsme_spatial_policy_schema','spatial policy schema unsupported');
  }
  if(r.reviewState!=='SPATIAL_SPARSITY_POLICY_REVIEWED'){
    fail('hsme_spatial_policy_review','spatial policy review state invalid');
  }
  if(
    r.deterministicSpatialMapRequired!==true
    ||r.sharedPathRequired!==true
    ||r.postHocThresholdMutationAllowed!==false
  ){
    fail(
      'hsme_spatial_policy_boundary',
      'deterministic/shared/post-hoc boundary invalid',
    );
  }
  assertNoAuthority(r,'policy');

  const variants=enumSet(
    r.variants,HSME_SPATIAL_VARIANTS_V1,'policy.variants',2,3,
  ).sort((a,b)=>
    HSME_SPATIAL_VARIANTS_V1.indexOf(a)
    -HSME_SPATIAL_VARIANTS_V1.indexOf(b)
  );
  for(const required of [
    'FULL_SPATIAL_CONTROL',
    'PROTECTED_REGION_CHEAP_BACKGROUND',
  ] as const){
    if(!variants.includes(required)){
      fail(
        'hsme_spatial_policy_variant',
        'mandatory spatial variant missing: '+required,
      );
    }
  }

  const protectedRegionRoles=enumSet(
    r.protectedRegionRoles,
    HSME_SPATIAL_REGION_ROLES_V1,
    'policy.protectedRegionRoles',
    4,
    4,
  ).sort(compareRoleValues);
  const expectedProtected=HSME_SPATIAL_REGION_ROLES_V1.slice(0,4);
  if(
    protectedRegionRoles.length!==expectedProtected.length
    ||protectedRegionRoles.some(
      (role,index)=>role!==expectedProtected[index],
    )
  ){
    fail(
      'hsme_spatial_policy_protected_roles',
      'all critical roles must remain protected',
    );
  }

  const cheapPathAllowedRoles=enumSet(
    r.cheapPathAllowedRoles,
    HSME_SPATIAL_REGION_ROLES_V1,
    'policy.cheapPathAllowedRoles',
    1,
    1,
  );
  if(
    cheapPathAllowedRoles[0]!=='LOW_INFORMATION_BACKGROUND'
  ){
    fail(
      'hsme_spatial_policy_cheap_role',
      'only LOW_INFORMATION_BACKGROUND may use cheap path',
    );
  }
  const prunableRoles=enumSet(
    r.prunableRoles,
    HSME_SPATIAL_REGION_ROLES_V1,
    'policy.prunableRoles',
    0,
    1,
  );
  if(
    prunableRoles.some(role=>role!=='LOW_INFORMATION_BACKGROUND')
  ){
    fail(
      'hsme_spatial_policy_prunable_role',
      'only LOW_INFORMATION_BACKGROUND may be prunable',
    );
  }

  const maxCheapPathAreaBps=safeInteger(
    r.maxCheapPathAreaBps,'policy.maxCheapPathAreaBps',0,10_000,
  );
  const maxPrunedAreaBps=safeInteger(
    r.maxPrunedAreaBps,'policy.maxPrunedAreaBps',0,10_000,
  );
  const minFullComputeAreaBps=safeInteger(
    r.minFullComputeAreaBps,'policy.minFullComputeAreaBps',0,10_000,
  );
  if(
    maxPrunedAreaBps>maxCheapPathAreaBps
    ||minFullComputeAreaBps+maxCheapPathAreaBps>10_000
  ){
    fail(
      'hsme_spatial_policy_area_budget',
      'spatial area budgets are inconsistent',
    );
  }
  if(
    !variants.includes('BOUNDED_BACKGROUND_PRUNING')
    &&(maxPrunedAreaBps!==0||prunableRoles.length!==0)
  ){
    fail(
      'hsme_spatial_policy_pruning',
      'pruning budgets require the pruning variant',
    );
  }
  if(
    variants.includes('BOUNDED_BACKGROUND_PRUNING')
    &&(maxPrunedAreaBps===0||prunableRoles.length!==1)
  ){
    fail(
      'hsme_spatial_policy_pruning',
      'pruning variant requires bounded background pruning',
    );
  }

  const qualityDimensions=identifierSet(
    r.qualityDimensions,'policy.qualityDimensions',4,32,100,
  );
  for(const required of HSME_SPATIAL_REQUIRED_QUALITY_DIMENSIONS_V1){
    if(!qualityDimensions.includes(required)){
      fail(
        'hsme_spatial_policy_quality_dimension',
        'required quality dimension missing: '+required,
      );
    }
  }
  const hardPreservationDimensions=identifierSet(
    r.hardPreservationDimensions,
    'policy.hardPreservationDimensions',
    4,
    32,
    100,
  );
  for(const required of HSME_SPATIAL_REQUIRED_QUALITY_DIMENSIONS_V1){
    if(!hardPreservationDimensions.includes(required)){
      fail(
        'hsme_spatial_policy_hard_dimension',
        'required hard preservation dimension missing: '+required,
      );
    }
  }
  if(
    hardPreservationDimensions.some(
      dimension=>!qualityDimensions.includes(dimension),
    )
  ){
    fail(
      'hsme_spatial_policy_hard_dimension',
      'hard preservation dimensions must be quality dimensions',
    );
  }

  const requiredMeasurements=enumSet(
    r.requiredMeasurements,
    HSME_SPATIAL_MEASUREMENTS_V1,
    'policy.requiredMeasurements',
    HSME_SPATIAL_MEASUREMENTS_V1.length,
    HSME_SPATIAL_MEASUREMENTS_V1.length,
  ).sort((a,b)=>
    HSME_SPATIAL_MEASUREMENTS_V1.indexOf(a)
    -HSME_SPATIAL_MEASUREMENTS_V1.indexOf(b)
  );
  if(
    HSME_SPATIAL_MEASUREMENTS_V1.some(
      value=>!requiredMeasurements.includes(value),
    )
  ){
    fail(
      'hsme_spatial_policy_measurement',
      'all mandatory spatial measurements are required',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_SPATIAL_SPARSITY_POLICY_V1_SCHEMA,
    stageRoutingPlanSha256:sha256(
      r.stageRoutingPlanSha256,'policy.stageRoutingPlanSha256',
    ),
    regionFixtureSha256:sha256(
      r.regionFixtureSha256,'policy.regionFixtureSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'policy.prototypeSha256'),
    denseBaselineContentSha256:sha256(
      r.denseBaselineContentSha256,
      'policy.denseBaselineContentSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'policy.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'policy.hardwareClass',160),
    variants:Object.freeze(variants),
    protectedRegionRoles:Object.freeze(protectedRegionRoles),
    cheapPathAllowedRoles:Object.freeze(cheapPathAllowedRoles),
    prunableRoles:Object.freeze(prunableRoles),
    maxCheapPathAreaBps,
    maxPrunedAreaBps,
    minFullComputeAreaBps,
    deterministicSpatialMapRequired:true,
    sharedPathRequired:true,
    postHocThresholdMutationAllowed:false,
    qualityDimensions:Object.freeze(qualityDimensions),
    hardPreservationDimensions:Object.freeze(hardPreservationDimensions),
    requiredMeasurements:Object.freeze(requiredMeasurements),
    reviewState:'SPATIAL_SPARSITY_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeSpatialSparsityPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPATIAL_SPARSITY_POLICY_DIGEST_DOMAIN,
    normalizeHsmeSpatialSparsityPolicyV1(raw),
    hash,
  );
}

export async function freezeHsmeSpatialSparsityExperimentPlanV1(
  stagePlan:HsmeStageRoutingExperimentPlanV1,
  expectedStagePlanSha256:string,
  stagePlanOrigin:HsmeSpatialStageRoutingPlanOriginVerifierV1,
  rawFixture:unknown,
  expectedFixtureSha256:string,
  fixtureOrigin:HsmeSpatialRegionFixtureOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeSpatialSparsityPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSpatialSparsityExperimentPlanV1>{
  if(!readyStagePlan(stagePlan)){
    return blocked(['SPATIAL_SPARSITY_FROZEN_SUBSTRATE_REQUIRED']);
  }

  let stagePlanSha:string;
  try{
    stagePlanSha=await hsmeStageRoutingExperimentPlanV1Digest(
      stagePlan,hash,
    );
  }catch{
    return invalid(['SPATIAL_SPARSITY_STAGE_PLAN_REHASH_INVALID']);
  }
  const common={stageRoutingPlanSha256:stagePlanSha};
  if(!exactDigest(
    expectedStagePlanSha256,
    stagePlanSha,
    stagePlan.planEvidenceSha256 as string,
  )){
    return invalid(['SPATIAL_SPARSITY_STAGE_PLAN_REHASH_MISMATCH'],common);
  }
  if(!await verify(
    ()=>stagePlanOrigin.verifyStageRoutingPlan(stagePlan,stagePlanSha),
  )){
    return invalid(['SPATIAL_SPARSITY_STAGE_PLAN_ORIGIN_UNVERIFIED'],common);
  }

  let fixture:HsmeSpatialRegionFixtureV1;
  let fixtureSha:string;
  try{
    fixture=normalizeHsmeSpatialRegionFixtureV1(rawFixture);
    fixtureSha=await hsmeSpatialRegionFixtureV1Digest(fixture,hash);
  }catch{
    return invalid(['SPATIAL_SPARSITY_REGION_FIXTURE_INVALID'],common);
  }
  const withFixture={...common,regionFixtureSha256:fixtureSha};
  if(!exactDigest(expectedFixtureSha256,fixtureSha,fixtureSha)){
    return invalid(
      ['SPATIAL_SPARSITY_REGION_FIXTURE_DIGEST_MISMATCH'],
      withFixture,
    );
  }
  if(!await verify(
    ()=>fixtureOrigin.verifySpatialRegionFixture(fixture,fixtureSha),
  )){
    return invalid(
      ['SPATIAL_SPARSITY_REGION_FIXTURE_ORIGIN_UNVERIFIED'],
      withFixture,
    );
  }
  if(
    fixture.stageRoutingPlanSha256!==stagePlanSha
    ||fixture.runtimeRepresentationSha256!==
      stagePlan.runtimeRepresentationSha256
    ||fixture.hardwareClass!==stagePlan.hardwareClass
  ){
    return invalid(
      ['SPATIAL_SPARSITY_REGION_FIXTURE_BINDING_MISMATCH'],
      withFixture,
    );
  }

  let policy:HsmeSpatialSparsityPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeSpatialSparsityPolicyV1(rawPolicy);
    policySha=await hsmeSpatialSparsityPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['SPATIAL_SPARSITY_POLICY_INVALID'],withFixture);
  }
  const bound={...withFixture,spatialPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['SPATIAL_SPARSITY_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>policyOrigin.verifySpatialSparsityPolicy(policy,policySha),
  )){
    return invalid(['SPATIAL_SPARSITY_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    policy.stageRoutingPlanSha256!==stagePlanSha
    ||policy.regionFixtureSha256!==fixtureSha
    ||policy.prototypeSha256!==stagePlan.prototypeSha256
    ||policy.denseBaselineContentSha256!==
      stagePlan.denseBaselineContentSha256
    ||policy.runtimeRepresentationSha256!==
      stagePlan.runtimeRepresentationSha256
    ||policy.hardwareClass!==stagePlan.hardwareClass
  ){
    return invalid(['SPATIAL_SPARSITY_POLICY_BINDING_MISMATCH'],bound);
  }

  const payload={
    schemaVersion:HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    stageRoutingPlanSha256:stagePlanSha,
    regionFixtureSha256:fixtureSha,
    spatialPolicySha256:policySha,
    prototypeSha256:stagePlan.prototypeSha256,
    denseBaselineContentSha256:stagePlan.denseBaselineContentSha256,
    runtimeRepresentationSha256:stagePlan.runtimeRepresentationSha256,
    hardwareClass:stagePlan.hardwareClass,
    fixtureSetSha256:fixture.fixtureSetSha256,
    spatialRegionEvidenceSha256:fixture.spatialRegionEvidenceSha256,
    caseCount:fixture.caseCount,
    gridWidth:fixture.gridWidth,
    gridHeight:fixture.gridHeight,
    regions:fixture.regions,
    variants:policy.variants,
    protectedRegionRoles:policy.protectedRegionRoles,
    cheapPathAllowedRoles:policy.cheapPathAllowedRoles,
    prunableRoles:policy.prunableRoles,
    maxCheapPathAreaBps:policy.maxCheapPathAreaBps,
    maxPrunedAreaBps:policy.maxPrunedAreaBps,
    minFullComputeAreaBps:policy.minFullComputeAreaBps,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
    requiredMeasurements:policy.requiredMeasurements,
    deterministicSpatialMapRequired:true,
    sharedPathRequired:true,
    ...authorityBoundary(),
  };
  const planEvidenceSha256=await digest(
    HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,planEvidenceSha256});
}

export async function hsmeSpatialSparsityExperimentPlanV1Digest(
  value:HsmeSpatialSparsityExperimentPlanV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED'
    ||value.planEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_spatial_plan_digest_state',
      'only FROZEN_NOT_EXECUTED plan is digestible',
    );
  }
  const {planEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeRegionEvidence(
  raw:unknown,
  path:string,
):HsmeSpatialRegionEvidenceV1{
  const r=exactRecord(
    raw,
    ['role','evidenceSha256','coveredCellCount'],
    path,
  );
  return deepFreeze({
    role:enumValue(r.role,HSME_SPATIAL_REGION_ROLES_V1,path+'.role'),
    evidenceSha256:sha256(r.evidenceSha256,path+'.evidenceSha256'),
    coveredCellCount:safeInteger(
      r.coveredCellCount,path+'.coveredCellCount',1,16_777_216,
    ),
  });
}

function readyStagePlan(plan:HsmeStageRoutingExperimentPlanV1):boolean{
  return plan.schemaVersion===HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA
    &&plan.state==='STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED'
    &&plan.blockers.length===0
    &&plan.planEvidenceSha256!=='UNKNOWN'
    &&plan.prototypeSha256!=='UNKNOWN'
    &&plan.denseBaselineContentSha256!=='UNKNOWN'
    &&plan.runtimeRepresentationSha256!=='UNKNOWN'
    &&plan.hardwareClass!=='UNKNOWN'
    &&plan.sharedPathRequired===true
    &&plan.stageRoutingExecutionAllowed===false
    &&plan.inferenceExecutionAllowed===false
    &&plan.modelInstallAllowed===false
    &&plan.modelFleetPromotionAllowed===false
    &&plan.durableModelFleetPromotionAllowed===false
    &&plan.productionAuthorityGranted===false
    &&plan.providerAuthorityGranted===false
    &&plan.billingAuthorityGranted===false
    &&plan.projectArtifactMutationAllowed===false
    &&plan.aeeExecutionAuthorityGranted===false;
}

type PartialOutput=Partial<Pick<
  HsmeSpatialSparsityExperimentPlanV1,
  'stageRoutingPlanSha256'|'regionFixtureSha256'|'spatialPolicySha256'
>>;

function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeSpatialSparsityExperimentPlanV1{
  return terminal('SPATIAL_SPARSITY_PLAN_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeSpatialSparsityExperimentPlanV1{
  return terminal('SPATIAL_SPARSITY_PLAN_INVALID',blockers,values);
}
function terminal(
  state:'SPATIAL_SPARSITY_PLAN_INVALID'|'SPATIAL_SPARSITY_PLAN_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSpatialSparsityExperimentPlanV1{
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    stageRoutingPlanSha256:values.stageRoutingPlanSha256??'UNKNOWN',
    regionFixtureSha256:values.regionFixtureSha256??'UNKNOWN',
    spatialPolicySha256:values.spatialPolicySha256??'UNKNOWN',
    prototypeSha256:'UNKNOWN',
    denseBaselineContentSha256:'UNKNOWN',
    runtimeRepresentationSha256:'UNKNOWN',
    hardwareClass:'UNKNOWN',
    fixtureSetSha256:'UNKNOWN',
    spatialRegionEvidenceSha256:'UNKNOWN',
    caseCount:'UNKNOWN',
    gridWidth:'UNKNOWN',
    gridHeight:'UNKNOWN',
    regions:Object.freeze([]),
    variants:Object.freeze([]),
    protectedRegionRoles:Object.freeze([]),
    cheapPathAllowedRoles:Object.freeze([]),
    prunableRoles:Object.freeze([]),
    maxCheapPathAreaBps:'UNKNOWN',
    maxPrunedAreaBps:'UNKNOWN',
    minFullComputeAreaBps:'UNKNOWN',
    qualityDimensions:Object.freeze([]),
    hardPreservationDimensions:Object.freeze([]),
    requiredMeasurements:Object.freeze([]),
    deterministicSpatialMapRequired:false,
    sharedPathRequired:false,
    planEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    spatialExecutionAllowed:false as const,
    spatialMapMutationAllowed:false as const,
    inferenceExecutionAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    projectMutationAllowed:false as const,
    artifactAuthorityGranted:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    aeeExecutionAuthorityGranted:false as const,
  });
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_spatial_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function enumSet<T extends readonly string[]>(
  raw:unknown,
  allowed:T,
  path:string,
  min:number,
  max:number,
):T[number][]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail('hsme_spatial_value',path+' cardinality invalid');
  }
  const values=raw.map((value,index)=>
    enumValue(value,allowed,path+'['+index+']')
  );
  if(new Set(values).size!==values.length){
    fail('hsme_spatial_value',path+' contains duplicates');
  }
  return values;
}

function identifierSet(
  raw:unknown,path:string,min:number,max:number,maxLength:number,
):string[]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail('hsme_spatial_value',path+' cardinality invalid');
  }
  const values=raw.map((value,index)=>
    identifier(value,path+'['+index+']',maxLength)
  ).sort(lexical);
  if(new Set(values).size!==values.length){
    fail('hsme_spatial_value',path+' contains duplicates');
  }
  return values;
}

function compareRegionRoles(
  a:HsmeSpatialRegionEvidenceV1,
  b:HsmeSpatialRegionEvidenceV1,
):number{
  return HSME_SPATIAL_REGION_ROLES_V1.indexOf(a.role)
    -HSME_SPATIAL_REGION_ROLES_V1.indexOf(b.role);
}

function compareRoleValues(
  a:HsmeSpatialRegionRoleV1,
  b:HsmeSpatialRegionRoleV1,
):number{
  return HSME_SPATIAL_REGION_ROLES_V1.indexOf(a)
    -HSME_SPATIAL_REGION_ROLES_V1.indexOf(b);
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_spatial_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_spatial_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_spatial_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_spatial_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_spatial_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_spatial_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_spatial_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_spatial_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_spatial_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

function checkedMultiply(a:number,b:number):number{
  const value=a*b;
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_spatial_value','spatial grid overflow');
  }
  return value;
}

async function digest(
  domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_spatial_hash','hash port must return lowercase SHA-256');
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeSpatialSparsityExperimentPlanV1Error(code,message);
}

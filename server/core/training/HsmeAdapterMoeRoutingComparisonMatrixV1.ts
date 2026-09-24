import {
  hsmeAdapterMoeExperimentPlanV1Digest,
  type HsmeAdapterMoeExperimentPlanV1,
  type HsmeAdapterMoeMeasurementV1,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  hsmeAdapterMoePrototypeRosterV1Digest,
  type HsmeAdapterMoePrototypeRosterV1,
} from './HsmeAdapterMoePrototypeRosterV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1' as const;
export const HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-routing-campaign-fixture:v1\0' as const;
export const HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1' as const;
export const HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-routing-measurement:v1\0' as const;
export const HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1' as const;
export const HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-routing-comparison-matrix:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const VARIANTS=Object.freeze([
  'DENSE_CONTROL',
  'SHARED_TOP1_ADAPTER',
  'SHARED_TOP2_ADAPTER',
] as const);

export type HsmeAdapterMoeRoutingVariantV1=typeof VARIANTS[number];

export type HsmeAdapterMoeRoutingCampaignFixtureV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1_SCHEMA;
  experimentPlanSha256:string;
  prototypeRosterSha256:string;
  fixtureId:string;
  fixtureManifestSha256:string;
  evaluationContractSha256:string;
  deterministicSeedScheduleSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  qualityScale:'NORMALIZED_0_TO_1_HIGHER_BETTER';
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  requiredMeasurementDimensions:readonly HsmeAdapterMoeMeasurementV1[];
  sameInputsAcrossVariants:true;
  sameSeedsAcrossVariants:true;
  sameRuntimeRepresentationAcrossVariants:true;
  noSilentCloudFallback:true;
  selectionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeAdapterMoeRoutingPlanOriginVerifierV1{
  verifyExperimentPlan(
    plan:HsmeAdapterMoeExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeAdapterMoeRoutingPrototypeRosterOriginVerifierV1{
  verifyPrototypeRoster(
    roster:HsmeAdapterMoePrototypeRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}
export interface HsmeAdapterMoeRoutingFixtureOriginVerifierV1{
  verifyCampaignFixture(
    fixture:HsmeAdapterMoeRoutingCampaignFixtureV1,
    expectedFixtureSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeQualityMeasurementV1=Readonly<{
  dimension:string;
  value:number;
}>;
export type HsmeAdapterMoePreservationFailureV1=Readonly<{
  dimension:string;
  failureCount:number;
}>;

export type HsmeAdapterMoeRoutingMeasurementV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA;
  variant:HsmeAdapterMoeRoutingVariantV1;
  sourceIdentitySha256:string;
  campaignFixtureSha256:string;
  fixtureManifestSha256:string;
  evaluationContractSha256:string;
  deterministicSeedScheduleSha256:string;
  runtimeRepresentationSha256:string;
  caseCount:number;
  quality:readonly HsmeAdapterMoeQualityMeasurementV1[];
  hardPreservationFailures:readonly HsmeAdapterMoePreservationFailureV1[];
  criticalFailureCount:number;
  packageBytes:number;
  residentBytes:number;
  activeWeightsBytes:number;
  peakMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  coldLatencyMs:number;
  warmLatencyMs:number;
  endToEndLatencyMs:number;
  expertActivationCount:number;
  routerReplayIdentitySha256:string|'NONE';
  realMeasuredEvidence:true;
  selectionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeAdapterMoeRoutingMeasurementBindingV1=Readonly<{
  rawMeasurement:unknown;
  expectedMeasurementSha256:string;
}>;

export interface HsmeAdapterMoeRoutingMeasurementOriginVerifierV1{
  verifyRoutingMeasurement(
    measurement:HsmeAdapterMoeRoutingMeasurementV1,
    expectedMeasurementSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeRoutingComparisonMatrixV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_ROUTING_MATRIX_INVALID'
    |'ADAPTER_MOE_ROUTING_MATRIX_BLOCKED'
    |'ADAPTER_MOE_ROUTING_MATRIX_READY_NOT_DISPOSED';
  blockers:readonly string[];
  experimentPlanSha256:string|'UNKNOWN';
  prototypeRosterSha256:string|'UNKNOWN';
  campaignFixtureSha256:string|'UNKNOWN';
  rows:readonly HsmeAdapterMoeRoutingMeasurementV1[];
  measurementSha256s:readonly string[];
  matrixEvidenceSha256:string|'UNKNOWN';
  selectionAllowed:false;
  prototypeAssemblyAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeAdapterMoeRoutingComparisonMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeRoutingComparisonMatrixV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeRoutingCampaignFixtureV1(
  raw:unknown,
):HsmeAdapterMoeRoutingCampaignFixtureV1{
  const record=exactRecord(raw,[
    'schemaVersion','experimentPlanSha256','prototypeRosterSha256','fixtureId',
    'fixtureManifestSha256','evaluationContractSha256',
    'deterministicSeedScheduleSha256','runtimeRepresentationSha256',
    'hardwareClass','caseCount','qualityScale','qualityDimensions',
    'hardPreservationDimensions','requiredMeasurementDimensions',
    'sameInputsAcrossVariants','sameSeedsAcrossVariants',
    'sameRuntimeRepresentationAcrossVariants','noSilentCloudFallback',
    'selectionAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'fixture');
  if(record.schemaVersion!==HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1_SCHEMA){
    fail('hsme_adapter_moe_routing_fixture_schema','routing fixture schema unsupported');
  }
  if(record.qualityScale!=='NORMALIZED_0_TO_1_HIGHER_BETTER'){
    fail('hsme_adapter_moe_routing_fixture_scale','quality scale unsupported');
  }
  if(
    record.sameInputsAcrossVariants!==true
    ||record.sameSeedsAcrossVariants!==true
    ||record.sameRuntimeRepresentationAcrossVariants!==true
    ||record.noSilentCloudFallback!==true
  ){
    fail('hsme_adapter_moe_routing_fixture_fairness','same-input/seed/runtime law required');
  }
  assertNoAuthority(record,'fixture');
  const qualityDimensions=identifierArray(
    record.qualityDimensions,'fixture.qualityDimensions',1,32,
  );
  const hardPreservationDimensions=identifierArray(
    record.hardPreservationDimensions,'fixture.hardPreservationDimensions',1,32,
  );
  const requiredMeasurementDimensions=identifierArray(
    record.requiredMeasurementDimensions,
    'fixture.requiredMeasurementDimensions',
    1,
    32,
  ) as HsmeAdapterMoeMeasurementV1[];
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_V1_SCHEMA,
    experimentPlanSha256:sha256(record.experimentPlanSha256,'fixture.experimentPlanSha256'),
    prototypeRosterSha256:sha256(record.prototypeRosterSha256,'fixture.prototypeRosterSha256'),
    fixtureId:identifier(record.fixtureId,'fixture.fixtureId',160),
    fixtureManifestSha256:sha256(record.fixtureManifestSha256,'fixture.fixtureManifestSha256'),
    evaluationContractSha256:sha256(record.evaluationContractSha256,'fixture.evaluationContractSha256'),
    deterministicSeedScheduleSha256:sha256(
      record.deterministicSeedScheduleSha256,
      'fixture.deterministicSeedScheduleSha256',
    ),
    runtimeRepresentationSha256:sha256(
      record.runtimeRepresentationSha256,
      'fixture.runtimeRepresentationSha256',
    ),
    hardwareClass:boundedString(record.hardwareClass,'fixture.hardwareClass',160),
    caseCount:safeInteger(record.caseCount,'fixture.caseCount',1,10_000_000),
    qualityScale:'NORMALIZED_0_TO_1_HIGHER_BETTER',
    qualityDimensions:Object.freeze(qualityDimensions),
    hardPreservationDimensions:Object.freeze(hardPreservationDimensions),
    requiredMeasurementDimensions:Object.freeze(requiredMeasurementDimensions),
    sameInputsAcrossVariants:true,
    sameSeedsAcrossVariants:true,
    sameRuntimeRepresentationAcrossVariants:true,
    noSilentCloudFallback:true,
    ...measurementAuthorityBoundary(),
  });
}

export async function hsmeAdapterMoeRoutingCampaignFixtureV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const fixture=normalizeHsmeAdapterMoeRoutingCampaignFixtureV1(raw);
  return digest(
    HSME_ADAPTER_MOE_ROUTING_CAMPAIGN_FIXTURE_DIGEST_DOMAIN,
    fixture,
    hash,
  );
}

export function normalizeHsmeAdapterMoeRoutingMeasurementV1(
  raw:unknown,
):HsmeAdapterMoeRoutingMeasurementV1{
  const record=exactRecord(raw,[
    'schemaVersion','variant','sourceIdentitySha256','campaignFixtureSha256',
    'fixtureManifestSha256','evaluationContractSha256',
    'deterministicSeedScheduleSha256','runtimeRepresentationSha256','caseCount',
    'quality','hardPreservationFailures','criticalFailureCount','packageBytes',
    'residentBytes','activeWeightsBytes','peakMemoryBytes','flashBytesMoved',
    'ramBytesMoved','acceleratorBytesMoved','coldLatencyMs','warmLatencyMs',
    'endToEndLatencyMs','expertActivationCount','routerReplayIdentitySha256',
    'realMeasuredEvidence','selectionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'measurement');
  if(record.schemaVersion!==HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA){
    fail('hsme_adapter_moe_routing_measurement_schema','measurement schema unsupported');
  }
  if(record.realMeasuredEvidence!==true){
    fail('hsme_adapter_moe_routing_measurement_real','realMeasuredEvidence must be true');
  }
  assertNoAuthority(record,'measurement');
  if(!Array.isArray(record.quality)||record.quality.length<1||record.quality.length>32){
    fail('hsme_adapter_moe_routing_measurement_quality','quality vector cardinality invalid');
  }
  const quality=record.quality.map((value,index)=>{
    const item=exactRecord(value,['dimension','value'],'measurement.quality['+index+']');
    return deepFreeze({
      dimension:identifier(item.dimension,'measurement.quality['+index+'].dimension',120),
      value:finiteNumber(item.value,'measurement.quality['+index+'].value',0,1),
    });
  });
  if(new Set(quality.map(x=>x.dimension)).size!==quality.length){
    fail('hsme_adapter_moe_routing_measurement_quality','quality dimensions must be unique');
  }
  if(
    !Array.isArray(record.hardPreservationFailures)
    ||record.hardPreservationFailures.length<1
    ||record.hardPreservationFailures.length>32
  ){
    fail('hsme_adapter_moe_routing_measurement_preservation','preservation vector cardinality invalid');
  }
  const hardPreservationFailures=record.hardPreservationFailures.map((value,index)=>{
    const item=exactRecord(
      value,
      ['dimension','failureCount'],
      'measurement.hardPreservationFailures['+index+']',
    );
    return deepFreeze({
      dimension:identifier(
        item.dimension,
        'measurement.hardPreservationFailures['+index+'].dimension',
        120,
      ),
      failureCount:safeInteger(
        item.failureCount,
        'measurement.hardPreservationFailures['+index+'].failureCount',
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    });
  });
  if(new Set(hardPreservationFailures.map(x=>x.dimension)).size!==hardPreservationFailures.length){
    fail('hsme_adapter_moe_routing_measurement_preservation','preservation dimensions must be unique');
  }
  const replay=record.routerReplayIdentitySha256==='NONE'
    ?'NONE' as const
    :sha256(
      record.routerReplayIdentitySha256,
      'measurement.routerReplayIdentitySha256',
    );
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA,
    variant:enumValue(record.variant,VARIANTS,'measurement.variant'),
    sourceIdentitySha256:sha256(record.sourceIdentitySha256,'measurement.sourceIdentitySha256'),
    campaignFixtureSha256:sha256(record.campaignFixtureSha256,'measurement.campaignFixtureSha256'),
    fixtureManifestSha256:sha256(record.fixtureManifestSha256,'measurement.fixtureManifestSha256'),
    evaluationContractSha256:sha256(record.evaluationContractSha256,'measurement.evaluationContractSha256'),
    deterministicSeedScheduleSha256:sha256(
      record.deterministicSeedScheduleSha256,
      'measurement.deterministicSeedScheduleSha256',
    ),
    runtimeRepresentationSha256:sha256(
      record.runtimeRepresentationSha256,
      'measurement.runtimeRepresentationSha256',
    ),
    caseCount:safeInteger(record.caseCount,'measurement.caseCount',1,10_000_000),
    quality:Object.freeze(quality),
    hardPreservationFailures:Object.freeze(hardPreservationFailures),
    criticalFailureCount:safeInteger(
      record.criticalFailureCount,
      'measurement.criticalFailureCount',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    packageBytes:safeInteger(record.packageBytes,'measurement.packageBytes',1,Number.MAX_SAFE_INTEGER),
    residentBytes:safeInteger(record.residentBytes,'measurement.residentBytes',1,Number.MAX_SAFE_INTEGER),
    activeWeightsBytes:safeInteger(record.activeWeightsBytes,'measurement.activeWeightsBytes',1,Number.MAX_SAFE_INTEGER),
    peakMemoryBytes:safeInteger(record.peakMemoryBytes,'measurement.peakMemoryBytes',1,Number.MAX_SAFE_INTEGER),
    flashBytesMoved:safeInteger(record.flashBytesMoved,'measurement.flashBytesMoved',0,Number.MAX_SAFE_INTEGER),
    ramBytesMoved:safeInteger(record.ramBytesMoved,'measurement.ramBytesMoved',0,Number.MAX_SAFE_INTEGER),
    acceleratorBytesMoved:safeInteger(
      record.acceleratorBytesMoved,
      'measurement.acceleratorBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    coldLatencyMs:finiteNumber(record.coldLatencyMs,'measurement.coldLatencyMs',0,3_600_000),
    warmLatencyMs:finiteNumber(record.warmLatencyMs,'measurement.warmLatencyMs',0,3_600_000),
    endToEndLatencyMs:finiteNumber(record.endToEndLatencyMs,'measurement.endToEndLatencyMs',0,3_600_000),
    expertActivationCount:safeInteger(
      record.expertActivationCount,
      'measurement.expertActivationCount',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    routerReplayIdentitySha256:replay,
    realMeasuredEvidence:true,
    ...measurementAuthorityBoundary(),
  });
}

export async function hsmeAdapterMoeRoutingMeasurementV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const measurement=normalizeHsmeAdapterMoeRoutingMeasurementV1(raw);
  return digest(
    HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_DIGEST_DOMAIN,
    measurement,
    hash,
  );
}

export async function buildHsmeAdapterMoeRoutingComparisonMatrixV1(
  plan:HsmeAdapterMoeExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeAdapterMoeRoutingPlanOriginVerifierV1,
  roster:HsmeAdapterMoePrototypeRosterV1,
  expectedRosterSha256:string,
  rosterOrigin:HsmeAdapterMoeRoutingPrototypeRosterOriginVerifierV1,
  rawFixture:unknown,
  expectedFixtureSha256:string,
  fixtureOrigin:HsmeAdapterMoeRoutingFixtureOriginVerifierV1,
  measurementBindings:readonly HsmeAdapterMoeRoutingMeasurementBindingV1[],
  measurementOrigin:HsmeAdapterMoeRoutingMeasurementOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeRoutingComparisonMatrixV1>{
  if(
    plan.state!=='ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTER_MOE_ROUTING_FROZEN_PLAN_REQUIRED']);
  }
  if(
    roster.state!=='ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED'
    ||roster.rosterEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTER_MOE_ROUTING_READY_PROTOTYPE_ROSTER_REQUIRED']);
  }

  let experimentPlanSha256:string;
  let prototypeRosterSha256:string;
  try{
    experimentPlanSha256=await hsmeAdapterMoeExperimentPlanV1Digest(plan,hash);
    prototypeRosterSha256=await hsmeAdapterMoePrototypeRosterV1Digest(roster,hash);
  }catch{
    return invalid(['ADAPTER_MOE_ROUTING_INPUT_REHASH_INVALID']);
  }
  const common={experimentPlanSha256,prototypeRosterSha256};
  if(
    !HEX64.test(expectedPlanSha256)
    ||experimentPlanSha256!==expectedPlanSha256
    ||experimentPlanSha256!==plan.planEvidenceSha256
  ){
    return invalid(['ADAPTER_MOE_ROUTING_PLAN_REHASH_MISMATCH'],common);
  }
  if(
    !HEX64.test(expectedRosterSha256)
    ||prototypeRosterSha256!==expectedRosterSha256
    ||prototypeRosterSha256!==roster.rosterEvidenceSha256
  ){
    return invalid(['ADAPTER_MOE_ROUTING_ROSTER_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyExperimentPlan(plan,experimentPlanSha256))){
    return invalid(['ADAPTER_MOE_ROUTING_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>rosterOrigin.verifyPrototypeRoster(roster,prototypeRosterSha256))){
    return invalid(['ADAPTER_MOE_ROUTING_ROSTER_ORIGIN_UNVERIFIED'],common);
  }
  if(!rosterBindsPlan(plan,roster,experimentPlanSha256)){
    return invalid(['ADAPTER_MOE_ROUTING_ROSTER_BINDING_MISMATCH'],common);
  }

  let fixture:HsmeAdapterMoeRoutingCampaignFixtureV1;
  let campaignFixtureSha256:string;
  try{
    fixture=normalizeHsmeAdapterMoeRoutingCampaignFixtureV1(rawFixture);
    campaignFixtureSha256=await hsmeAdapterMoeRoutingCampaignFixtureV1Digest(
      fixture,
      hash,
    );
  }catch{
    return invalid(['ADAPTER_MOE_ROUTING_FIXTURE_INVALID'],common);
  }
  const withFixture={...common,campaignFixtureSha256};
  if(
    !HEX64.test(expectedFixtureSha256)
    ||campaignFixtureSha256!==expectedFixtureSha256
  ){
    return invalid(['ADAPTER_MOE_ROUTING_FIXTURE_REHASH_MISMATCH'],withFixture);
  }
  if(!await verify(()=>fixtureOrigin.verifyCampaignFixture(fixture,campaignFixtureSha256))){
    return invalid(['ADAPTER_MOE_ROUTING_FIXTURE_ORIGIN_UNVERIFIED'],withFixture);
  }
  if(!fixtureBindsInputs(plan,roster,fixture,experimentPlanSha256,prototypeRosterSha256)){
    return invalid(['ADAPTER_MOE_ROUTING_FIXTURE_BINDING_MISMATCH'],withFixture);
  }

  if(!Array.isArray(measurementBindings)||measurementBindings.length!==VARIANTS.length){
    return invalid(['ADAPTER_MOE_ROUTING_MEASUREMENT_COUNT_INVALID'],withFixture);
  }
  const rows:HsmeAdapterMoeRoutingMeasurementV1[]=[];
  const measurementSha256s:string[]=[];
  for(const binding of measurementBindings){
    let measurement:HsmeAdapterMoeRoutingMeasurementV1;
    let measurementSha256:string;
    try{
      measurement=normalizeHsmeAdapterMoeRoutingMeasurementV1(
        binding.rawMeasurement,
      );
      measurementSha256=await hsmeAdapterMoeRoutingMeasurementV1Digest(
        measurement,
        hash,
      );
    }catch{
      return invalid(['ADAPTER_MOE_ROUTING_MEASUREMENT_INVALID'],withFixture);
    }
    if(
      !HEX64.test(binding.expectedMeasurementSha256)
      ||measurementSha256!==binding.expectedMeasurementSha256
      ||!await verify(
        ()=>measurementOrigin.verifyRoutingMeasurement(
          measurement,
          measurementSha256,
        ),
      )
    ){
      return invalid(['ADAPTER_MOE_ROUTING_MEASUREMENT_ORIGIN_OR_DIGEST_INVALID'],withFixture);
    }
    if(!measurementBindsCampaign(plan,roster,fixture,campaignFixtureSha256,measurement)){
      return invalid(['ADAPTER_MOE_ROUTING_MEASUREMENT_BINDING_MISMATCH'],withFixture);
    }
    rows.push(measurement);
    measurementSha256s.push(measurementSha256);
  }
  if(new Set(rows.map(row=>row.variant)).size!==VARIANTS.length){
    return invalid(['ADAPTER_MOE_ROUTING_VARIANT_DUPLICATE_OR_MISSING'],withFixture);
  }
  for(const variant of VARIANTS){
    if(!rows.some(row=>row.variant===variant)){
      return invalid(['ADAPTER_MOE_ROUTING_VARIANT_DUPLICATE_OR_MISSING'],withFixture);
    }
  }
  rows.sort((left,right)=>VARIANTS.indexOf(left.variant)-VARIANTS.indexOf(right.variant));

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
    state:'ADAPTER_MOE_ROUTING_MATRIX_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    experimentPlanSha256,
    prototypeRosterSha256,
    campaignFixtureSha256,
    rows:Object.freeze(rows),
    measurementSha256s:Object.freeze([...measurementSha256s].sort(lexical)),
    ...matrixAuthorityBoundary(),
  };
  const matrixEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,matrixEvidenceSha256});
}

export async function hsmeAdapterMoeRoutingComparisonMatrixV1Digest(
  matrix:HsmeAdapterMoeRoutingComparisonMatrixV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    matrix.state!=='ADAPTER_MOE_ROUTING_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_adapter_moe_routing_matrix_digest_state','only READY_NOT_DISPOSED matrix is digestible');
  }
  const {matrixEvidenceSha256:_ignored,...payload}=matrix;
  return digest(
    HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function rosterBindsPlan(
  plan:HsmeAdapterMoeExperimentPlanV1,
  roster:HsmeAdapterMoePrototypeRosterV1,
  planSha:string,
):boolean{
  return roster.experimentPlanSha256===planSha
    &&roster.denseBaselineDecisionSha256===plan.denseBaselineDecisionSha256
    &&roster.denseBaselineContentSha256===plan.denseBaselineContentSha256
    &&roster.denseBaselinePackageBytes===plan.denseBaselinePackageBytes
    &&roster.prototypes.some(x=>x.variant==='SHARED_TOP1_ADAPTER')
    &&roster.prototypes.some(x=>x.variant==='SHARED_TOP2_ADAPTER');
}

function fixtureBindsInputs(
  plan:HsmeAdapterMoeExperimentPlanV1,
  roster:HsmeAdapterMoePrototypeRosterV1,
  fixture:HsmeAdapterMoeRoutingCampaignFixtureV1,
  planSha:string,
  rosterSha:string,
):boolean{
  return fixture.experimentPlanSha256===planSha
    &&fixture.prototypeRosterSha256===rosterSha
    &&JSON.stringify(fixture.qualityDimensions)===JSON.stringify(plan.qualityDimensions)
    &&JSON.stringify(fixture.hardPreservationDimensions)===
      JSON.stringify(plan.hardPreservationDimensions)
    &&JSON.stringify(fixture.requiredMeasurementDimensions)===
      JSON.stringify(plan.measurementDimensions)
    &&roster.state==='ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED';
}

function measurementBindsCampaign(
  plan:HsmeAdapterMoeExperimentPlanV1,
  roster:HsmeAdapterMoePrototypeRosterV1,
  fixture:HsmeAdapterMoeRoutingCampaignFixtureV1,
  fixtureSha:string,
  row:HsmeAdapterMoeRoutingMeasurementV1,
):boolean{
  if(
    row.campaignFixtureSha256!==fixtureSha
    ||row.fixtureManifestSha256!==fixture.fixtureManifestSha256
    ||row.evaluationContractSha256!==fixture.evaluationContractSha256
    ||row.deterministicSeedScheduleSha256!==fixture.deterministicSeedScheduleSha256
    ||row.runtimeRepresentationSha256!==fixture.runtimeRepresentationSha256
    ||row.caseCount!==fixture.caseCount
  ){
    return false;
  }
  if(
    JSON.stringify(row.quality.map(x=>x.dimension))!==
      JSON.stringify(fixture.qualityDimensions)
    ||JSON.stringify(row.hardPreservationFailures.map(x=>x.dimension))!==
      JSON.stringify(fixture.hardPreservationDimensions)
  ){
    return false;
  }
  if(row.variant==='DENSE_CONTROL'){
    return row.sourceIdentitySha256===plan.denseBaselineDecisionSha256
      &&row.packageBytes===plan.denseBaselinePackageBytes
      &&row.expertActivationCount===0
      &&row.routerReplayIdentitySha256==='NONE';
  }
  const prototype=roster.prototypes.find(x=>x.variant===row.variant);
  if(prototype===undefined){
    return false;
  }
  const maxActivations=row.variant==='SHARED_TOP1_ADAPTER'
    ?fixture.caseCount
    :checkedMultiply(fixture.caseCount,2,'measurement.expertActivationCount');
  return row.sourceIdentitySha256===prototype.prototypeSha256
    &&row.packageBytes===prototype.packageBytes
    &&row.expertActivationCount<=maxActivations
    &&row.routerReplayIdentitySha256!=='NONE';
}

type PartialOutput=Partial<Pick<
  HsmeAdapterMoeRoutingComparisonMatrixV1,
  'experimentPlanSha256'|'prototypeRosterSha256'|'campaignFixtureSha256'
>>;

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeRoutingComparisonMatrixV1{
  return terminal('ADAPTER_MOE_ROUTING_MATRIX_BLOCKED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeRoutingComparisonMatrixV1{
  return terminal('ADAPTER_MOE_ROUTING_MATRIX_INVALID',blockers,values);
}

function terminal(
  state:'ADAPTER_MOE_ROUTING_MATRIX_INVALID'|'ADAPTER_MOE_ROUTING_MATRIX_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoeRoutingComparisonMatrixV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    prototypeRosterSha256:values.prototypeRosterSha256??'UNKNOWN',
    campaignFixtureSha256:values.campaignFixtureSha256??'UNKNOWN',
    rows:Object.freeze([]),
    measurementSha256s:Object.freeze([]),
    matrixEvidenceSha256:'UNKNOWN',
    ...matrixAuthorityBoundary(),
  });
}

function measurementAuthorityBoundary(){
  return Object.freeze({
    selectionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function matrixAuthorityBoundary(){
  return Object.freeze({
    selectionAllowed:false as const,
    prototypeAssemblyAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(measurementAuthorityBoundary())){
    if(record[field]!==false){
      fail('hsme_adapter_moe_routing_authority',path+'.'+field+' must remain false');
    }
  }
}

function identifierArray(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):string[]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail('hsme_adapter_moe_routing_value',path+' cardinality invalid');
  }
  const values=raw.map(
    (value,index)=>identifier(value,path+'['+index+']',120),
  );
  if(new Set(values).size!==values.length){
    fail('hsme_adapter_moe_routing_value',path+' contains duplicates');
  }
  return values;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_routing_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_routing_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_routing_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_adapter_moe_routing_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_routing_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_routing_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_routing_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_routing_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_adapter_moe_routing_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function finiteNumber(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(typeof raw!=='number'||!Number.isFinite(raw)||raw<min||raw>max){
    fail('hsme_adapter_moe_routing_value',path+' must be a finite bounded number');
  }
  return raw;
}

function checkedMultiply(left:number,right:number,path:string):number{
  const value=left*right;
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_adapter_moe_routing_value',path+' overflowed safe integer range');
  }
  return value;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_adapter_moe_routing_hash','hash port must return lowercase SHA-256');
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function lexical(left:string,right:string):number{
  return left<right?-1:left>right?1:0;
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
  throw new HsmeAdapterMoeRoutingComparisonMatrixV1Error(code,message);
}

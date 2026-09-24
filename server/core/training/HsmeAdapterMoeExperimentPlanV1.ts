import {
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
  type HsmeDenseBaselineDecisionV1,
  type HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1' as const;
export const HSME_ADAPTER_MOE_TOPOLOGY_POLICY_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-topology-policy:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1' as const;
export const HSME_ADAPTER_MOE_EXPERIMENT_PLAN_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-experiment-plan:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

const VARIANTS=Object.freeze([
  'DENSE_CONTROL',
  'SHARED_TOP1_ADAPTER',
  'SHARED_TOP2_ADAPTER',
  'DENSE_TO_SPARSE_SECONDARY',
] as const);
const REQUIRED_VARIANTS=Object.freeze([
  'DENSE_CONTROL',
  'SHARED_TOP1_ADAPTER',
  'SHARED_TOP2_ADAPTER',
] as const);
const MEASUREMENTS=Object.freeze([
  'QUALITY_VECTOR',
  'SEMANTIC_ADHERENCE',
  'PRESERVATION_FAILURES',
  'PACKAGE_BYTES',
  'RESIDENT_BYTES',
  'ACTIVE_WEIGHTS_BYTES',
  'PEAK_MEMORY_BYTES',
  'FLASH_BYTES_MOVED',
  'RAM_BYTES_MOVED',
  'ACCELERATOR_BYTES_MOVED',
  'COLD_LATENCY_MS',
  'WARM_LATENCY_MS',
  'END_TO_END_LATENCY_MS',
  'EXPERT_ACTIVATION_COUNT',
  'ROUTER_REPLAY_IDENTITY',
] as const);

export type HsmeAdapterMoeComparisonVariantV1=typeof VARIANTS[number];
export type HsmeAdapterMoeMeasurementV1=typeof MEASUREMENTS[number];

export type HsmeAdapterMoeTopologyPolicyV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1_SCHEMA;
  experimentId:string;
  denseBaselineDecisionSha256:string;
  comparisonVariants:readonly HsmeAdapterMoeComparisonVariantV1[];
  specialistHypotheses:readonly string[];
  maxExpertCount:number;
  maxExpertArtifactBytes:number;
  maxTotalExpertArtifactBytes:number;
  maxActiveSpecialistsPerDecision:1|2;
  sharedPathRequired:true;
  fullBackboneExpertAllowed:false;
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  qualityPriority:readonly string[];
  measurementDimensions:readonly HsmeAdapterMoeMeasurementV1[];
  routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED';
  trainingExecutionAllowed:false;
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

export interface HsmeAdapterMoeDenseBaselineOriginVerifierV1{
  verifyDenseBaselineDecision(
    decision:HsmeDenseBaselineDecisionV1,
    expectedDecisionSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdapterMoeTopologyPolicyOriginVerifierV1{
  verifyTopologyPolicy(
    policy:HsmeAdapterMoeTopologyPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExperimentPlanV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID'
    |'ADAPTER_MOE_EXPERIMENT_PLAN_BLOCKED'
    |'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  experimentId:string|'UNKNOWN';
  denseBaselineDecisionSha256:string|'UNKNOWN';
  denseBaselineModelId:string|'UNKNOWN';
  denseBaselineVersion:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  denseBaselinePackageBytes:number|'UNKNOWN';
  denseBaselineRepresentationManifestSha256:string|'UNKNOWN';
  denseBaselineEvaluationContractSha256:string|'UNKNOWN';
  denseBaselineQualityEvidenceSha256:string|'UNKNOWN';
  denseBaselineRuntimeEvidenceSha256:string|'UNKNOWN';
  denseBaselineHsmeBindingEvidenceSha256:string|'UNKNOWN';
  topologyPolicySha256:string|'UNKNOWN';
  comparisonVariants:readonly HsmeAdapterMoeComparisonVariantV1[];
  specialistHypotheses:readonly string[];
  maxExpertCount:number|'UNKNOWN';
  maxExpertArtifactBytes:number|'UNKNOWN';
  maxTotalExpertArtifactBytes:number|'UNKNOWN';
  maxActiveSpecialistsPerDecision:1|2|'UNKNOWN';
  sharedPathRequired:boolean;
  fullBackboneExpertAllowed:boolean;
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  qualityPriority:readonly string[];
  measurementDimensions:readonly HsmeAdapterMoeMeasurementV1[];
  routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED'|'UNKNOWN';
  planEvidenceSha256:string|'UNKNOWN';
  trainingExecutionAllowed:false;
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

export class HsmeAdapterMoeExperimentPlanV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExperimentPlanV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeTopologyPolicyV1(
  raw:unknown,
):HsmeAdapterMoeTopologyPolicyV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'experimentId',
    'denseBaselineDecisionSha256',
    'comparisonVariants',
    'specialistHypotheses',
    'maxExpertCount',
    'maxExpertArtifactBytes',
    'maxTotalExpertArtifactBytes',
    'maxActiveSpecialistsPerDecision',
    'sharedPathRequired',
    'fullBackboneExpertAllowed',
    'qualityDimensions',
    'hardPreservationDimensions',
    'qualityPriority',
    'measurementDimensions',
    'routerDeterminismLaw',
    'trainingExecutionAllowed',
    'prototypeAssemblyAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');

  if(record.schemaVersion!==HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1_SCHEMA){
    fail('hsme_adapter_moe_policy_schema','policy schema unsupported');
  }

  const comparisonVariants=enumSet(
    record.comparisonVariants,
    VARIANTS,
    'policy.comparisonVariants',
    3,
    4,
  ).sort((left,right)=>VARIANTS.indexOf(left)-VARIANTS.indexOf(right));
  for(const required of REQUIRED_VARIANTS){
    if(!comparisonVariants.includes(required)){
      fail(
        'hsme_adapter_moe_policy_variant_required',
        'policy must include '+required,
      );
    }
  }

  const specialistHypotheses=identifierSet(
    record.specialistHypotheses,
    'policy.specialistHypotheses',
    1,
    8,
    80,
  );
  const qualityDimensions=identifierSet(
    record.qualityDimensions,
    'policy.qualityDimensions',
    3,
    24,
    100,
  );
  const hardPreservationDimensions=identifierSet(
    record.hardPreservationDimensions,
    'policy.hardPreservationDimensions',
    1,
    16,
    100,
  );
  if(
    hardPreservationDimensions.some(
      value=>!qualityDimensions.includes(value),
    )
  ){
    fail(
      'hsme_adapter_moe_policy_preservation_binding',
      'hard preservation dimensions must belong to quality dimensions',
    );
  }

  const qualityPriority=identifierSet(
    record.qualityPriority,
    'policy.qualityPriority',
    qualityDimensions.length,
    qualityDimensions.length,
    100,
    false,
  );
  if(
    qualityPriority.some(value=>!qualityDimensions.includes(value))
    ||qualityDimensions.some(value=>!qualityPriority.includes(value))
  ){
    fail(
      'hsme_adapter_moe_policy_quality_priority',
      'qualityPriority must be an exact ordering of qualityDimensions',
    );
  }

  const measurementDimensions=enumSet(
    record.measurementDimensions,
    MEASUREMENTS,
    'policy.measurementDimensions',
    MEASUREMENTS.length,
    MEASUREMENTS.length,
  ).sort((left,right)=>MEASUREMENTS.indexOf(left)-MEASUREMENTS.indexOf(right));
  if(
    MEASUREMENTS.some(value=>!measurementDimensions.includes(value))
  ){
    fail(
      'hsme_adapter_moe_policy_measurement_required',
      'all mandatory measurement dimensions are required',
    );
  }

  const maxExpertCount=safeInteger(
    record.maxExpertCount,
    'policy.maxExpertCount',
    1,
    8,
  );
  if(maxExpertCount>specialistHypotheses.length){
    fail(
      'hsme_adapter_moe_policy_expert_count',
      'maxExpertCount cannot exceed specialist hypothesis count',
    );
  }
  const maxExpertArtifactBytes=safeInteger(
    record.maxExpertArtifactBytes,
    'policy.maxExpertArtifactBytes',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maxTotalExpertArtifactBytes=safeInteger(
    record.maxTotalExpertArtifactBytes,
    'policy.maxTotalExpertArtifactBytes',
    maxExpertArtifactBytes,
    Number.MAX_SAFE_INTEGER,
  );
  const maxActiveSpecialistsPerDecision=record.maxActiveSpecialistsPerDecision;
  if(maxActiveSpecialistsPerDecision!==1&&maxActiveSpecialistsPerDecision!==2){
    fail(
      'hsme_adapter_moe_policy_topk',
      'maxActiveSpecialistsPerDecision must be 1 or 2',
    );
  }
  if(record.sharedPathRequired!==true){
    fail(
      'hsme_adapter_moe_policy_shared_path',
      'sharedPathRequired must be true',
    );
  }
  if(record.fullBackboneExpertAllowed!==false){
    fail(
      'hsme_adapter_moe_policy_full_backbone',
      'fullBackboneExpertAllowed must be false',
    );
  }
  if(record.routerDeterminismLaw!=='DETERMINISTIC_REPLAY_REQUIRED'){
    fail(
      'hsme_adapter_moe_policy_router_determinism',
      'routerDeterminismLaw unsupported',
    );
  }
  assertNoAuthority(record,'policy');

  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1_SCHEMA,
    experimentId:identifier(record.experimentId,'policy.experimentId',160),
    denseBaselineDecisionSha256:sha256(
      record.denseBaselineDecisionSha256,
      'policy.denseBaselineDecisionSha256',
    ),
    comparisonVariants:Object.freeze(comparisonVariants),
    specialistHypotheses:Object.freeze(specialistHypotheses),
    maxExpertCount,
    maxExpertArtifactBytes,
    maxTotalExpertArtifactBytes,
    maxActiveSpecialistsPerDecision,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    qualityDimensions:Object.freeze(qualityDimensions),
    hardPreservationDimensions:Object.freeze(hardPreservationDimensions),
    qualityPriority:Object.freeze(qualityPriority),
    measurementDimensions:Object.freeze(measurementDimensions),
    routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED',
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoeTopologyPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const policy=normalizeHsmeAdapterMoeTopologyPolicyV1(raw);
  return digest(HSME_ADAPTER_MOE_TOPOLOGY_POLICY_DIGEST_DOMAIN,policy,hash);
}

export async function freezeHsmeAdapterMoeExperimentPlanV1(
  rawDenseBaselineDecision:unknown,
  expectedDenseBaselineDecisionSha256:string,
  baselineOrigin:HsmeAdapterMoeDenseBaselineOriginVerifierV1,
  rawTopologyPolicy:unknown,
  expectedTopologyPolicySha256:string,
  policyOrigin:HsmeAdapterMoeTopologyPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExperimentPlanV1>{
  let denseBaseline:HsmeDenseBaselineDecisionV1;
  let denseBaselineDecisionSha256:string;
  try{
    denseBaseline=normalizeHsmeDenseBaselineDecisionV1(rawDenseBaselineDecision);
    denseBaselineDecisionSha256=
      await hsmeDenseBaselineDecisionV1Digest(denseBaseline,hash);
  }catch{
    return invalid(['ADAPTER_MOE_DENSE_BASELINE_INVALID']);
  }
  if(
    !HEX64.test(expectedDenseBaselineDecisionSha256)
    ||denseBaselineDecisionSha256!==expectedDenseBaselineDecisionSha256
  ){
    return invalid(
      ['ADAPTER_MOE_DENSE_BASELINE_DIGEST_MISMATCH'],
      {denseBaselineDecisionSha256},
    );
  }
  if(!await verify(()=>baselineOrigin.verifyDenseBaselineDecision(
    denseBaseline,
    denseBaselineDecisionSha256,
  ))){
    return invalid(
      ['ADAPTER_MOE_DENSE_BASELINE_ORIGIN_UNVERIFIED'],
      {denseBaselineDecisionSha256},
    );
  }
  if(
    denseBaseline.decisionStatus!=='BASELINE_PINNED'
    ||denseBaseline.baselinePin===undefined
  ){
    return blocked(
      ['ADAPTER_MOE_BASELINE_PINNED_REQUIRED'],
      {denseBaselineDecisionSha256},
    );
  }

  let policy:HsmeAdapterMoeTopologyPolicyV1;
  let topologyPolicySha256:string;
  try{
    policy=normalizeHsmeAdapterMoeTopologyPolicyV1(rawTopologyPolicy);
    topologyPolicySha256=await hsmeAdapterMoeTopologyPolicyV1Digest(policy,hash);
  }catch{
    return invalid(
      ['ADAPTER_MOE_TOPOLOGY_POLICY_INVALID'],
      baselineValues(denseBaseline,denseBaselineDecisionSha256),
    );
  }
  if(
    !HEX64.test(expectedTopologyPolicySha256)
    ||topologyPolicySha256!==expectedTopologyPolicySha256
  ){
    return invalid(
      ['ADAPTER_MOE_TOPOLOGY_POLICY_DIGEST_MISMATCH'],
      {
        ...baselineValues(denseBaseline,denseBaselineDecisionSha256),
        topologyPolicySha256,
      },
    );
  }
  if(!await verify(()=>policyOrigin.verifyTopologyPolicy(
    policy,
    topologyPolicySha256,
  ))){
    return invalid(
      ['ADAPTER_MOE_TOPOLOGY_POLICY_ORIGIN_UNVERIFIED'],
      {
        ...baselineValues(denseBaseline,denseBaselineDecisionSha256),
        topologyPolicySha256,
      },
    );
  }
  if(policy.denseBaselineDecisionSha256!==denseBaselineDecisionSha256){
    return invalid(
      ['ADAPTER_MOE_TOPOLOGY_POLICY_BASELINE_MISMATCH'],
      {
        ...baselineValues(denseBaseline,denseBaselineDecisionSha256),
        topologyPolicySha256,
      },
    );
  }

  const pin=denseBaseline.baselinePin;
  if(policy.maxExpertArtifactBytes>=pin.packageBytes){
    return invalid(
      ['ADAPTER_MOE_TOPOLOGY_POLICY_EXPERT_NOT_COMPACT'],
      {
        ...baselineValues(denseBaseline,denseBaselineDecisionSha256),
        topologyPolicySha256,
      },
    );
  }
  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    experimentId:policy.experimentId,
    denseBaselineDecisionSha256,
    denseBaselineModelId:pin.modelId,
    denseBaselineVersion:pin.version,
    denseBaselineContentSha256:pin.contentSha256,
    denseBaselinePackageBytes:pin.packageBytes,
    denseBaselineRepresentationManifestSha256:
      pin.representationManifestSha256,
    denseBaselineEvaluationContractSha256:pin.evaluationContractSha256,
    denseBaselineQualityEvidenceSha256:pin.qualityEvidenceSha256,
    denseBaselineRuntimeEvidenceSha256:pin.runtimeEvidenceSha256,
    denseBaselineHsmeBindingEvidenceSha256:pin.hsmeBindingEvidenceSha256,
    topologyPolicySha256,
    comparisonVariants:policy.comparisonVariants,
    specialistHypotheses:policy.specialistHypotheses,
    maxExpertCount:policy.maxExpertCount,
    maxExpertArtifactBytes:policy.maxExpertArtifactBytes,
    maxTotalExpertArtifactBytes:policy.maxTotalExpertArtifactBytes,
    maxActiveSpecialistsPerDecision:policy.maxActiveSpecialistsPerDecision,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
    qualityPriority:policy.qualityPriority,
    measurementDimensions:policy.measurementDimensions,
    routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED' as const,
    ...authorityBoundary(),
  };
  const planEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERIMENT_PLAN_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,planEvidenceSha256});
}

export async function hsmeAdapterMoeExperimentPlanV1Digest(
  plan:HsmeAdapterMoeExperimentPlanV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    plan.state!=='ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_adapter_moe_plan_digest_state',
      'only frozen experiment plans are digestible',
    );
  }
  const {planEvidenceSha256:_ignored,...payload}=plan;
  return digest(HSME_ADAPTER_MOE_EXPERIMENT_PLAN_DIGEST_DOMAIN,payload,hash);
}

type PartialOutput=Partial<Pick<
  HsmeAdapterMoeExperimentPlanV1,
  'experimentId'
  |'denseBaselineDecisionSha256'
  |'denseBaselineModelId'
  |'denseBaselineVersion'
  |'denseBaselineContentSha256'
  |'denseBaselinePackageBytes'
  |'denseBaselineRepresentationManifestSha256'
  |'denseBaselineEvaluationContractSha256'
  |'denseBaselineQualityEvidenceSha256'
  |'denseBaselineRuntimeEvidenceSha256'
  |'denseBaselineHsmeBindingEvidenceSha256'
  |'topologyPolicySha256'
>>;

function baselineValues(
  decision:HsmeDenseBaselineDecisionV1,
  denseBaselineDecisionSha256:string,
):PartialOutput{
  if(decision.baselinePin===undefined){
    return {denseBaselineDecisionSha256};
  }
  return {
    denseBaselineDecisionSha256,
    denseBaselineModelId:decision.baselinePin.modelId,
    denseBaselineVersion:decision.baselinePin.version,
    denseBaselineContentSha256:decision.baselinePin.contentSha256,
    denseBaselinePackageBytes:decision.baselinePin.packageBytes,
    denseBaselineRepresentationManifestSha256:
      decision.baselinePin.representationManifestSha256,
    denseBaselineEvaluationContractSha256:
      decision.baselinePin.evaluationContractSha256,
    denseBaselineQualityEvidenceSha256:decision.baselinePin.qualityEvidenceSha256,
    denseBaselineRuntimeEvidenceSha256:decision.baselinePin.runtimeEvidenceSha256,
    denseBaselineHsmeBindingEvidenceSha256:
      decision.baselinePin.hsmeBindingEvidenceSha256,
  };
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExperimentPlanV1{
  return terminal('ADAPTER_MOE_EXPERIMENT_PLAN_INVALID',blockers,values);
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExperimentPlanV1{
  return terminal('ADAPTER_MOE_EXPERIMENT_PLAN_BLOCKED',blockers,values);
}

function terminal(
  state:
    |'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID'
    |'ADAPTER_MOE_EXPERIMENT_PLAN_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoeExperimentPlanV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentId:values.experimentId??'UNKNOWN',
    denseBaselineDecisionSha256:
      values.denseBaselineDecisionSha256??'UNKNOWN',
    denseBaselineModelId:values.denseBaselineModelId??'UNKNOWN',
    denseBaselineVersion:values.denseBaselineVersion??'UNKNOWN',
    denseBaselineContentSha256:values.denseBaselineContentSha256??'UNKNOWN',
    denseBaselinePackageBytes:values.denseBaselinePackageBytes??'UNKNOWN',
    denseBaselineRepresentationManifestSha256:
      values.denseBaselineRepresentationManifestSha256??'UNKNOWN',
    denseBaselineEvaluationContractSha256:
      values.denseBaselineEvaluationContractSha256??'UNKNOWN',
    denseBaselineQualityEvidenceSha256:
      values.denseBaselineQualityEvidenceSha256??'UNKNOWN',
    denseBaselineRuntimeEvidenceSha256:
      values.denseBaselineRuntimeEvidenceSha256??'UNKNOWN',
    denseBaselineHsmeBindingEvidenceSha256:
      values.denseBaselineHsmeBindingEvidenceSha256??'UNKNOWN',
    topologyPolicySha256:values.topologyPolicySha256??'UNKNOWN',
    comparisonVariants:Object.freeze([]),
    specialistHypotheses:Object.freeze([]),
    maxExpertCount:'UNKNOWN',
    maxExpertArtifactBytes:'UNKNOWN',
    maxTotalExpertArtifactBytes:'UNKNOWN',
    maxActiveSpecialistsPerDecision:'UNKNOWN',
    sharedPathRequired:false,
    fullBackboneExpertAllowed:false,
    qualityDimensions:Object.freeze([]),
    hardPreservationDimensions:Object.freeze([]),
    qualityPriority:Object.freeze([]),
    measurementDimensions:Object.freeze([]),
    routerDeterminismLaw:'UNKNOWN',
    planEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_adapter_moe_policy_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
    trainingExecutionAllowed:false as const,
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function enumSet<T extends readonly string[]>(
  raw:unknown,
  allowed:T,
  path:string,
  min:number,
  max:number,
):T[number][]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail('hsme_adapter_moe_value',path+' has invalid cardinality');
  }
  const values=raw.map((value,index)=>{
    if(typeof value!=='string'||!(allowed as readonly string[]).includes(value)){
      fail(
        'hsme_adapter_moe_value',
        path+'['+index+'] is unsupported',
      );
    }
    return value as T[number];
  });
  if(new Set(values).size!==values.length){
    fail('hsme_adapter_moe_value',path+' contains duplicates');
  }
  return values;
}

function identifierSet(
  raw:unknown,
  path:string,
  min:number,
  max:number,
  maxLength:number,
  sort=true,
):string[]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail('hsme_adapter_moe_value',path+' has invalid cardinality');
  }
  const values=raw.map(
    (value,index)=>identifier(value,path+'['+index+']',maxLength),
  );
  if(new Set(values).size!==values.length){
    fail('hsme_adapter_moe_value',path+' contains duplicates');
  }
  return sort?[...values].sort(lexical):values;
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_value',path+' must be an identifier');
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
    fail('hsme_adapter_moe_value',path+' must be a safe integer in range');
  }
  return raw as number;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_value',path+' is invalid');
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
    fail('hsme_adapter_moe_hash_port','hash port must return lowercase SHA-256');
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
  throw new HsmeAdapterMoeExperimentPlanV1Error(code,message);
}

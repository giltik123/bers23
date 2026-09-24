import {
  hsmeAdapterMoeExperimentPlanV1Digest,
  type HsmeAdapterMoeExperimentPlanV1,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  hsmeAdapterMoeRoutingComparisonMatrixV1Digest,
  type HsmeAdapterMoeRoutingComparisonMatrixV1,
  type HsmeAdapterMoeRoutingMeasurementV1,
  type HsmeAdapterMoeRoutingVariantV1,
} from './HsmeAdapterMoeRoutingComparisonMatrixV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1' as const;
export const HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-routing-disposition-policy:v1\0' as const;
export const HSME_ADAPTER_MOE_ROUTING_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_ROUTING_DISPOSITION_V1' as const;
export const HSME_ADAPTER_MOE_ROUTING_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-routing-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const SPARSE_VARIANTS=Object.freeze([
  'SHARED_TOP1_ADAPTER',
  'SHARED_TOP2_ADAPTER',
] as const);
const EFFICIENCY_METRICS=Object.freeze([
  'END_TO_END_LATENCY_MS',
  'PEAK_MEMORY_BYTES',
  'ACCELERATOR_BYTES_MOVED',
  'RESIDENT_BYTES',
  'PACKAGE_BYTES',
  'RAM_BYTES_MOVED',
  'FLASH_BYTES_MOVED',
] as const);

export type HsmeAdapterMoeEfficiencyMetricV1=
  typeof EFFICIENCY_METRICS[number];

export type HsmeAdapterMoeQualityFloorV1=Readonly<{
  dimension:string;
  minimum:number;
}>;
export type HsmeAdapterMoeQualityRegressionV1=Readonly<{
  dimension:string;
  maxRegression:number;
}>;
export type HsmeAdapterMoeQualityTieToleranceV1=Readonly<{
  dimension:string;
  tolerance:number;
}>;
export type HsmeAdapterMoePreservationCeilingV1=Readonly<{
  dimension:string;
  maxFailureCount:number;
}>;

export type HsmeAdapterMoeRoutingDispositionPolicyV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA;
  experimentPlanSha256:string;
  campaignFixtureSha256:string;
  qualityFloors:readonly HsmeAdapterMoeQualityFloorV1[];
  maxQualityRegressionVsDense:readonly HsmeAdapterMoeQualityRegressionV1[];
  qualityTieTolerance:readonly HsmeAdapterMoeQualityTieToleranceV1[];
  maxHardPreservationFailures:readonly HsmeAdapterMoePreservationCeilingV1[];
  maxCriticalFailureCount:number;
  efficiencyPriority:readonly HsmeAdapterMoeEfficiencyMetricV1[];
  minMaterialEfficiencyImprovementBps:number;
  maxEfficiencyRegressionBps:number;
  reviewState:'QUALITY_FIRST_POLICY_REVIEWED';
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

export interface HsmeAdapterMoeDispositionPlanOriginVerifierV1{
  verifyExperimentPlan(
    plan:HsmeAdapterMoeExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeAdapterMoeDispositionMatrixOriginVerifierV1{
  verifyRoutingMatrix(
    matrix:HsmeAdapterMoeRoutingComparisonMatrixV1,
    expectedMatrixSha256:string,
  ):Promise<boolean>;
}
export interface HsmeAdapterMoeDispositionPolicyOriginVerifierV1{
  verifyDispositionPolicy(
    policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeVariantDispositionV1=Readonly<{
  variant:'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER';
  hardRejected:boolean;
  qualityEligible:boolean;
  efficiencyEligible:boolean;
  qualityDominated:boolean;
  reasons:readonly string[];
}>;

export type HsmeAdapterMoeRoutingDispositionV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_ROUTING_DISPOSITION_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_ROUTING_DISPOSITION_INVALID'
    |'ADAPTER_MOE_ROUTING_DISPOSITION_BLOCKED'
    |'ADAPTER_MOE_ROUTING_DISPOSITION_READY';
  blockers:readonly string[];
  disposition:'ADVANCE'|'REDESIGN'|'REJECT'|'NONE';
  experimentPlanSha256:string|'UNKNOWN';
  routingMatrixSha256:string|'UNKNOWN';
  dispositionPolicySha256:string|'UNKNOWN';
  campaignFixtureSha256:string|'UNKNOWN';
  variantDispositions:readonly HsmeAdapterMoeVariantDispositionV1[];
  advancedVariants:readonly ('SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER')[];
  preferredVariant:'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER'|'NONE';
  dispositionEvidenceSha256:string|'UNKNOWN';
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

export class HsmeAdapterMoeRoutingDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeRoutingDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeRoutingDispositionPolicyV1(
  raw:unknown,
):HsmeAdapterMoeRoutingDispositionPolicyV1{
  const record=exactRecord(raw,[
    'schemaVersion','experimentPlanSha256','campaignFixtureSha256',
    'qualityFloors','maxQualityRegressionVsDense','qualityTieTolerance',
    'maxHardPreservationFailures','maxCriticalFailureCount',
    'efficiencyPriority','minMaterialEfficiencyImprovementBps',
    'maxEfficiencyRegressionBps','reviewState','selectionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');
  if(record.schemaVersion!==HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA){
    fail('hsme_adapter_moe_disposition_policy_schema','disposition policy schema unsupported');
  }
  if(record.reviewState!=='QUALITY_FIRST_POLICY_REVIEWED'){
    fail('hsme_adapter_moe_disposition_policy_review','policy review state invalid');
  }
  assertNoAuthority(record,'policy');

  const qualityFloors=normalizeDimensionNumberArray(
    record.qualityFloors,
    ['dimension','minimum'],
    'minimum',
    'policy.qualityFloors',
  ).map(x=>deepFreeze({dimension:x.dimension,minimum:x.value}));
  const maxQualityRegressionVsDense=normalizeDimensionNumberArray(
    record.maxQualityRegressionVsDense,
    ['dimension','maxRegression'],
    'maxRegression',
    'policy.maxQualityRegressionVsDense',
  ).map(x=>deepFreeze({dimension:x.dimension,maxRegression:x.value}));
  const qualityTieTolerance=normalizeDimensionNumberArray(
    record.qualityTieTolerance,
    ['dimension','tolerance'],
    'tolerance',
    'policy.qualityTieTolerance',
  ).map(x=>deepFreeze({dimension:x.dimension,tolerance:x.value}));

  if(
    !Array.isArray(record.maxHardPreservationFailures)
    ||record.maxHardPreservationFailures.length<1
    ||record.maxHardPreservationFailures.length>32
  ){
    fail('hsme_adapter_moe_disposition_policy_preservation','preservation ceilings invalid');
  }
  const maxHardPreservationFailures=record.maxHardPreservationFailures
    .map((value,index)=>{
      const item=exactRecord(
        value,
        ['dimension','maxFailureCount'],
        'policy.maxHardPreservationFailures['+index+']',
      );
      return deepFreeze({
        dimension:identifier(
          item.dimension,
          'policy.maxHardPreservationFailures['+index+'].dimension',
          120,
        ),
        maxFailureCount:safeInteger(
          item.maxFailureCount,
          'policy.maxHardPreservationFailures['+index+'].maxFailureCount',
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      });
    })
    .sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(maxHardPreservationFailures,'policy.maxHardPreservationFailures');

  if(
    !Array.isArray(record.efficiencyPriority)
    ||record.efficiencyPriority.length<1
    ||record.efficiencyPriority.length>EFFICIENCY_METRICS.length
  ){
    fail('hsme_adapter_moe_disposition_policy_efficiency','efficiencyPriority cardinality invalid');
  }
  const efficiencyPriority=record.efficiencyPriority.map(
    (value,index)=>enumValue(
      value,
      EFFICIENCY_METRICS,
      'policy.efficiencyPriority['+index+']',
    ),
  );
  if(new Set(efficiencyPriority).size!==efficiencyPriority.length){
    fail('hsme_adapter_moe_disposition_policy_efficiency','efficiencyPriority contains duplicates');
  }

  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA,
    experimentPlanSha256:sha256(record.experimentPlanSha256,'policy.experimentPlanSha256'),
    campaignFixtureSha256:sha256(record.campaignFixtureSha256,'policy.campaignFixtureSha256'),
    qualityFloors:Object.freeze(qualityFloors),
    maxQualityRegressionVsDense:Object.freeze(maxQualityRegressionVsDense),
    qualityTieTolerance:Object.freeze(qualityTieTolerance),
    maxHardPreservationFailures:Object.freeze(maxHardPreservationFailures),
    maxCriticalFailureCount:safeInteger(
      record.maxCriticalFailureCount,
      'policy.maxCriticalFailureCount',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    efficiencyPriority:Object.freeze(efficiencyPriority),
    minMaterialEfficiencyImprovementBps:safeInteger(
      record.minMaterialEfficiencyImprovementBps,
      'policy.minMaterialEfficiencyImprovementBps',
      0,
      10_000,
    ),
    maxEfficiencyRegressionBps:safeInteger(
      record.maxEfficiencyRegressionBps,
      'policy.maxEfficiencyRegressionBps',
      0,
      10_000,
    ),
    reviewState:'QUALITY_FIRST_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoeRoutingDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const policy=normalizeHsmeAdapterMoeRoutingDispositionPolicyV1(raw);
  return digest(
    HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_DIGEST_DOMAIN,
    policy,
    hash,
  );
}

export async function decideHsmeAdapterMoeRoutingDispositionV1(
  plan:HsmeAdapterMoeExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeAdapterMoeDispositionPlanOriginVerifierV1,
  matrix:HsmeAdapterMoeRoutingComparisonMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmeAdapterMoeDispositionMatrixOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeAdapterMoeDispositionPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeRoutingDispositionV1>{
  if(
    plan.state!=='ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return terminal('ADAPTER_MOE_ROUTING_DISPOSITION_BLOCKED',[
      'ADAPTER_MOE_DISPOSITION_FROZEN_PLAN_REQUIRED',
    ]);
  }
  if(
    matrix.state!=='ADAPTER_MOE_ROUTING_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    return terminal('ADAPTER_MOE_ROUTING_DISPOSITION_BLOCKED',[
      'ADAPTER_MOE_DISPOSITION_READY_MATRIX_REQUIRED',
    ]);
  }

  let experimentPlanSha256:string;
  let routingMatrixSha256:string;
  try{
    experimentPlanSha256=await hsmeAdapterMoeExperimentPlanV1Digest(plan,hash);
    routingMatrixSha256=await hsmeAdapterMoeRoutingComparisonMatrixV1Digest(
      matrix,
      hash,
    );
  }catch{
    return invalid(['ADAPTER_MOE_DISPOSITION_INPUT_REHASH_INVALID']);
  }
  const common={
    experimentPlanSha256,
    routingMatrixSha256,
    campaignFixtureSha256:matrix.campaignFixtureSha256,
  };
  if(
    !HEX64.test(expectedPlanSha256)
    ||experimentPlanSha256!==expectedPlanSha256
    ||experimentPlanSha256!==plan.planEvidenceSha256
  ){
    return invalid(['ADAPTER_MOE_DISPOSITION_PLAN_REHASH_MISMATCH'],common);
  }
  if(
    !HEX64.test(expectedMatrixSha256)
    ||routingMatrixSha256!==expectedMatrixSha256
    ||routingMatrixSha256!==matrix.matrixEvidenceSha256
  ){
    return invalid(['ADAPTER_MOE_DISPOSITION_MATRIX_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyExperimentPlan(plan,experimentPlanSha256))){
    return invalid(['ADAPTER_MOE_DISPOSITION_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>matrixOrigin.verifyRoutingMatrix(matrix,routingMatrixSha256))){
    return invalid(['ADAPTER_MOE_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'],common);
  }
  if(!matrixBindsPlan(plan,matrix,experimentPlanSha256)){
    return invalid(['ADAPTER_MOE_DISPOSITION_MATRIX_BINDING_MISMATCH'],common);
  }

  let policy:HsmeAdapterMoeRoutingDispositionPolicyV1;
  let dispositionPolicySha256:string;
  try{
    policy=normalizeHsmeAdapterMoeRoutingDispositionPolicyV1(rawPolicy);
    dispositionPolicySha256=
      await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['ADAPTER_MOE_DISPOSITION_POLICY_INVALID'],common);
  }
  const bound={...common,dispositionPolicySha256};
  if(
    !HEX64.test(expectedPolicySha256)
    ||dispositionPolicySha256!==expectedPolicySha256
  ){
    return invalid(['ADAPTER_MOE_DISPOSITION_POLICY_REHASH_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>policyOrigin.verifyDispositionPolicy(policy,dispositionPolicySha256),
  )){
    return invalid(['ADAPTER_MOE_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(!policyBindsInputs(plan,matrix,policy,experimentPlanSha256)){
    return invalid(['ADAPTER_MOE_DISPOSITION_POLICY_BINDING_MISMATCH'],bound);
  }

  const dense=row(matrix,'DENSE_CONTROL');
  if(!absoluteQualityPass(dense,policy)){
    return ready(
      'REDESIGN',
      bound,
      SPARSE_VARIANTS.map(variant=>variantStatus(
        variant,false,false,false,false,['DENSE_CONTROL_QUALITY_FLOOR_FAILED'],
      )),
      [],
      'NONE',
      hash,
    );
  }

  const statuses=SPARSE_VARIANTS.map(variant=>
    evaluateSparse(row(matrix,variant),dense,policy)
  );
  const eligible=statuses.filter(status=>status.efficiencyEligible);
  if(eligible.length===0){
    const disposition=statuses.every(status=>status.hardRejected)
      ?'REJECT' as const
      :'REDESIGN' as const;
    return ready(
      disposition,
      bound,
      statuses,
      [],
      'NONE',
      hash,
    );
  }

  let survivors=eligible.map(status=>status.variant);
  if(survivors.length===2){
    const top1=row(matrix,'SHARED_TOP1_ADAPTER');
    const top2=row(matrix,'SHARED_TOP2_ADAPTER');
    const top1Dominates=qualityDominates(top1,top2,policy);
    const top2Dominates=qualityDominates(top2,top1,policy);
    if(top1Dominates&&!top2Dominates){
      survivors=['SHARED_TOP1_ADAPTER'];
      markDominated(statuses,'SHARED_TOP2_ADAPTER');
    }else if(top2Dominates&&!top1Dominates){
      survivors=['SHARED_TOP2_ADAPTER'];
      markDominated(statuses,'SHARED_TOP1_ADAPTER');
    }else if(qualityEquivalent(top1,top2,policy)){
      const preferred=compareEfficiencyLexicographically(top1,top2,policy);
      if(preferred!=='NONE'){
        survivors=[preferred];
      }
    }
  }

  const advancedVariants=Object.freeze([...survivors].sort(
    (a,b)=>SPARSE_VARIANTS.indexOf(a)-SPARSE_VARIANTS.indexOf(b),
  ));
  const preferredVariant=advancedVariants.length===1
    ?advancedVariants[0]
    :'NONE' as const;
  return ready(
    'ADVANCE',
    bound,
    statuses,
    advancedVariants,
    preferredVariant,
    hash,
  );
}

export async function hsmeAdapterMoeRoutingDispositionV1Digest(
  value:HsmeAdapterMoeRoutingDispositionV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='ADAPTER_MOE_ROUTING_DISPOSITION_READY'
    ||value.dispositionEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_adapter_moe_disposition_digest_state','only READY disposition is digestible');
  }
  const {dispositionEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_ADAPTER_MOE_ROUTING_DISPOSITION_DIGEST_DOMAIN,payload,hash);
}

function evaluateSparse(
  candidate:HsmeAdapterMoeRoutingMeasurementV1,
  dense:HsmeAdapterMoeRoutingMeasurementV1,
  policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
):HsmeAdapterMoeVariantDispositionV1{
  const reasons:string[]=[];
  let hardRejected=false;
  if(candidate.criticalFailureCount>policy.maxCriticalFailureCount){
    hardRejected=true;
    reasons.push('CRITICAL_FAILURE_COUNT_EXCEEDED');
  }
  for(const ceiling of policy.maxHardPreservationFailures){
    const candidateFailures=preservation(candidate,ceiling.dimension);
    const denseFailures=preservation(dense,ceiling.dimension);
    if(
      candidateFailures>Math.min(ceiling.maxFailureCount,denseFailures)
    ){
      hardRejected=true;
      reasons.push('HARD_PRESERVATION_FAILED:'+ceiling.dimension);
    }
  }

  let qualityEligible=!hardRejected;
  for(const floor of policy.qualityFloors){
    if(quality(candidate,floor.dimension)<floor.minimum){
      qualityEligible=false;
      reasons.push('QUALITY_FLOOR_FAILED:'+floor.dimension);
    }
  }
  for(const regression of policy.maxQualityRegressionVsDense){
    if(
      quality(candidate,regression.dimension)<
        quality(dense,regression.dimension)-regression.maxRegression
    ){
      qualityEligible=false;
      reasons.push('DENSE_QUALITY_REGRESSION_EXCEEDED:'+regression.dimension);
    }
  }

  let efficiencyEligible=false;
  if(qualityEligible){
    let hasMaterialImprovement=false;
    let regressionOk=true;
    for(const metric of policy.efficiencyPriority){
      const denseValue=efficiencyMetric(dense,metric);
      const candidateValue=efficiencyMetric(candidate,metric);
      const comparison=lowerBetterBps(denseValue,candidateValue);
      if(
        comparison.improvementBps>=policy.minMaterialEfficiencyImprovementBps
        &&comparison.improvementBps>0
      ){
        hasMaterialImprovement=true;
      }
      if(comparison.regressionBps>policy.maxEfficiencyRegressionBps){
        regressionOk=false;
        reasons.push('EFFICIENCY_REGRESSION_EXCEEDED:'+metric);
      }
    }
    if(!hasMaterialImprovement){
      reasons.push('MATERIAL_EFFICIENCY_IMPROVEMENT_MISSING');
    }
    efficiencyEligible=hasMaterialImprovement&&regressionOk;
  }

  return variantStatus(
    candidate.variant as 'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER',
    hardRejected,
    qualityEligible,
    efficiencyEligible,
    false,
    reasons,
  );
}

function absoluteQualityPass(
  rowValue:HsmeAdapterMoeRoutingMeasurementV1,
  policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
):boolean{
  if(rowValue.criticalFailureCount>policy.maxCriticalFailureCount){
    return false;
  }
  for(const floor of policy.qualityFloors){
    if(quality(rowValue,floor.dimension)<floor.minimum){
      return false;
    }
  }
  for(const ceiling of policy.maxHardPreservationFailures){
    if(preservation(rowValue,ceiling.dimension)>ceiling.maxFailureCount){
      return false;
    }
  }
  return true;
}

function qualityDominates(
  left:HsmeAdapterMoeRoutingMeasurementV1,
  right:HsmeAdapterMoeRoutingMeasurementV1,
  policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
):boolean{
  let materiallyBetter=false;
  for(const tie of policy.qualityTieTolerance){
    const l=quality(left,tie.dimension);
    const r=quality(right,tie.dimension);
    if(l<r-tie.tolerance){
      return false;
    }
    if(l>r+tie.tolerance){
      materiallyBetter=true;
    }
  }
  return materiallyBetter;
}

function qualityEquivalent(
  left:HsmeAdapterMoeRoutingMeasurementV1,
  right:HsmeAdapterMoeRoutingMeasurementV1,
  policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
):boolean{
  return policy.qualityTieTolerance.every(tie=>
    Math.abs(
      quality(left,tie.dimension)-quality(right,tie.dimension),
    )<=tie.tolerance
  );
}

function compareEfficiencyLexicographically(
  top1:HsmeAdapterMoeRoutingMeasurementV1,
  top2:HsmeAdapterMoeRoutingMeasurementV1,
  policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
):'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER'|'NONE'{
  for(const metric of policy.efficiencyPriority){
    const left=efficiencyMetric(top1,metric);
    const right=efficiencyMetric(top2,metric);
    if(left<right){
      return 'SHARED_TOP1_ADAPTER';
    }
    if(right<left){
      return 'SHARED_TOP2_ADAPTER';
    }
  }
  return 'NONE';
}

function lowerBetterBps(
  dense:number,
  candidate:number,
):Readonly<{improvementBps:number;regressionBps:number}>{
  if(dense===0){
    return Object.freeze({
      improvementBps:0,
      regressionBps:candidate===0?0:10_000,
    });
  }
  const delta=((dense-candidate)/dense)*10_000;
  return Object.freeze({
    improvementBps:Math.max(0,delta),
    regressionBps:Math.max(0,-delta),
  });
}

function efficiencyMetric(
  rowValue:HsmeAdapterMoeRoutingMeasurementV1,
  metric:HsmeAdapterMoeEfficiencyMetricV1,
):number{
  switch(metric){
    case 'END_TO_END_LATENCY_MS':return rowValue.endToEndLatencyMs;
    case 'PEAK_MEMORY_BYTES':return rowValue.peakMemoryBytes;
    case 'ACCELERATOR_BYTES_MOVED':return rowValue.acceleratorBytesMoved;
    case 'RESIDENT_BYTES':return rowValue.residentBytes;
    case 'PACKAGE_BYTES':return rowValue.packageBytes;
    case 'RAM_BYTES_MOVED':return rowValue.ramBytesMoved;
    case 'FLASH_BYTES_MOVED':return rowValue.flashBytesMoved;
  }
}

function quality(
  rowValue:HsmeAdapterMoeRoutingMeasurementV1,
  dimension:string,
):number{
  const item=rowValue.quality.find(x=>x.dimension===dimension);
  if(item===undefined){
    fail('hsme_adapter_moe_disposition_quality_dimension','quality dimension missing: '+dimension);
  }
  return item.value;
}

function preservation(
  rowValue:HsmeAdapterMoeRoutingMeasurementV1,
  dimension:string,
):number{
  const item=rowValue.hardPreservationFailures.find(x=>x.dimension===dimension);
  if(item===undefined){
    fail('hsme_adapter_moe_disposition_preservation_dimension','preservation dimension missing: '+dimension);
  }
  return item.failureCount;
}

function row(
  matrix:HsmeAdapterMoeRoutingComparisonMatrixV1,
  variant:HsmeAdapterMoeRoutingVariantV1,
):HsmeAdapterMoeRoutingMeasurementV1{
  const value=matrix.rows.find(x=>x.variant===variant);
  if(value===undefined){
    fail('hsme_adapter_moe_disposition_variant','matrix variant missing: '+variant);
  }
  return value;
}

function matrixBindsPlan(
  plan:HsmeAdapterMoeExperimentPlanV1,
  matrix:HsmeAdapterMoeRoutingComparisonMatrixV1,
  planSha:string,
):boolean{
  return matrix.experimentPlanSha256===planSha
    &&matrix.rows.length===3
    &&matrix.rows.every(rowValue=>
      JSON.stringify(rowValue.quality.map(x=>x.dimension))===
        JSON.stringify(plan.qualityDimensions)
      &&JSON.stringify(rowValue.hardPreservationFailures.map(x=>x.dimension))===
        JSON.stringify(plan.hardPreservationDimensions)
    );
}

function policyBindsInputs(
  plan:HsmeAdapterMoeExperimentPlanV1,
  matrix:HsmeAdapterMoeRoutingComparisonMatrixV1,
  policy:HsmeAdapterMoeRoutingDispositionPolicyV1,
  planSha:string,
):boolean{
  const qualityDims=[...plan.qualityDimensions].sort(lexical);
  const hardDims=[...plan.hardPreservationDimensions].sort(lexical);
  return policy.experimentPlanSha256===planSha
    &&policy.campaignFixtureSha256===matrix.campaignFixtureSha256
    &&sameDimensions(policy.qualityFloors,qualityDims)
    &&sameDimensions(policy.maxQualityRegressionVsDense,qualityDims)
    &&sameDimensions(policy.qualityTieTolerance,qualityDims)
    &&sameDimensions(policy.maxHardPreservationFailures,hardDims);
}

function sameDimensions(
  entries:readonly {dimension:string}[],
  expected:readonly string[],
):boolean{
  return JSON.stringify(entries.map(x=>x.dimension))===JSON.stringify(expected);
}

function markDominated(
  statuses:HsmeAdapterMoeVariantDispositionV1[],
  variant:'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER',
):void{
  const index=statuses.findIndex(status=>status.variant===variant);
  if(index<0){
    return;
  }
  const current=statuses[index];
  statuses[index]=variantStatus(
    current.variant,
    current.hardRejected,
    current.qualityEligible,
    current.efficiencyEligible,
    true,
    [...current.reasons,'QUALITY_DOMINATED'],
  );
}

function variantStatus(
  variant:'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER',
  hardRejected:boolean,
  qualityEligible:boolean,
  efficiencyEligible:boolean,
  qualityDominated:boolean,
  reasons:readonly string[],
):HsmeAdapterMoeVariantDispositionV1{
  return deepFreeze({
    variant,
    hardRejected,
    qualityEligible,
    efficiencyEligible,
    qualityDominated,
    reasons:Object.freeze([...new Set(reasons)].sort(lexical)),
  });
}

type Common=Partial<Pick<
  HsmeAdapterMoeRoutingDispositionV1,
  'experimentPlanSha256'|'routingMatrixSha256'
  |'dispositionPolicySha256'|'campaignFixtureSha256'
>>;

async function ready(
  disposition:'ADVANCE'|'REDESIGN'|'REJECT',
  common:Common,
  variantDispositions:readonly HsmeAdapterMoeVariantDispositionV1[],
  advancedVariants:readonly ('SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER')[],
  preferredVariant:'SHARED_TOP1_ADAPTER'|'SHARED_TOP2_ADAPTER'|'NONE',
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeRoutingDispositionV1>{
  const payload={
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_DISPOSITION_V1_SCHEMA,
    state:'ADAPTER_MOE_ROUTING_DISPOSITION_READY' as const,
    blockers:Object.freeze([] as string[]),
    disposition,
    experimentPlanSha256:common.experimentPlanSha256??'UNKNOWN',
    routingMatrixSha256:common.routingMatrixSha256??'UNKNOWN',
    dispositionPolicySha256:common.dispositionPolicySha256??'UNKNOWN',
    campaignFixtureSha256:common.campaignFixtureSha256??'UNKNOWN',
    variantDispositions:Object.freeze([...variantDispositions]),
    advancedVariants:Object.freeze([...advancedVariants]),
    preferredVariant,
    ...authorityBoundary(),
  };
  const dispositionEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_ROUTING_DISPOSITION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,dispositionEvidenceSha256});
}

function invalid(
  blockers:readonly string[],
  common:Common={},
):HsmeAdapterMoeRoutingDispositionV1{
  return terminal('ADAPTER_MOE_ROUTING_DISPOSITION_INVALID',blockers,common);
}

function terminal(
  state:
    |'ADAPTER_MOE_ROUTING_DISPOSITION_INVALID'
    |'ADAPTER_MOE_ROUTING_DISPOSITION_BLOCKED',
  blockers:readonly string[],
  common:Common={},
):HsmeAdapterMoeRoutingDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    disposition:'NONE',
    experimentPlanSha256:common.experimentPlanSha256??'UNKNOWN',
    routingMatrixSha256:common.routingMatrixSha256??'UNKNOWN',
    dispositionPolicySha256:common.dispositionPolicySha256??'UNKNOWN',
    campaignFixtureSha256:common.campaignFixtureSha256??'UNKNOWN',
    variantDispositions:Object.freeze([]),
    advancedVariants:Object.freeze([]),
    preferredVariant:'NONE',
    dispositionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function normalizeDimensionNumberArray(
  raw:unknown,
  fields:readonly string[],
  valueField:string,
  path:string,
):ReadonlyArray<{dimension:string;value:number}>{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail('hsme_adapter_moe_disposition_policy_dimension',path+' cardinality invalid');
  }
  const values=raw.map((rawItem,index)=>{
    const item=exactRecord(rawItem,fields,path+'['+index+']');
    return {
      dimension:identifier(item.dimension,path+'['+index+'].dimension',120),
      value:finiteNumber(item[valueField],path+'['+index+'].'+valueField,0,1),
    };
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(values,path);
  return values;
}

function assertUniqueDimensions(
  values:readonly {dimension:string}[],
  path:string,
):void{
  if(new Set(values.map(x=>x.dimension)).size!==values.length){
    fail('hsme_adapter_moe_disposition_policy_dimension',path+' contains duplicate dimensions');
  }
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail('hsme_adapter_moe_disposition_authority',path+'.'+field+' must remain false');
    }
  }
}

function authorityBoundary(){
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_disposition_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_disposition_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_disposition_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_adapter_moe_disposition_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_disposition_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_disposition_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_disposition_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_disposition_value',path+' is invalid');
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
    fail('hsme_adapter_moe_disposition_value',path+' must be a bounded safe integer');
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
    fail('hsme_adapter_moe_disposition_value',path+' must be a finite bounded number');
  }
  return raw;
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
    fail('hsme_adapter_moe_disposition_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeAdapterMoeRoutingDispositionV1Error(code,message);
}

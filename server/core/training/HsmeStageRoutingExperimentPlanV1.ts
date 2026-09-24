import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  type HsmeAdaptiveResidencyExperimentPlanV1,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_STAGE_PROFILE_ROSTER_V1_SCHEMA =
  'BERS_HSME_STAGE_PROFILE_ROSTER_V1' as const;
export const HSME_STAGE_PROFILE_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:stage-profile-roster:v1\0' as const;
export const HSME_STAGE_ROUTING_POLICY_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_POLICY_V1' as const;
export const HSME_STAGE_ROUTING_POLICY_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-policy:v1\0' as const;
export const HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1' as const;
export const HSME_STAGE_ROUTING_EXPERIMENT_PLAN_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-experiment-plan:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
export const HSME_STAGE_KINDS_V1=Object.freeze([
  'GEOMETRY',
  'APPEARANCE',
  'DETAIL',
] as const);

export type HsmeStageKindV1=typeof HSME_STAGE_KINDS_V1[number];

export type HsmeStageProfileV1=Readonly<{
  stageId:string;
  stageKind:HsmeStageKindV1;
  progressStartBps:number;
  progressEndBps:number;
  measuredCaseCount:number;
  stageWallClockUs:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  peakMemoryBytes:number;
  qualitySensitivityEvidenceSha256:string;
  specializationEvidenceSha256:string;
  deterministicStageIdentitySha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
}>;

export type HsmeStageProfileRosterV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_PROFILE_ROSTER_V1_SCHEMA;
  residencyPlanSha256:string;
  prototypeSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  profiles:readonly HsmeStageProfileV1[];
  realMeasuredEvidence:true;
  stageRoutingExecutionAllowed:false;
  routeSelectionAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export type HsmeStageRoutingPolicyV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_POLICY_V1_SCHEMA;
  residencyPlanSha256:string;
  stageProfileRosterSha256:string;
  maxActiveExpertsPerStage:1|2;
  maxStageTransitionPrefetchBytes:number;
  deterministicStageBoundariesRequired:true;
  deterministicRoutingRequired:true;
  nextStagePrefetchRequired:true;
  sharedPathRequired:true;
  fullBackboneExpertAllowed:false;
  qualityPreservationContractSha256:string;
  reviewState:'STAGE_ROUTING_POLICY_REVIEWED';
  stageRoutingExecutionAllowed:false;
  routeSelectionAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export interface HsmeStageRoutingResidencyPlanOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeStageProfileRosterOriginVerifierV1{
  verifyStageProfileRoster(
    roster:HsmeStageProfileRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}
export interface HsmeStageRoutingPolicyOriginVerifierV1{
  verifyStageRoutingPolicy(
    policy:HsmeStageRoutingPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeStageRoutingExperimentPlanV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA;
  state:
    |'STAGE_ROUTING_PLAN_INVALID'
    |'STAGE_ROUTING_PLAN_BLOCKED'
    |'STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  residencyPlanSha256:string|'UNKNOWN';
  stageProfileRosterSha256:string|'UNKNOWN';
  stageRoutingPolicySha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  routerContentSha256:string|'UNKNOWN';
  expertIds:readonly string[];
  expertContentSha256s:readonly string[];
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  profiles:readonly HsmeStageProfileV1[];
  maxActiveExpertsPerStage:1|2|'UNKNOWN';
  maxStageTransitionPrefetchBytes:number|'UNKNOWN';
  qualityPreservationContractSha256:string|'UNKNOWN';
  deterministicStageBoundariesRequired:boolean;
  deterministicRoutingRequired:boolean;
  nextStagePrefetchRequired:boolean;
  sharedPathRequired:boolean;
  fullBackboneExpertAllowed:false;
  planEvidenceSha256:string|'UNKNOWN';
  stageRoutingExecutionAllowed:false;
  routeSelectionAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export class HsmeStageRoutingExperimentPlanV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeStageRoutingExperimentPlanV1Error';
    this.code=code;
  }
}

export function normalizeHsmeStageProfileRosterV1(
  raw:unknown,
):HsmeStageProfileRosterV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','prototypeSha256',
    'runtimeRepresentationSha256','hardwareClass','profiles',
    'realMeasuredEvidence','stageRoutingExecutionAllowed',
    'routeSelectionAllowed','inferenceExecutionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  ],'roster');
  if(r.schemaVersion!==HSME_STAGE_PROFILE_ROSTER_V1_SCHEMA){
    fail('hsme_stage_roster_schema','stage profile roster schema unsupported');
  }
  if(r.realMeasuredEvidence!==true){
    fail('hsme_stage_roster_real','realMeasuredEvidence must be true');
  }
  assertNoAuthority(r,'roster');
  const runtimeRepresentationSha256=sha256(
    r.runtimeRepresentationSha256,'roster.runtimeRepresentationSha256',
  );
  const hardwareClass=identifier(r.hardwareClass,'roster.hardwareClass',160);
  if(!Array.isArray(r.profiles)||r.profiles.length!==HSME_STAGE_KINDS_V1.length){
    fail('hsme_stage_roster_profiles','exactly three stage profiles are required');
  }
  const profiles=r.profiles.map((value,index)=>normalizeStageProfile(
    value,'roster.profiles['+index+']',
    runtimeRepresentationSha256,hardwareClass,
  )).sort((a,b)=>a.progressStartBps-b.progressStartBps);

  if(
    new Set(profiles.map(v=>v.stageId)).size!==profiles.length
    ||new Set(profiles.map(v=>v.stageKind)).size!==profiles.length
  ){
    fail('hsme_stage_roster_duplicate','stage id/kind must be unique');
  }
  let cursor=0;
  for(let index=0;index<profiles.length;index+=1){
    const profile=profiles[index];
    if(
      profile.stageKind!==HSME_STAGE_KINDS_V1[index]
      ||profile.progressStartBps!==cursor
      ||profile.progressEndBps<=profile.progressStartBps
    ){
      fail(
        'hsme_stage_roster_topology',
        'stage bands must be contiguous GEOMETRY/APPEARANCE/DETAIL',
      );
    }
    cursor=profile.progressEndBps;
  }
  if(cursor!==10_000){
    fail('hsme_stage_roster_topology','stage bands must cover exactly 0..10000');
  }

  return deepFreeze({
    schemaVersion:HSME_STAGE_PROFILE_ROSTER_V1_SCHEMA,
    residencyPlanSha256:sha256(
      r.residencyPlanSha256,'roster.residencyPlanSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'roster.prototypeSha256'),
    runtimeRepresentationSha256,
    hardwareClass,
    profiles:Object.freeze(profiles),
    realMeasuredEvidence:true,
    ...authorityBoundary(),
  });
}

export function normalizeHsmeStageRoutingPolicyV1(
  raw:unknown,
):HsmeStageRoutingPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','stageProfileRosterSha256',
    'maxActiveExpertsPerStage','maxStageTransitionPrefetchBytes',
    'deterministicStageBoundariesRequired','deterministicRoutingRequired',
    'nextStagePrefetchRequired','sharedPathRequired',
    'fullBackboneExpertAllowed','qualityPreservationContractSha256',
    'reviewState','stageRoutingExecutionAllowed','routeSelectionAllowed',
    'inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
  ],'policy');
  if(r.schemaVersion!==HSME_STAGE_ROUTING_POLICY_V1_SCHEMA){
    fail('hsme_stage_policy_schema','stage routing policy schema unsupported');
  }
  if(r.reviewState!=='STAGE_ROUTING_POLICY_REVIEWED'){
    fail('hsme_stage_policy_review','stage routing policy review state invalid');
  }
  if(
    r.deterministicStageBoundariesRequired!==true
    ||r.deterministicRoutingRequired!==true
    ||r.nextStagePrefetchRequired!==true
    ||r.sharedPathRequired!==true
    ||r.fullBackboneExpertAllowed!==false
  ){
    fail('hsme_stage_policy_boundary','stage routing policy boundary invalid');
  }
  assertNoAuthority(r,'policy');
  const maxActiveExpertsPerStage=safeInteger(
    r.maxActiveExpertsPerStage,'policy.maxActiveExpertsPerStage',1,2,
  ) as 1|2;
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_POLICY_V1_SCHEMA,
    residencyPlanSha256:sha256(
      r.residencyPlanSha256,'policy.residencyPlanSha256',
    ),
    stageProfileRosterSha256:sha256(
      r.stageProfileRosterSha256,'policy.stageProfileRosterSha256',
    ),
    maxActiveExpertsPerStage,
    maxStageTransitionPrefetchBytes:safeInteger(
      r.maxStageTransitionPrefetchBytes,
      'policy.maxStageTransitionPrefetchBytes',
      1,Number.MAX_SAFE_INTEGER,
    ),
    deterministicStageBoundariesRequired:true,
    deterministicRoutingRequired:true,
    nextStagePrefetchRequired:true,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    qualityPreservationContractSha256:sha256(
      r.qualityPreservationContractSha256,
      'policy.qualityPreservationContractSha256',
    ),
    reviewState:'STAGE_ROUTING_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeStageProfileRosterV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_PROFILE_ROSTER_DIGEST_DOMAIN,
    normalizeHsmeStageProfileRosterV1(raw),
    hash,
  );
}
export async function hsmeStageRoutingPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_ROUTING_POLICY_DIGEST_DOMAIN,
    normalizeHsmeStageRoutingPolicyV1(raw),
    hash,
  );
}

export async function freezeHsmeStageRoutingExperimentPlanV1(
  residencyPlan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedResidencyPlanSha256:string,
  planOrigin:HsmeStageRoutingResidencyPlanOriginVerifierV1,
  rawRoster:unknown,
  expectedRosterSha256:string,
  rosterOrigin:HsmeStageProfileRosterOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeStageRoutingPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageRoutingExperimentPlanV1>{
  if(!readyResidencyPlan(residencyPlan)){
    return blocked(['STAGE_ROUTING_READY_RESIDENCY_PLAN_REQUIRED']);
  }
  let planSha:string;
  try{
    planSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(
      residencyPlan,hash,
    );
  }catch{
    return invalid(['STAGE_ROUTING_RESIDENCY_PLAN_REHASH_INVALID']);
  }
  const common={residencyPlanSha256:planSha};
  if(
    !exactDigest(
      expectedResidencyPlanSha256,
      planSha,
      residencyPlan.planEvidenceSha256 as string,
    )
  ){
    return invalid(['STAGE_ROUTING_RESIDENCY_PLAN_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyResidencyPlan(residencyPlan,planSha))){
    return invalid(['STAGE_ROUTING_RESIDENCY_PLAN_ORIGIN_UNVERIFIED'],common);
  }

  let roster:HsmeStageProfileRosterV1;
  let rosterSha:string;
  try{
    roster=normalizeHsmeStageProfileRosterV1(rawRoster);
    rosterSha=await hsmeStageProfileRosterV1Digest(roster,hash);
  }catch{
    return invalid(['STAGE_ROUTING_PROFILE_ROSTER_INVALID'],common);
  }
  if(!exactDigest(expectedRosterSha256,rosterSha,rosterSha)){
    return invalid(['STAGE_ROUTING_PROFILE_ROSTER_DIGEST_MISMATCH'],common);
  }
  const withRoster={...common,stageProfileRosterSha256:rosterSha};
  if(!await verify(()=>rosterOrigin.verifyStageProfileRoster(roster,rosterSha))){
    return invalid(['STAGE_ROUTING_PROFILE_ROSTER_ORIGIN_UNVERIFIED'],withRoster);
  }
  if(
    roster.residencyPlanSha256!==planSha
    ||roster.prototypeSha256!==residencyPlan.prototypeSha256
    ||roster.runtimeRepresentationSha256!==
      residencyPlan.runtimeRepresentationSha256
    ||roster.hardwareClass!==residencyPlan.hardwareClass
  ){
    return invalid(['STAGE_ROUTING_PROFILE_ROSTER_BINDING_MISMATCH'],withRoster);
  }

  let policy:HsmeStageRoutingPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeStageRoutingPolicyV1(rawPolicy);
    policySha=await hsmeStageRoutingPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['STAGE_ROUTING_POLICY_INVALID'],withRoster);
  }
  const bound={...withRoster,stageRoutingPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['STAGE_ROUTING_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(()=>policyOrigin.verifyStageRoutingPolicy(policy,policySha))){
    return invalid(['STAGE_ROUTING_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    policy.residencyPlanSha256!==planSha
    ||policy.stageProfileRosterSha256!==rosterSha
  ){
    return invalid(['STAGE_ROUTING_POLICY_BINDING_MISMATCH'],bound);
  }
  if(
    typeof residencyPlan.maxActiveExperts!=='number'
    ||policy.maxActiveExpertsPerStage>residencyPlan.maxActiveExperts
    ||typeof residencyPlan.maxDeterministicPrefetchBytesPerStage!=='number'
    ||policy.maxStageTransitionPrefetchBytes>
      residencyPlan.maxDeterministicPrefetchBytesPerStage
  ){
    return invalid(['STAGE_ROUTING_POLICY_RESOURCE_ESCALATION'],bound);
  }

  const payload={
    schemaVersion:HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    residencyPlanSha256:planSha,
    stageProfileRosterSha256:rosterSha,
    stageRoutingPolicySha256:policySha,
    prototypeSha256:residencyPlan.prototypeSha256,
    denseBaselineContentSha256:residencyPlan.denseBaselineContentSha256,
    routerContentSha256:residencyPlan.routerContentSha256,
    expertIds:residencyPlan.expertIds,
    expertContentSha256s:residencyPlan.expertContentSha256s,
    runtimeRepresentationSha256:residencyPlan.runtimeRepresentationSha256,
    hardwareClass:residencyPlan.hardwareClass,
    profiles:roster.profiles,
    maxActiveExpertsPerStage:policy.maxActiveExpertsPerStage,
    maxStageTransitionPrefetchBytes:
      policy.maxStageTransitionPrefetchBytes,
    qualityPreservationContractSha256:
      policy.qualityPreservationContractSha256,
    deterministicStageBoundariesRequired:true,
    deterministicRoutingRequired:true,
    nextStagePrefetchRequired:true,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false as const,
    ...authorityBoundary(),
  };
  const planEvidenceSha256=await digest(
    HSME_STAGE_ROUTING_EXPERIMENT_PLAN_DIGEST_DOMAIN,
    payload,hash,
  );
  return deepFreeze({...payload,planEvidenceSha256});
}

export async function hsmeStageRoutingExperimentPlanV1Digest(
  value:HsmeStageRoutingExperimentPlanV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED'
    ||value.planEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_stage_plan_digest_state','only FROZEN_NOT_EXECUTED plan is digestible');
  }
  const {planEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_STAGE_ROUTING_EXPERIMENT_PLAN_DIGEST_DOMAIN,payload,hash);
}

function normalizeStageProfile(
  raw:unknown,
  path:string,
  expectedRuntimeSha:string,
  expectedHardware:string,
):HsmeStageProfileV1{
  const r=exactRecord(raw,[
    'stageId','stageKind','progressStartBps','progressEndBps',
    'measuredCaseCount','stageWallClockUs','flashBytesMoved',
    'ramBytesMoved','acceleratorBytesMoved','peakMemoryBytes',
    'qualitySensitivityEvidenceSha256','specializationEvidenceSha256',
    'deterministicStageIdentitySha256','runtimeRepresentationSha256',
    'hardwareClass',
  ],path);
  const runtime=sha256(
    r.runtimeRepresentationSha256,path+'.runtimeRepresentationSha256',
  );
  const hardware=identifier(r.hardwareClass,path+'.hardwareClass',160);
  if(runtime!==expectedRuntimeSha||hardware!==expectedHardware){
    fail('hsme_stage_profile_runtime','stage profile runtime/hardware drift');
  }
  return deepFreeze({
    stageId:identifier(r.stageId,path+'.stageId',120),
    stageKind:enumValue(r.stageKind,HSME_STAGE_KINDS_V1,path+'.stageKind'),
    progressStartBps:safeInteger(
      r.progressStartBps,path+'.progressStartBps',0,9_999,
    ),
    progressEndBps:safeInteger(
      r.progressEndBps,path+'.progressEndBps',1,10_000,
    ),
    measuredCaseCount:safeInteger(
      r.measuredCaseCount,path+'.measuredCaseCount',1,1_000_000,
    ),
    stageWallClockUs:safeInteger(
      r.stageWallClockUs,path+'.stageWallClockUs',1,Number.MAX_SAFE_INTEGER,
    ),
    flashBytesMoved:safeInteger(
      r.flashBytesMoved,path+'.flashBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    ramBytesMoved:safeInteger(
      r.ramBytesMoved,path+'.ramBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    acceleratorBytesMoved:safeInteger(
      r.acceleratorBytesMoved,path+'.acceleratorBytesMoved',
      0,Number.MAX_SAFE_INTEGER,
    ),
    peakMemoryBytes:safeInteger(
      r.peakMemoryBytes,path+'.peakMemoryBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    qualitySensitivityEvidenceSha256:sha256(
      r.qualitySensitivityEvidenceSha256,
      path+'.qualitySensitivityEvidenceSha256',
    ),
    specializationEvidenceSha256:sha256(
      r.specializationEvidenceSha256,
      path+'.specializationEvidenceSha256',
    ),
    deterministicStageIdentitySha256:sha256(
      r.deterministicStageIdentitySha256,
      path+'.deterministicStageIdentitySha256',
    ),
    runtimeRepresentationSha256:runtime,
    hardwareClass:hardware,
  });
}

function readyResidencyPlan(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
):boolean{
  return plan.schemaVersion===HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA
    &&plan.state==='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    &&plan.planEvidenceSha256!=='UNKNOWN'
    &&plan.prototypeSha256!=='UNKNOWN'
    &&plan.denseBaselineContentSha256!=='UNKNOWN'
    &&plan.routerContentSha256!=='UNKNOWN'
    &&plan.runtimeRepresentationSha256!=='UNKNOWN'
    &&plan.hardwareClass!=='UNKNOWN'
    &&typeof plan.maxActiveExperts==='number'
    &&typeof plan.maxDeterministicPrefetchBytesPerStage==='number'
    &&plan.movementExecutionAllowed===false
    &&plan.inferenceExecutionAllowed===false
    &&plan.modelInstallAllowed===false
    &&plan.modelFleetPromotionAllowed===false
    &&plan.durableModelFleetPromotionAllowed===false
    &&plan.productionAuthorityGranted===false
    &&plan.providerAuthorityGranted===false
    &&plan.billingAuthorityGranted===false
    &&plan.projectArtifactMutationAllowed===false
    &&plan.aeeExecutionAuthorityGranted===false
    &&plan.winnerSelectionAllowed===false;
}

type PartialOutput=Partial<Pick<
  HsmeStageRoutingExperimentPlanV1,
  'residencyPlanSha256'|'stageProfileRosterSha256'|'stageRoutingPolicySha256'
>>;

function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageRoutingExperimentPlanV1{
  return terminal('STAGE_ROUTING_PLAN_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageRoutingExperimentPlanV1{
  return terminal('STAGE_ROUTING_PLAN_INVALID',blockers,values);
}
function terminal(
  state:'STAGE_ROUTING_PLAN_INVALID'|'STAGE_ROUTING_PLAN_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeStageRoutingExperimentPlanV1{
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    stageProfileRosterSha256:values.stageProfileRosterSha256??'UNKNOWN',
    stageRoutingPolicySha256:values.stageRoutingPolicySha256??'UNKNOWN',
    prototypeSha256:'UNKNOWN',denseBaselineContentSha256:'UNKNOWN',
    routerContentSha256:'UNKNOWN',expertIds:Object.freeze([]),
    expertContentSha256s:Object.freeze([]),
    runtimeRepresentationSha256:'UNKNOWN',hardwareClass:'UNKNOWN',
    profiles:Object.freeze([]),maxActiveExpertsPerStage:'UNKNOWN',
    maxStageTransitionPrefetchBytes:'UNKNOWN',
    qualityPreservationContractSha256:'UNKNOWN',
    deterministicStageBoundariesRequired:false,
    deterministicRoutingRequired:false,nextStagePrefetchRequired:false,
    sharedPathRequired:false,fullBackboneExpertAllowed:false,
    planEvidenceSha256:'UNKNOWN',...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    stageRoutingExecutionAllowed:false as const,
    routeSelectionAllowed:false as const,
    inferenceExecutionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
  });
}
function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail('hsme_stage_authority',path+'.'+field+' must remain false');
    }
  }
}
function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}
function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_stage_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_stage_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail('hsme_stage_schema',path+' contains unknown or missing fields');
  }
  return r;
}
function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_stage_value',path+' is unsupported');
  }
  return raw as T[number];
}
function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_stage_value',path+' must be an identifier');
  }
  return value;
}
function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_stage_value',path+' must be lowercase SHA-256');
  }
  return value;
}
function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_stage_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_stage_value',path+' is invalid');
  }
  return value;
}
function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_stage_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}
async function digest(
  domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_stage_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeStageRoutingExperimentPlanV1Error(code,message);
}

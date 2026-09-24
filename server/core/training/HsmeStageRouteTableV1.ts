import {
  HSME_STAGE_KINDS_V1,
  HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeStageRoutingExperimentPlanV1Digest,
  type HsmeStageKindV1,
  type HsmeStageRoutingExperimentPlanV1,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_STAGE_ROUTE_TABLE_POLICY_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTE_TABLE_POLICY_V1' as const;
export const HSME_STAGE_ROUTE_TABLE_POLICY_DIGEST_DOMAIN =
  'bers:hsme:stage-route-table-policy:v1\0' as const;
export const HSME_STAGE_ROUTE_TABLE_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTE_TABLE_V1' as const;
export const HSME_STAGE_ROUTE_TABLE_DIGEST_DOMAIN =
  'bers:hsme:stage-route-table:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const ROUTE_MODES=Object.freeze([
  'SHARED_ONLY',
  'SHARED_PLUS_SPECIALISTS',
] as const);

export type HsmeStageRouteModeV1=typeof ROUTE_MODES[number];

export type HsmeStageRouteExpertRefV1=Readonly<{
  expertId:string;
  expertContentSha256:string;
}>;

export type HsmeStageRoutePolicyEntryV1=Readonly<{
  stageId:string;
  stageKind:HsmeStageKindV1;
  progressStartBps:number;
  progressEndBps:number;
  routeMode:HsmeStageRouteModeV1;
  sharedPathEnabled:true;
  routerContentSha256:string;
  activeExperts:readonly HsmeStageRouteExpertRefV1[];
  deterministicRouteSeedSha256:string;
  deterministicRouteContractSha256:string;
}>;

export type HsmeStageRouteTablePolicyV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTE_TABLE_POLICY_V1_SCHEMA;
  stageRoutingPlanSha256:string;
  routes:readonly HsmeStageRoutePolicyEntryV1[];
  reviewState:'STAGE_ROUTE_TABLE_POLICY_REVIEWED';
  stageRoutingExecutionAllowed:false;
  routeSelectionAllowed:false;
  routeMutationAllowed:false;
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

export interface HsmeStageRoutingExperimentPlanOriginVerifierV1{
  verifyStageRoutingPlan(
    plan:HsmeStageRoutingExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeStageRouteTablePolicyOriginVerifierV1{
  verifyStageRouteTablePolicy(
    policy:HsmeStageRouteTablePolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeStageRouteTableV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTE_TABLE_V1_SCHEMA;
  state:
    |'STAGE_ROUTE_TABLE_INVALID'
    |'STAGE_ROUTE_TABLE_BLOCKED'
    |'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  stageRoutingPlanSha256:string|'UNKNOWN';
  routePolicySha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  routerContentSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  qualityPreservationContractSha256:string|'UNKNOWN';
  maxActiveExpertsPerStage:1|2|'UNKNOWN';
  routes:readonly HsmeStageRoutePolicyEntryV1[];
  routeTableEvidenceSha256:string|'UNKNOWN';
  stageRoutingExecutionAllowed:false;
  routeSelectionAllowed:false;
  routeMutationAllowed:false;
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

export class HsmeStageRouteTableV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeStageRouteTableV1Error';
    this.code=code;
  }
}

export function normalizeHsmeStageRouteTablePolicyV1(
  raw:unknown,
):HsmeStageRouteTablePolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','stageRoutingPlanSha256','routes','reviewState',
    'stageRoutingExecutionAllowed','routeSelectionAllowed',
    'routeMutationAllowed','inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
  ],'policy');
  if(r.schemaVersion!==HSME_STAGE_ROUTE_TABLE_POLICY_V1_SCHEMA){
    fail('hsme_stage_route_policy_schema','route policy schema unsupported');
  }
  if(r.reviewState!=='STAGE_ROUTE_TABLE_POLICY_REVIEWED'){
    fail('hsme_stage_route_policy_review','route policy review state invalid');
  }
  assertNoAuthority(r,'policy');
  if(!Array.isArray(r.routes)||r.routes.length!==HSME_STAGE_KINDS_V1.length){
    fail('hsme_stage_route_policy_routes','exactly three stage routes are required');
  }
  const routes=r.routes.map((value,index)=>
    normalizeRoute(value,'policy.routes['+index+']')
  ).sort(compareRoutes);
  if(
    new Set(routes.map(route=>route.stageId)).size!==routes.length
    ||new Set(routes.map(route=>route.stageKind)).size!==routes.length
  ){
    fail('hsme_stage_route_policy_duplicate','stage id/kind must be unique');
  }
  for(let index=0;index<routes.length;index+=1){
    if(routes[index].stageKind!==HSME_STAGE_KINDS_V1[index]){
      fail(
        'hsme_stage_route_policy_stage_order',
        'routes must canonically cover GEOMETRY/APPEARANCE/DETAIL',
      );
    }
  }
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTE_TABLE_POLICY_V1_SCHEMA,
    stageRoutingPlanSha256:sha256(
      r.stageRoutingPlanSha256,'policy.stageRoutingPlanSha256',
    ),
    routes:Object.freeze(routes),
    reviewState:'STAGE_ROUTE_TABLE_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeStageRouteTablePolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_ROUTE_TABLE_POLICY_DIGEST_DOMAIN,
    normalizeHsmeStageRouteTablePolicyV1(raw),
    hash,
  );
}

export async function freezeHsmeStageRouteTableV1(
  plan:HsmeStageRoutingExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeStageRoutingExperimentPlanOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeStageRouteTablePolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageRouteTableV1>{
  if(!readyPlan(plan)){
    return blocked(['STAGE_ROUTE_TABLE_FROZEN_PLAN_REQUIRED']);
  }

  let planSha:string;
  try{
    planSha=await hsmeStageRoutingExperimentPlanV1Digest(plan,hash);
  }catch{
    return invalid(['STAGE_ROUTE_TABLE_PLAN_REHASH_INVALID']);
  }
  const common={stageRoutingPlanSha256:planSha};
  if(
    !exactDigest(expectedPlanSha256,planSha,plan.planEvidenceSha256 as string)
  ){
    return invalid(['STAGE_ROUTE_TABLE_PLAN_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyStageRoutingPlan(plan,planSha))){
    return invalid(['STAGE_ROUTE_TABLE_PLAN_ORIGIN_UNVERIFIED'],common);
  }

  let policy:HsmeStageRouteTablePolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeStageRouteTablePolicyV1(rawPolicy);
    policySha=await hsmeStageRouteTablePolicyV1Digest(policy,hash);
  }catch{
    return invalid(['STAGE_ROUTE_TABLE_POLICY_INVALID'],common);
  }
  const bound={...common,routePolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['STAGE_ROUTE_TABLE_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>policyOrigin.verifyStageRouteTablePolicy(policy,policySha),
  )){
    return invalid(['STAGE_ROUTE_TABLE_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(policy.stageRoutingPlanSha256!==planSha){
    return invalid(['STAGE_ROUTE_TABLE_POLICY_PLAN_BINDING_MISMATCH'],bound);
  }

  if(
    plan.expertIds.length!==plan.expertContentSha256s.length
    ||new Set(plan.expertIds).size!==plan.expertIds.length
    ||new Set(plan.expertContentSha256s).size!==plan.expertContentSha256s.length
  ){
    return invalid(['STAGE_ROUTE_TABLE_PLAN_EXPERT_IDENTITY_INVALID'],bound);
  }
  const exactExperts=new Map<string,string>();
  for(let index=0;index<plan.expertIds.length;index+=1){
    exactExperts.set(plan.expertIds[index],plan.expertContentSha256s[index]);
  }

  const profileByKind=new Map(
    plan.profiles.map(profile=>[profile.stageKind,profile] as const),
  );
  for(const route of policy.routes){
    const profile=profileByKind.get(route.stageKind);
    if(
      !profile
      ||route.stageId!==profile.stageId
      ||route.progressStartBps!==profile.progressStartBps
      ||route.progressEndBps!==profile.progressEndBps
    ){
      return invalid(['STAGE_ROUTE_TABLE_STAGE_BINDING_MISMATCH'],bound);
    }
    if(route.routerContentSha256!==plan.routerContentSha256){
      return invalid(['STAGE_ROUTE_TABLE_ROUTER_BINDING_MISMATCH'],bound);
    }
    if(route.activeExperts.length>(plan.maxActiveExpertsPerStage as number)){
      return invalid(['STAGE_ROUTE_TABLE_ACTIVE_EXPERT_CAP_EXCEEDED'],bound);
    }
    for(const expert of route.activeExperts){
      if(exactExperts.get(expert.expertId)!==expert.expertContentSha256){
        return invalid(['STAGE_ROUTE_TABLE_EXPERT_BINDING_MISMATCH'],bound);
      }
    }
  }

  const payload={
    schemaVersion:HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
    state:'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    stageRoutingPlanSha256:planSha,
    routePolicySha256:policySha,
    prototypeSha256:plan.prototypeSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    routerContentSha256:plan.routerContentSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
    qualityPreservationContractSha256:
      plan.qualityPreservationContractSha256,
    maxActiveExpertsPerStage:plan.maxActiveExpertsPerStage,
    routes:policy.routes,
    ...authorityBoundary(),
  };
  const routeTableEvidenceSha256=await digest(
    HSME_STAGE_ROUTE_TABLE_DIGEST_DOMAIN,payload,hash,
  );
  return deepFreeze({...payload,routeTableEvidenceSha256});
}

export async function hsmeStageRouteTableV1Digest(
  value:HsmeStageRouteTableV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED'
    ||value.routeTableEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_stage_route_table_digest_state',
      'only FROZEN_NOT_EXECUTED route tables are digestible',
    );
  }
  const {routeTableEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_STAGE_ROUTE_TABLE_DIGEST_DOMAIN,payload,hash);
}

function normalizeRoute(
  raw:unknown,
  path:string,
):HsmeStageRoutePolicyEntryV1{
  const r=exactRecord(raw,[
    'stageId','stageKind','progressStartBps','progressEndBps','routeMode',
    'sharedPathEnabled','routerContentSha256','activeExperts',
    'deterministicRouteSeedSha256','deterministicRouteContractSha256',
  ],path);
  if(r.sharedPathEnabled!==true){
    fail('hsme_stage_route_shared_path',path+'.sharedPathEnabled must be true');
  }
  const routeMode=enumValue(r.routeMode,ROUTE_MODES,path+'.routeMode');
  if(!Array.isArray(r.activeExperts)||r.activeExperts.length>2){
    fail('hsme_stage_route_experts',path+'.activeExperts cardinality invalid');
  }
  const activeExperts=r.activeExperts.map((value,index)=>
    normalizeExpertRef(value,path+'.activeExperts['+index+']')
  ).sort((a,b)=>lexical(a.expertId,b.expertId));
  if(
    new Set(activeExperts.map(v=>v.expertId)).size!==activeExperts.length
    ||new Set(activeExperts.map(v=>v.expertContentSha256)).size!==
      activeExperts.length
  ){
    fail('hsme_stage_route_experts',path+'.activeExperts contains duplicates');
  }
  if(
    (routeMode==='SHARED_ONLY'&&activeExperts.length!==0)
    ||(routeMode==='SHARED_PLUS_SPECIALISTS'&&activeExperts.length<1)
  ){
    fail('hsme_stage_route_mode','routeMode does not match active expert count');
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
    routeMode,
    sharedPathEnabled:true,
    routerContentSha256:sha256(
      r.routerContentSha256,path+'.routerContentSha256',
    ),
    activeExperts:Object.freeze(activeExperts),
    deterministicRouteSeedSha256:sha256(
      r.deterministicRouteSeedSha256,
      path+'.deterministicRouteSeedSha256',
    ),
    deterministicRouteContractSha256:sha256(
      r.deterministicRouteContractSha256,
      path+'.deterministicRouteContractSha256',
    ),
  });
}

function normalizeExpertRef(
  raw:unknown,
  path:string,
):HsmeStageRouteExpertRefV1{
  const r=exactRecord(raw,['expertId','expertContentSha256'],path);
  return deepFreeze({
    expertId:identifier(r.expertId,path+'.expertId',120),
    expertContentSha256:sha256(
      r.expertContentSha256,path+'.expertContentSha256',
    ),
  });
}

function readyPlan(plan:HsmeStageRoutingExperimentPlanV1):boolean{
  return plan.schemaVersion===HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA
    &&plan.state==='STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED'
    &&plan.blockers.length===0
    &&plan.planEvidenceSha256!=='UNKNOWN'
    &&plan.prototypeSha256!=='UNKNOWN'
    &&plan.denseBaselineContentSha256!=='UNKNOWN'
    &&plan.routerContentSha256!=='UNKNOWN'
    &&plan.runtimeRepresentationSha256!=='UNKNOWN'
    &&plan.hardwareClass!=='UNKNOWN'
    &&plan.qualityPreservationContractSha256!=='UNKNOWN'
    &&typeof plan.maxActiveExpertsPerStage==='number'
    &&plan.profiles.length===HSME_STAGE_KINDS_V1.length
    &&plan.sharedPathRequired===true
    &&plan.fullBackboneExpertAllowed===false
    &&plan.deterministicStageBoundariesRequired===true
    &&plan.deterministicRoutingRequired===true
    &&plan.stageRoutingExecutionAllowed===false
    &&plan.routeSelectionAllowed===false
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
  HsmeStageRouteTableV1,'stageRoutingPlanSha256'|'routePolicySha256'
>>;

function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageRouteTableV1{
  return terminal('STAGE_ROUTE_TABLE_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageRouteTableV1{
  return terminal('STAGE_ROUTE_TABLE_INVALID',blockers,values);
}
function terminal(
  state:'STAGE_ROUTE_TABLE_INVALID'|'STAGE_ROUTE_TABLE_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeStageRouteTableV1{
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    stageRoutingPlanSha256:values.stageRoutingPlanSha256??'UNKNOWN',
    routePolicySha256:values.routePolicySha256??'UNKNOWN',
    prototypeSha256:'UNKNOWN',
    denseBaselineContentSha256:'UNKNOWN',
    routerContentSha256:'UNKNOWN',
    runtimeRepresentationSha256:'UNKNOWN',
    hardwareClass:'UNKNOWN',
    qualityPreservationContractSha256:'UNKNOWN',
    maxActiveExpertsPerStage:'UNKNOWN',
    routes:Object.freeze([]),
    routeTableEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    stageRoutingExecutionAllowed:false as const,
    routeSelectionAllowed:false as const,
    routeMutationAllowed:false as const,
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
      fail('hsme_stage_route_authority',path+'.'+field+' must remain false');
    }
  }
}

function compareRoutes(
  a:HsmeStageRoutePolicyEntryV1,
  b:HsmeStageRoutePolicyEntryV1,
):number{
  return HSME_STAGE_KINDS_V1.indexOf(a.stageKind)
    -HSME_STAGE_KINDS_V1.indexOf(b.stageKind);
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_stage_route_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_stage_route_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_stage_route_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_stage_route_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_stage_route_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_stage_route_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_stage_route_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_stage_route_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_stage_route_value',
      path+' must be a bounded safe integer',
    );
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
    fail(
      'hsme_stage_route_hash',
      'hash port must return lowercase SHA-256',
    );
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
  throw new HsmeStageRouteTableV1Error(code,message);
}

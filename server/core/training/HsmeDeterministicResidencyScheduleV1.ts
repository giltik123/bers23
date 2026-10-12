import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  type HsmeAdaptiveResidencyExperimentPlanV1,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_DETERMINISTIC_STAGE_SCHEDULE_V1_SCHEMA =
  'BERS_HSME_DETERMINISTIC_STAGE_SCHEDULE_V1' as const;
export const HSME_DETERMINISTIC_STAGE_SCHEDULE_DIGEST_DOMAIN =
  'bers:hsme:deterministic-stage-schedule:v1\0' as const;
export const HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA =
  'BERS_HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1' as const;
export const HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_DIGEST_DOMAIN =
  'bers:hsme:deterministic-residency-schedule:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const TIERS=Object.freeze(['FLASH','RAM','ACCELERATOR'] as const);

export type HsmeResidencyTierV1=typeof TIERS[number];

export type HsmeDeterministicExpertAssetV1=Readonly<{
  expertId:string;
  contentSha256:string;
  bytes:number;
}>;

export type HsmeDeterministicStageRowV1=Readonly<{
  stageIndex:number;
  stageId:string;
  requiredAssetIds:readonly string[];
  acceleratorAssetIds:readonly string[];
  ramAssetIds:readonly string[];
  deterministicPrefetchAssetIds:readonly string[];
  evictAssetIds:readonly string[];
}>;

export type HsmeDeterministicStageScheduleV1=Readonly<{
  schemaVersion:typeof HSME_DETERMINISTIC_STAGE_SCHEDULE_V1_SCHEMA;
  residencyPlanSha256:string;
  denseAssetId:'DENSE_SHARED';
  denseContentSha256:string;
  denseBytes:number;
  routerAssetId:'ROUTER';
  routerContentSha256:string;
  routerBytes:number;
  expertAssets:readonly HsmeDeterministicExpertAssetV1[];
  stages:readonly HsmeDeterministicStageRowV1[];
  sharedDenseRequiredEveryStage:true;
  predictionAllowed:false;
  networkFetchAllowed:false;
  movementExecutionAllowed:false;
  inferenceExecutionAllowed:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  productionAuthorityGranted:false;
}>;

export interface HsmeDeterministicResidencyPlanOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeDeterministicStageScheduleOriginVerifierV1{
  verifyStageSchedule(
    schedule:HsmeDeterministicStageScheduleV1,
    expectedScheduleSha256:string,
  ):Promise<boolean>;
}

export type HsmeDeterministicResidencyScheduleV1=Readonly<{
  schemaVersion:typeof HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA;
  state:
    |'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID'
    |'DETERMINISTIC_RESIDENCY_SCHEDULE_BLOCKED'
    |'DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED';
  blockers:readonly string[];
  residencyPlanSha256:string|'UNKNOWN';
  stageScheduleSha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  stages:readonly HsmeDeterministicStageRowV1[];
  assetBytes:Readonly<Record<string,number>>;
  projectedPeakRamBytes:number|'UNKNOWN';
  projectedPeakAcceleratorBytes:number|'UNKNOWN';
  totalDeterministicPrefetchBytes:number|'UNKNOWN';
  scheduleEvidenceSha256:string|'UNKNOWN';
  predictionAllowed:false;
  movementExecutionAllowed:false;
  inferenceExecutionAllowed:false;
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

export class HsmeDeterministicResidencyScheduleV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDeterministicResidencyScheduleV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDeterministicStageScheduleV1(
  raw:unknown,
):HsmeDeterministicStageScheduleV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','denseAssetId',
    'denseContentSha256','denseBytes','routerAssetId','routerContentSha256',
    'routerBytes','expertAssets','stages','sharedDenseRequiredEveryStage',
    'predictionAllowed','networkFetchAllowed','movementExecutionAllowed',
    'inferenceExecutionAllowed','providerAuthorityGranted',
    'billingAuthorityGranted','productionAuthorityGranted',
  ],'schedule');
  if(r.schemaVersion!==HSME_DETERMINISTIC_STAGE_SCHEDULE_V1_SCHEMA){
    fail('hsme_deterministic_schedule_schema','stage schedule schema unsupported');
  }
  if(
    r.denseAssetId!=='DENSE_SHARED'
    ||r.routerAssetId!=='ROUTER'
    ||r.sharedDenseRequiredEveryStage!==true
    ||r.predictionAllowed!==false
    ||r.networkFetchAllowed!==false
    ||r.movementExecutionAllowed!==false
    ||r.inferenceExecutionAllowed!==false
    ||r.providerAuthorityGranted!==false
    ||r.billingAuthorityGranted!==false
    ||r.productionAuthorityGranted!==false
  ){
    fail('hsme_deterministic_schedule_boundary','stage schedule boundary invalid');
  }
  if(!Array.isArray(r.expertAssets)||r.expertAssets.length<1||r.expertAssets.length>32){
    fail('hsme_deterministic_schedule_experts','expert asset count invalid');
  }
  const expertAssets=r.expertAssets.map((value,index)=>
    normalizeExpertAsset(value,'schedule.expertAssets['+index+']')
  ).sort((a,b)=>lexical(a.expertId,b.expertId));
  const expertIds=expertAssets.map(v=>v.expertId);
  const expertDigests=expertAssets.map(v=>v.contentSha256);
  if(new Set(expertIds).size!==expertIds.length||new Set(expertDigests).size!==expertDigests.length){
    fail('hsme_deterministic_schedule_experts','duplicate expert asset identity');
  }
  if(!Array.isArray(r.stages)||r.stages.length<1||r.stages.length>128){
    fail('hsme_deterministic_schedule_stages','stage count invalid');
  }
  const allAssetIds=new Set(['DENSE_SHARED','ROUTER',...expertIds]);
  const stages=r.stages.map((value,index)=>
    normalizeStage(value,'schedule.stages['+index+']',allAssetIds)
  ).sort((a,b)=>a.stageIndex-b.stageIndex);
  stages.forEach((stage,index)=>{
    if(stage.stageIndex!==index){
      fail('hsme_deterministic_schedule_stage_order','stageIndex must be contiguous from zero');
    }
    if(!stage.requiredAssetIds.includes('DENSE_SHARED')){
      fail('hsme_deterministic_schedule_dense','dense shared asset required every stage');
    }
  });
  return deepFreeze({
    schemaVersion:HSME_DETERMINISTIC_STAGE_SCHEDULE_V1_SCHEMA,
    residencyPlanSha256:sha256(r.residencyPlanSha256,'schedule.residencyPlanSha256'),
    denseAssetId:'DENSE_SHARED',
    denseContentSha256:sha256(r.denseContentSha256,'schedule.denseContentSha256'),
    denseBytes:safeInteger(r.denseBytes,'schedule.denseBytes',1,Number.MAX_SAFE_INTEGER),
    routerAssetId:'ROUTER',
    routerContentSha256:sha256(r.routerContentSha256,'schedule.routerContentSha256'),
    routerBytes:safeInteger(r.routerBytes,'schedule.routerBytes',1,Number.MAX_SAFE_INTEGER),
    expertAssets:Object.freeze(expertAssets),
    stages:Object.freeze(stages),
    sharedDenseRequiredEveryStage:true,
    predictionAllowed:false,
    networkFetchAllowed:false,
    movementExecutionAllowed:false,
    inferenceExecutionAllowed:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    productionAuthorityGranted:false,
  });
}

export async function hsmeDeterministicStageScheduleV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_DETERMINISTIC_STAGE_SCHEDULE_DIGEST_DOMAIN,
    normalizeHsmeDeterministicStageScheduleV1(raw),
    hash,
  );
}

export async function freezeHsmeDeterministicResidencyScheduleV1(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeDeterministicResidencyPlanOriginVerifierV1,
  rawSchedule:unknown,
  expectedScheduleSha256:string,
  scheduleOrigin:HsmeDeterministicStageScheduleOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeDeterministicResidencyScheduleV1>{
  if(
    plan.schemaVersion!==HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA
    ||plan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['DETERMINISTIC_RESIDENCY_FROZEN_PLAN_REQUIRED']);
  }
  let planSha:string;
  try{planSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(plan,hash);}
  catch{return invalid(['DETERMINISTIC_RESIDENCY_PLAN_REHASH_INVALID']);}
  if(
    !HEX64.test(expectedPlanSha256)
    ||planSha!==expectedPlanSha256
    ||planSha!==plan.planEvidenceSha256
  ){
    return invalid(['DETERMINISTIC_RESIDENCY_PLAN_REHASH_MISMATCH'],{residencyPlanSha256:planSha});
  }
  if(!await verify(()=>planOrigin.verifyResidencyPlan(plan,planSha))){
    return invalid(['DETERMINISTIC_RESIDENCY_PLAN_ORIGIN_UNVERIFIED'],{residencyPlanSha256:planSha});
  }
  let schedule:HsmeDeterministicStageScheduleV1;
  let scheduleSha:string;
  try{
    schedule=normalizeHsmeDeterministicStageScheduleV1(rawSchedule);
    scheduleSha=await hsmeDeterministicStageScheduleV1Digest(schedule,hash);
  }catch{
    return invalid(['DETERMINISTIC_RESIDENCY_STAGE_SCHEDULE_INVALID'],{residencyPlanSha256:planSha});
  }
  if(!HEX64.test(expectedScheduleSha256)||scheduleSha!==expectedScheduleSha256){
    return invalid(['DETERMINISTIC_RESIDENCY_STAGE_SCHEDULE_DIGEST_MISMATCH'],{residencyPlanSha256:planSha});
  }
  if(!await verify(()=>scheduleOrigin.verifyStageSchedule(schedule,scheduleSha))){
    return invalid(['DETERMINISTIC_RESIDENCY_STAGE_SCHEDULE_ORIGIN_UNVERIFIED'],{
      residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
    });
  }

  if(
    schedule.residencyPlanSha256!==planSha
    ||plan.denseBaselineContentSha256==='UNKNOWN'
    ||schedule.denseContentSha256!==plan.denseBaselineContentSha256
    ||typeof plan.denseBaselinePackageBytes!=='number'
    ||schedule.denseBytes!==plan.denseBaselinePackageBytes
    ||plan.routerContentSha256==='UNKNOWN'
    ||schedule.routerContentSha256!==plan.routerContentSha256
    ||typeof plan.routerBytes!=='number'
    ||schedule.routerBytes!==plan.routerBytes
  ){
    return invalid(['DETERMINISTIC_RESIDENCY_ASSET_BINDING_MISMATCH'],{
      residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
    });
  }
  if(
    schedule.expertAssets.length!==plan.expertIds.length
    ||JSON.stringify(schedule.expertAssets.map(v=>v.expertId))!==
      JSON.stringify([...plan.expertIds].sort(lexical))
  ){
    return invalid(['DETERMINISTIC_RESIDENCY_EXPERT_ROSTER_MISMATCH'],{
      residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
    });
  }
  for(const asset of schedule.expertAssets){
    const index=plan.expertIds.indexOf(asset.expertId);
    if(index<0||plan.expertContentSha256s[index]!==asset.contentSha256){
      return invalid(['DETERMINISTIC_RESIDENCY_EXPERT_ROSTER_MISMATCH'],{
        residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
      });
    }
  }
  const totalExpertBytes=schedule.expertAssets.reduce((sum,v)=>checkedAdd(sum,v.bytes),0);
  if(
    typeof plan.totalExpertArtifactBytes!=='number'
    ||totalExpertBytes!==plan.totalExpertArtifactBytes
  ){
    return invalid(['DETERMINISTIC_RESIDENCY_EXPERT_BYTES_MISMATCH'],{
      residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
    });
  }

  const bytes:Record<string,number>={
    DENSE_SHARED:schedule.denseBytes,
    ROUTER:schedule.routerBytes,
  };
  for(const asset of schedule.expertAssets) bytes[asset.expertId]=asset.bytes;

  let peakRam=0;
  let peakAccelerator=0;
  let totalPrefetch=0;
  for(const stage of schedule.stages){
    const activeExperts=stage.requiredAssetIds.filter(id=>id!=='DENSE_SHARED'&&id!=='ROUTER');
    if(
      typeof plan.maxActiveExperts!=='number'
      ||activeExperts.length>plan.maxActiveExperts
    ){
      return invalid(['DETERMINISTIC_RESIDENCY_ACTIVE_EXPERT_LIMIT_EXCEEDED'],{
        residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
      });
    }
    if(stage.evictAssetIds.some(id=>stage.requiredAssetIds.includes(id))){
      return invalid(['DETERMINISTIC_RESIDENCY_REQUIRED_ASSET_EVICTION'],{
        residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
      });
    }
    const prefetchBytes=sumAssetBytes(stage.deterministicPrefetchAssetIds,bytes);
    if(
      typeof plan.maxDeterministicPrefetchBytesPerStage!=='number'
      ||prefetchBytes>plan.maxDeterministicPrefetchBytesPerStage
    ){
      return invalid(['DETERMINISTIC_RESIDENCY_PREFETCH_CAP_EXCEEDED'],{
        residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
      });
    }
    totalPrefetch=checkedAdd(totalPrefetch,prefetchBytes);
    const ram=sumAssetBytes(stage.ramAssetIds,bytes);
    const accelerator=sumAssetBytes(stage.acceleratorAssetIds,bytes);
    peakRam=Math.max(peakRam,ram);
    peakAccelerator=Math.max(peakAccelerator,accelerator);
    if(
      typeof plan.maxRamBudgetBytes!=='number'
      ||typeof plan.maxAcceleratorBudgetBytes!=='number'
      ||ram>plan.maxRamBudgetBytes
      ||accelerator>plan.maxAcceleratorBudgetBytes
    ){
      return invalid(['DETERMINISTIC_RESIDENCY_STAGE_BUDGET_EXCEEDED'],{
        residencyPlanSha256:planSha,stageScheduleSha256:scheduleSha,
      });
    }
  }

  const payload={
    schemaVersion:HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA,
    state:'DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    residencyPlanSha256:planSha,
    stageScheduleSha256:scheduleSha,
    prototypeSha256:plan.prototypeSha256,
    stages:schedule.stages,
    assetBytes:deepFreeze({...bytes}),
    projectedPeakRamBytes:peakRam,
    projectedPeakAcceleratorBytes:peakAccelerator,
    totalDeterministicPrefetchBytes:totalPrefetch,
    predictionAllowed:false as const,
    ...authorityBoundary(),
  };
  const scheduleEvidenceSha256=await digest(
    HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_DIGEST_DOMAIN,payload,hash,
  );
  return deepFreeze({...payload,scheduleEvidenceSha256});
}

export async function hsmeDeterministicResidencyScheduleV1Digest(
  schedule:HsmeDeterministicResidencyScheduleV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    schedule.state!=='DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED'
    ||schedule.scheduleEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_deterministic_schedule_digest_state','only READY_NOT_EXECUTED schedule is digestible');
  }
  const {scheduleEvidenceSha256:_ignored,...payload}=schedule;
  return digest(HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_DIGEST_DOMAIN,payload,hash);
}

function normalizeExpertAsset(raw:unknown,path:string):HsmeDeterministicExpertAssetV1{
  const r=exactRecord(raw,['expertId','contentSha256','bytes'],path);
  return deepFreeze({
    expertId:identifier(r.expertId,path+'.expertId',120),
    contentSha256:sha256(r.contentSha256,path+'.contentSha256'),
    bytes:safeInteger(r.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
  });
}
function normalizeStage(
  raw:unknown,path:string,assetIds:Set<string>,
):HsmeDeterministicStageRowV1{
  const r=exactRecord(raw,[
    'stageIndex','stageId','requiredAssetIds','acceleratorAssetIds',
    'ramAssetIds','deterministicPrefetchAssetIds','evictAssetIds',
  ],path);
  const lists=[
    ['requiredAssetIds',r.requiredAssetIds],
    ['acceleratorAssetIds',r.acceleratorAssetIds],
    ['ramAssetIds',r.ramAssetIds],
    ['deterministicPrefetchAssetIds',r.deterministicPrefetchAssetIds],
    ['evictAssetIds',r.evictAssetIds],
  ] as const;
  const normalized:Record<string,readonly string[]>={};
  for(const [name,value] of lists){
    if(!Array.isArray(value)){
      fail('hsme_deterministic_schedule_stage',path+'.'+name+' must be array');
    }
    const ids=value.map((v,i)=>identifier(v,path+'.'+name+'['+i+']',120));
    if(new Set(ids).size!==ids.length||ids.some(id=>!assetIds.has(id))){
      fail('hsme_deterministic_schedule_stage',path+'.'+name+' contains duplicate/unknown asset');
    }
    normalized[name]=Object.freeze([...ids].sort(lexical));
  }
  const accel=normalized.acceleratorAssetIds;
  const ram=normalized.ramAssetIds;
  if(accel.some(id=>ram.includes(id))){
    fail('hsme_deterministic_schedule_stage','asset cannot be resident in RAM and accelerator simultaneously');
  }
  return deepFreeze({
    stageIndex:safeInteger(r.stageIndex,path+'.stageIndex',0,127),
    stageId:identifier(r.stageId,path+'.stageId',120),
    requiredAssetIds:normalized.requiredAssetIds,
    acceleratorAssetIds:accel,
    ramAssetIds:ram,
    deterministicPrefetchAssetIds:normalized.deterministicPrefetchAssetIds,
    evictAssetIds:normalized.evictAssetIds,
  });
}

type PartialOutput=Partial<Pick<
  HsmeDeterministicResidencyScheduleV1,
  'residencyPlanSha256'|'stageScheduleSha256'|'prototypeSha256'
>>;
function invalid(blockers:readonly string[],values:PartialOutput={}){
  return terminal('DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID',blockers,values);
}
function blocked(blockers:readonly string[],values:PartialOutput={}){
  return terminal('DETERMINISTIC_RESIDENCY_SCHEDULE_BLOCKED',blockers,values);
}
function terminal(
  state:'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID'|'DETERMINISTIC_RESIDENCY_SCHEDULE_BLOCKED',
  blockers:readonly string[],values:PartialOutput,
):HsmeDeterministicResidencyScheduleV1{
  return deepFreeze({
    schemaVersion:HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    stageScheduleSha256:values.stageScheduleSha256??'UNKNOWN',
    prototypeSha256:values.prototypeSha256??'UNKNOWN',
    stages:Object.freeze([]),
    assetBytes:Object.freeze({}),
    projectedPeakRamBytes:'UNKNOWN',
    projectedPeakAcceleratorBytes:'UNKNOWN',
    totalDeterministicPrefetchBytes:'UNKNOWN',
    scheduleEvidenceSha256:'UNKNOWN',
    predictionAllowed:false,
    ...authorityBoundary(),
  });
}
function authorityBoundary(){
  return Object.freeze({
    movementExecutionAllowed:false as const,
    inferenceExecutionAllowed:false as const,
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
function sumAssetBytes(ids:readonly string[],bytes:Record<string,number>):number{
  return ids.reduce((sum,id)=>checkedAdd(sum,bytes[id]??0),0);
}
function checkedAdd(a:number,b:number):number{
  const v=a+b;
  if(!Number.isSafeInteger(v)||v<0) fail('hsme_deterministic_schedule_value','safe integer overflow');
  return v;
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) fail('hsme_deterministic_schedule_schema',path+' must be object');
  const r=raw as Record<string,unknown>,keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_deterministic_schedule_schema',path+' unknown or missing fields');
  }
  return r;
}
function identifier(raw:unknown,path:string,max:number):string{
  const v=boundedString(raw,path,max);
  if(!IDENTIFIER.test(v)) fail('hsme_deterministic_schedule_value',path+' must be identifier');
  return v;
}
function sha256(raw:unknown,path:string):string{
  const v=boundedString(raw,path,64);
  if(!HEX64.test(v)) fail('hsme_deterministic_schedule_value',path+' must be lowercase SHA-256');
  return v;
}
function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string') fail('hsme_deterministic_schedule_value',path+' must be string');
  const v=raw.trim();
  if(v.length<1||v.length>max||/[\u0000-\u001f\u007f]/.test(v)) fail('hsme_deterministic_schedule_value',path+' invalid');
  return v;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max) fail('hsme_deterministic_schedule_value',path+' must be bounded integer');
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_deterministic_schedule_hash','hash port invalid');
  return d;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{
  throw new HsmeDeterministicResidencyScheduleV1Error(code,message);
}

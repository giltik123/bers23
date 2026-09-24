import {
  HSME_SPATIAL_REGION_ROLES_V1,
  HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
  HSME_SPATIAL_VARIANTS_V1,
  hsmeSpatialSparsityExperimentPlanV1Digest,
  type HsmeSpatialRegionRoleV1,
  type HsmeSpatialSparsityExperimentPlanV1,
  type HsmeSpatialVariantV1,
} from './HsmeSpatialSparsityExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPATIAL_COMPUTE_MAP_SET_V1_SCHEMA =
  'BERS_HSME_SPATIAL_COMPUTE_MAP_SET_V1' as const;
export const HSME_SPATIAL_COMPUTE_MAP_SET_DIGEST_DOMAIN =
  'bers:hsme:spatial-compute-map-set:v1\0' as const;
export const HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA =
  'BERS_HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1' as const;
export const HSME_SPATIAL_COMPUTE_MAP_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:spatial-compute-map-roster:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const ACTIONS=Object.freeze([
  'FULL_SHARED',
  'CHEAP_SHARED',
  'PRUNED',
] as const);

export type HsmeSpatialComputeActionV1=typeof ACTIONS[number];

export type HsmeSpatialRegionActionV1=Readonly<{
  role:HsmeSpatialRegionRoleV1;
  action:HsmeSpatialComputeActionV1;
  actionEvidenceSha256:string;
}>;

export type HsmeSpatialComputeMapCandidateV1=Readonly<{
  variant:HsmeSpatialVariantV1;
  experimentPlanSha256:string;
  spatialMapSha256:string;
  spatialMapEvidenceSha256:string;
  gridWidth:number;
  gridHeight:number;
  regionActions:readonly HsmeSpatialRegionActionV1[];
  fullComputeAreaBps:number;
  cheapPathAreaBps:number;
  prunedAreaBps:number;
  fullComputeTokenWork:number;
  cheapPathTokenWork:number;
  prunedTokenWork:number;
  deterministicReplayIdentitySha256:string;
  reviewedBeforeExecution:true;
}>;

export type HsmeSpatialComputeMapSetV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_COMPUTE_MAP_SET_V1_SCHEMA;
  experimentPlanSha256:string;
  prototypeSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  fixtureSetSha256:string;
  candidates:readonly HsmeSpatialComputeMapCandidateV1[];
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

export interface HsmeSpatialComputeMapPlanOriginVerifierV1{
  verifySpatialExperimentPlan(
    plan:HsmeSpatialSparsityExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSpatialComputeMapSetOriginVerifierV1{
  verifySpatialComputeMapSet(
    mapSet:HsmeSpatialComputeMapSetV1,
    expectedMapSetSha256:string,
  ):Promise<boolean>;
}

export type HsmeSpatialComputeMapRosterV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA;
  state:
    |'SPATIAL_COMPUTE_MAP_ROSTER_INVALID'
    |'SPATIAL_COMPUTE_MAP_ROSTER_BLOCKED'
    |'SPATIAL_COMPUTE_MAP_ROSTER_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  experimentPlanSha256:string|'UNKNOWN';
  mapSetSha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  gridWidth:number|'UNKNOWN';
  gridHeight:number|'UNKNOWN';
  candidates:readonly HsmeSpatialComputeMapCandidateV1[];
  rosterEvidenceSha256:string|'UNKNOWN';
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

export class HsmeSpatialComputeMapRosterV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSpatialComputeMapRosterV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSpatialComputeMapSetV1(
  raw:unknown,
):HsmeSpatialComputeMapSetV1{
  const r=exactRecord(raw,[
    'schemaVersion','experimentPlanSha256','prototypeSha256',
    'runtimeRepresentationSha256','hardwareClass','fixtureSetSha256',
    'candidates','spatialExecutionAllowed','spatialMapMutationAllowed',
    'inferenceExecutionAllowed','fashionGeometryAuthorityGranted',
    'projectMutationAllowed','artifactAuthorityGranted',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'aeeExecutionAuthorityGranted',
  ],'mapSet');
  if(r.schemaVersion!==HSME_SPATIAL_COMPUTE_MAP_SET_V1_SCHEMA){
    fail('hsme_spatial_map_set_schema','map set schema unsupported');
  }
  assertNoAuthority(r,'mapSet');
  if(!Array.isArray(r.candidates)||r.candidates.length<2||r.candidates.length>3){
    fail('hsme_spatial_map_set_candidates','candidate cardinality invalid');
  }
  const candidates=r.candidates.map((value,index)=>
    normalizeCandidate(value,'mapSet.candidates['+index+']')
  ).sort(compareCandidates);
  if(
    new Set(candidates.map(value=>value.variant)).size!==candidates.length
  ){
    fail('hsme_spatial_map_set_candidates','candidate variants must be unique');
  }
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_COMPUTE_MAP_SET_V1_SCHEMA,
    experimentPlanSha256:sha256(
      r.experimentPlanSha256,'mapSet.experimentPlanSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'mapSet.prototypeSha256'),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'mapSet.runtimeRepresentationSha256',
    ),
    hardwareClass:boundedString(r.hardwareClass,'mapSet.hardwareClass',160),
    fixtureSetSha256:sha256(r.fixtureSetSha256,'mapSet.fixtureSetSha256'),
    candidates:Object.freeze(candidates),
    ...authorityBoundary(),
  });
}

export async function hsmeSpatialComputeMapSetV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPATIAL_COMPUTE_MAP_SET_DIGEST_DOMAIN,
    normalizeHsmeSpatialComputeMapSetV1(raw),
    hash,
  );
}

export async function freezeHsmeSpatialComputeMapRosterV1(
  plan:HsmeSpatialSparsityExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeSpatialComputeMapPlanOriginVerifierV1,
  rawMapSet:unknown,
  expectedMapSetSha256:string,
  mapSetOrigin:HsmeSpatialComputeMapSetOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSpatialComputeMapRosterV1>{
  if(
    plan.schemaVersion!==HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA
    ||plan.state!=='SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['SPATIAL_COMPUTE_MAP_FROZEN_PLAN_REQUIRED']);
  }

  let planSha:string;
  try{
    planSha=await hsmeSpatialSparsityExperimentPlanV1Digest(plan,hash);
  }catch{
    return invalid(['SPATIAL_COMPUTE_MAP_PLAN_REHASH_INVALID']);
  }
  const common={experimentPlanSha256:planSha};
  if(
    !exactDigest(
      expectedPlanSha256,planSha,plan.planEvidenceSha256 as string,
    )
  ){
    return invalid(['SPATIAL_COMPUTE_MAP_PLAN_REHASH_MISMATCH'],common);
  }
  if(!await verify(
    ()=>planOrigin.verifySpatialExperimentPlan(plan,planSha),
  )){
    return invalid(['SPATIAL_COMPUTE_MAP_PLAN_ORIGIN_UNVERIFIED'],common);
  }

  let mapSet:HsmeSpatialComputeMapSetV1;
  let mapSetSha:string;
  try{
    mapSet=normalizeHsmeSpatialComputeMapSetV1(rawMapSet);
    mapSetSha=await hsmeSpatialComputeMapSetV1Digest(mapSet,hash);
  }catch{
    return invalid(['SPATIAL_COMPUTE_MAP_SET_INVALID'],common);
  }
  const bound={...common,mapSetSha256:mapSetSha};
  if(!exactDigest(expectedMapSetSha256,mapSetSha,mapSetSha)){
    return invalid(['SPATIAL_COMPUTE_MAP_SET_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>mapSetOrigin.verifySpatialComputeMapSet(mapSet,mapSetSha),
  )){
    return invalid(['SPATIAL_COMPUTE_MAP_SET_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    mapSet.experimentPlanSha256!==planSha
    ||mapSet.prototypeSha256!==plan.prototypeSha256
    ||mapSet.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||mapSet.hardwareClass!==plan.hardwareClass
    ||mapSet.fixtureSetSha256!==plan.fixtureSetSha256
  ){
    return invalid(['SPATIAL_COMPUTE_MAP_SET_BINDING_MISMATCH'],bound);
  }
  if(
    mapSet.candidates.length!==plan.variants.length
    ||mapSet.candidates.some(
      (candidate,index)=>candidate.variant!==plan.variants[index],
    )
  ){
    return invalid(['SPATIAL_COMPUTE_MAP_VARIANT_SET_MISMATCH'],bound);
  }

  for(const candidate of mapSet.candidates){
    const blocker=validateCandidateAgainstPlan(candidate,plan,planSha);
    if(blocker!==null){
      return invalid([blocker],bound);
    }
  }

  const payload={
    schemaVersion:HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA,
    state:'SPATIAL_COMPUTE_MAP_ROSTER_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    experimentPlanSha256:planSha,
    mapSetSha256:mapSetSha,
    prototypeSha256:plan.prototypeSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
    fixtureSetSha256:plan.fixtureSetSha256,
    gridWidth:plan.gridWidth,
    gridHeight:plan.gridHeight,
    candidates:mapSet.candidates,
    ...authorityBoundary(),
  };
  const rosterEvidenceSha256=await digest(
    HSME_SPATIAL_COMPUTE_MAP_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,rosterEvidenceSha256});
}

export async function hsmeSpatialComputeMapRosterV1Digest(
  value:HsmeSpatialComputeMapRosterV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='SPATIAL_COMPUTE_MAP_ROSTER_FROZEN_NOT_EXECUTED'
    ||value.rosterEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_spatial_map_roster_digest_state',
      'only FROZEN_NOT_EXECUTED roster is digestible',
    );
  }
  const {rosterEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_SPATIAL_COMPUTE_MAP_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeCandidate(
  raw:unknown,
  path:string,
):HsmeSpatialComputeMapCandidateV1{
  const r=exactRecord(raw,[
    'variant','experimentPlanSha256','spatialMapSha256',
    'spatialMapEvidenceSha256','gridWidth','gridHeight','regionActions',
    'fullComputeAreaBps','cheapPathAreaBps','prunedAreaBps',
    'fullComputeTokenWork','cheapPathTokenWork','prunedTokenWork',
    'deterministicReplayIdentitySha256','reviewedBeforeExecution',
  ],path);
  if(r.reviewedBeforeExecution!==true){
    fail(
      'hsme_spatial_map_candidate_review',
      path+'.reviewedBeforeExecution must be true',
    );
  }
  if(
    !Array.isArray(r.regionActions)
    ||r.regionActions.length!==HSME_SPATIAL_REGION_ROLES_V1.length
  ){
    fail(
      'hsme_spatial_map_candidate_actions',
      path+' must assign every region role exactly once',
    );
  }
  const regionActions=r.regionActions.map((value,index)=>
    normalizeRegionAction(value,path+'.regionActions['+index+']')
  ).sort(compareRegionActions);
  if(
    new Set(regionActions.map(value=>value.role)).size!==
      regionActions.length
    ||regionActions.some(
      (value,index)=>value.role!==HSME_SPATIAL_REGION_ROLES_V1[index],
    )
  ){
    fail(
      'hsme_spatial_map_candidate_actions',
      path+' region roles are incomplete or duplicated',
    );
  }
  const fullComputeAreaBps=safeInteger(
    r.fullComputeAreaBps,path+'.fullComputeAreaBps',0,10_000,
  );
  const cheapPathAreaBps=safeInteger(
    r.cheapPathAreaBps,path+'.cheapPathAreaBps',0,10_000,
  );
  const prunedAreaBps=safeInteger(
    r.prunedAreaBps,path+'.prunedAreaBps',0,10_000,
  );
  if(
    fullComputeAreaBps+cheapPathAreaBps+prunedAreaBps!==10_000
  ){
    fail(
      'hsme_spatial_map_candidate_area',
      path+' area partitions must sum to 10000 bps',
    );
  }
  return deepFreeze({
    variant:enumValue(r.variant,HSME_SPATIAL_VARIANTS_V1,path+'.variant'),
    experimentPlanSha256:sha256(
      r.experimentPlanSha256,path+'.experimentPlanSha256',
    ),
    spatialMapSha256:sha256(r.spatialMapSha256,path+'.spatialMapSha256'),
    spatialMapEvidenceSha256:sha256(
      r.spatialMapEvidenceSha256,path+'.spatialMapEvidenceSha256',
    ),
    gridWidth:safeInteger(r.gridWidth,path+'.gridWidth',1,4096),
    gridHeight:safeInteger(r.gridHeight,path+'.gridHeight',1,4096),
    regionActions:Object.freeze(regionActions),
    fullComputeAreaBps,
    cheapPathAreaBps,
    prunedAreaBps,
    fullComputeTokenWork:safeInteger(
      r.fullComputeTokenWork,path+'.fullComputeTokenWork',1,
      Number.MAX_SAFE_INTEGER,
    ),
    cheapPathTokenWork:safeInteger(
      r.cheapPathTokenWork,path+'.cheapPathTokenWork',0,
      Number.MAX_SAFE_INTEGER,
    ),
    prunedTokenWork:safeInteger(
      r.prunedTokenWork,path+'.prunedTokenWork',0,
      Number.MAX_SAFE_INTEGER,
    ),
    deterministicReplayIdentitySha256:sha256(
      r.deterministicReplayIdentitySha256,
      path+'.deterministicReplayIdentitySha256',
    ),
    reviewedBeforeExecution:true,
  });
}

function normalizeRegionAction(
  raw:unknown,
  path:string,
):HsmeSpatialRegionActionV1{
  const r=exactRecord(
    raw,
    ['role','action','actionEvidenceSha256'],
    path,
  );
  return deepFreeze({
    role:enumValue(r.role,HSME_SPATIAL_REGION_ROLES_V1,path+'.role'),
    action:enumValue(r.action,ACTIONS,path+'.action'),
    actionEvidenceSha256:sha256(
      r.actionEvidenceSha256,path+'.actionEvidenceSha256',
    ),
  });
}

function validateCandidateAgainstPlan(
  candidate:HsmeSpatialComputeMapCandidateV1,
  plan:HsmeSpatialSparsityExperimentPlanV1,
  planSha:string,
):string|null{
  if(
    candidate.experimentPlanSha256!==planSha
    ||candidate.gridWidth!==plan.gridWidth
    ||candidate.gridHeight!==plan.gridHeight
  ){
    return 'SPATIAL_COMPUTE_MAP_CANDIDATE_BINDING_MISMATCH';
  }

  for(const assignment of candidate.regionActions){
    if(
      plan.protectedRegionRoles.includes(assignment.role)
      &&assignment.action!=='FULL_SHARED'
    ){
      return 'SPATIAL_COMPUTE_MAP_PROTECTED_REGION_ACTION_INVALID';
    }
    if(
      assignment.action==='CHEAP_SHARED'
      &&!plan.cheapPathAllowedRoles.includes(assignment.role)
    ){
      return 'SPATIAL_COMPUTE_MAP_CHEAP_ROLE_INVALID';
    }
    if(
      assignment.action==='PRUNED'
      &&!plan.prunableRoles.includes(assignment.role)
    ){
      return 'SPATIAL_COMPUTE_MAP_PRUNED_ROLE_INVALID';
    }
  }

  if(
    candidate.cheapPathAreaBps>(plan.maxCheapPathAreaBps as number)
    ||candidate.prunedAreaBps>(plan.maxPrunedAreaBps as number)
    ||candidate.fullComputeAreaBps<(plan.minFullComputeAreaBps as number)
  ){
    return 'SPATIAL_COMPUTE_MAP_AREA_BUDGET_EXCEEDED';
  }

  const background=candidate.regionActions.find(
    value=>value.role==='LOW_INFORMATION_BACKGROUND',
  );
  if(background===undefined){
    return 'SPATIAL_COMPUTE_MAP_BACKGROUND_ACTION_MISSING';
  }

  if(candidate.variant==='FULL_SPATIAL_CONTROL'){
    if(
      candidate.regionActions.some(value=>value.action!=='FULL_SHARED')
      ||candidate.fullComputeAreaBps!==10_000
      ||candidate.cheapPathAreaBps!==0
      ||candidate.prunedAreaBps!==0
      ||candidate.cheapPathTokenWork!==0
      ||candidate.prunedTokenWork!==0
    ){
      return 'SPATIAL_COMPUTE_MAP_FULL_CONTROL_INVALID';
    }
    return null;
  }

  if(candidate.variant==='PROTECTED_REGION_CHEAP_BACKGROUND'){
    if(
      background.action!=='CHEAP_SHARED'
      ||candidate.cheapPathAreaBps<=0
      ||candidate.prunedAreaBps!==0
      ||candidate.prunedTokenWork!==0
    ){
      return 'SPATIAL_COMPUTE_MAP_CHEAP_BACKGROUND_INVALID';
    }
    return null;
  }

  if(
    background.action!=='PRUNED'
    ||candidate.prunedAreaBps<=0
    ||candidate.prunedTokenWork<=0
  ){
    return 'SPATIAL_COMPUTE_MAP_PRUNING_INVALID';
  }
  return null;
}

type PartialOutput=Partial<Pick<
  HsmeSpatialComputeMapRosterV1,
  'experimentPlanSha256'|'mapSetSha256'
>>;

function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeSpatialComputeMapRosterV1{
  return terminal('SPATIAL_COMPUTE_MAP_ROSTER_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeSpatialComputeMapRosterV1{
  return terminal('SPATIAL_COMPUTE_MAP_ROSTER_INVALID',blockers,values);
}
function terminal(
  state:
    |'SPATIAL_COMPUTE_MAP_ROSTER_INVALID'
    |'SPATIAL_COMPUTE_MAP_ROSTER_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSpatialComputeMapRosterV1{
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    mapSetSha256:values.mapSetSha256??'UNKNOWN',
    prototypeSha256:'UNKNOWN',
    runtimeRepresentationSha256:'UNKNOWN',
    hardwareClass:'UNKNOWN',
    fixtureSetSha256:'UNKNOWN',
    gridWidth:'UNKNOWN',
    gridHeight:'UNKNOWN',
    candidates:Object.freeze([]),
    rosterEvidenceSha256:'UNKNOWN',
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
        'hsme_spatial_map_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function compareCandidates(
  a:HsmeSpatialComputeMapCandidateV1,
  b:HsmeSpatialComputeMapCandidateV1,
):number{
  return HSME_SPATIAL_VARIANTS_V1.indexOf(a.variant)
    -HSME_SPATIAL_VARIANTS_V1.indexOf(b.variant);
}

function compareRegionActions(
  a:HsmeSpatialRegionActionV1,
  b:HsmeSpatialRegionActionV1,
):number{
  return HSME_SPATIAL_REGION_ROLES_V1.indexOf(a.role)
    -HSME_SPATIAL_REGION_ROLES_V1.indexOf(b.role);
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_spatial_map_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_spatial_map_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_spatial_map_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_spatial_map_value',path+' is unsupported');
  }
  return raw as T[number];
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_spatial_map_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_spatial_map_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_spatial_map_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_spatial_map_value',
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
      'hsme_spatial_map_hash',
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
  throw new HsmeSpatialComputeMapRosterV1Error(code,message);
}

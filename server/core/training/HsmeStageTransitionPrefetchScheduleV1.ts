import {
  HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
  hsmeStageRouteTableV1Digest,
  type HsmeStageRoutePolicyEntryV1,
  type HsmeStageRouteTableV1,
} from './HsmeStageRouteTableV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA =
  'BERS_HSME_STAGE_PREFETCH_ASSET_ROSTER_V1' as const;
export const HSME_STAGE_PREFETCH_ASSET_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:stage-prefetch-asset-roster:v1\0' as const;
export const HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA =
  'BERS_HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1' as const;
export const HSME_STAGE_TRANSITION_PREFETCH_POLICY_DIGEST_DOMAIN =
  'bers:hsme:stage-transition-prefetch-policy:v1\0' as const;
export const HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA =
  'BERS_HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1' as const;
export const HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_DIGEST_DOMAIN =
  'bers:hsme:stage-transition-prefetch-schedule:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const TRANSITION_IDS=Object.freeze([
  'GEOMETRY_TO_APPEARANCE',
  'APPEARANCE_TO_DETAIL',
] as const);

export type HsmeStageTransitionIdV1=typeof TRANSITION_IDS[number];

export type HsmeStagePrefetchAssetV1=Readonly<{
  expertId:string;
  expertContentSha256:string;
  artifactBytes:number;
  immutableAssetEvidenceSha256:string;
}>;

export type HsmeStagePrefetchAssetRosterV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA;
  routeTableEvidenceSha256:string;
  prototypeSha256:string;
  routerContentSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  assets:readonly HsmeStagePrefetchAssetV1[];
  realMeasuredOrManifestEvidence:true;
  movementExecutionAllowed:false;
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
  winnerSelectionAllowed:false;
}>;

export type HsmeStageTransitionPrefetchPolicyEntryV1=Readonly<{
  transitionId:HsmeStageTransitionIdV1;
  fromStageId:string;
  toStageId:string;
  triggerProgressBps:number;
  prefetchRequired:true;
  networkAllowed:false;
  deterministicOnly:true;
}>;

export type HsmeStageTransitionPrefetchPolicyV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA;
  routeTableEvidenceSha256:string;
  assetRosterSha256:string;
  transitions:readonly HsmeStageTransitionPrefetchPolicyEntryV1[];
  reviewState:'STAGE_TRANSITION_PREFETCH_POLICY_REVIEWED';
  movementExecutionAllowed:false;
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
  winnerSelectionAllowed:false;
}>;

export interface HsmeStageRouteTableOriginVerifierV1{
  verifyStageRouteTable(
    routeTable:HsmeStageRouteTableV1,
    expectedRouteTableSha256:string,
  ):Promise<boolean>;
}

export interface HsmeStagePrefetchAssetRosterOriginVerifierV1{
  verifyStagePrefetchAssetRoster(
    roster:HsmeStagePrefetchAssetRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}

export interface HsmeStageTransitionPrefetchPolicyOriginVerifierV1{
  verifyStageTransitionPrefetchPolicy(
    policy:HsmeStageTransitionPrefetchPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeStageTransitionPrefetchScheduleEntryV1=Readonly<{
  transitionId:HsmeStageTransitionIdV1;
  fromStageId:string;
  fromStageKind:'GEOMETRY'|'APPEARANCE';
  toStageId:string;
  toStageKind:'APPEARANCE'|'DETAIL';
  triggerProgressBps:number;
  targetRouterContentSha256:string;
  targetDeterministicRouteSeedSha256:string;
  targetDeterministicRouteContractSha256:string;
  assets:readonly HsmeStagePrefetchAssetV1[];
  prefetchBytes:number;
  prefetchBudgetBytes:number;
  prefetchRequired:true;
  networkAllowed:false;
  deterministicOnly:true;
}>;

export type HsmeStageTransitionPrefetchScheduleV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA;
  state:
    |'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID'
    |'STAGE_TRANSITION_PREFETCH_SCHEDULE_BLOCKED'
    |'STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  routeTableEvidenceSha256:string|'UNKNOWN';
  assetRosterSha256:string|'UNKNOWN';
  prefetchPolicySha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  routerContentSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  maxStageTransitionPrefetchBytes:number|'UNKNOWN';
  transitions:readonly HsmeStageTransitionPrefetchScheduleEntryV1[];
  scheduleEvidenceSha256:string|'UNKNOWN';
  movementExecutionAllowed:false;
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
  winnerSelectionAllowed:false;
}>;

export class HsmeStageTransitionPrefetchScheduleV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeStageTransitionPrefetchScheduleV1Error';
    this.code=code;
  }
}

export function normalizeHsmeStagePrefetchAssetRosterV1(
  raw:unknown,
):HsmeStagePrefetchAssetRosterV1{
  const r=exactRecord(raw,[
    'schemaVersion','routeTableEvidenceSha256','prototypeSha256',
    'routerContentSha256','runtimeRepresentationSha256','hardwareClass',
    'assets','realMeasuredOrManifestEvidence','movementExecutionAllowed',
    'stageRoutingExecutionAllowed','routeSelectionAllowed',
    'routeMutationAllowed','inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'roster');
  if(r.schemaVersion!==HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA){
    fail('hsme_stage_prefetch_roster_schema','asset roster schema unsupported');
  }
  if(r.realMeasuredOrManifestEvidence!==true){
    fail(
      'hsme_stage_prefetch_roster_evidence',
      'realMeasuredOrManifestEvidence must be true',
    );
  }
  assertNoAuthority(r,'roster');
  if(!Array.isArray(r.assets)){
    fail('hsme_stage_prefetch_roster_assets','assets must be an array');
  }
  const assets=r.assets.map((value,index)=>
    normalizeAsset(value,'roster.assets['+index+']')
  ).sort((a,b)=>lexical(a.expertId,b.expertId));
  if(
    new Set(assets.map(v=>v.expertId)).size!==assets.length
    ||new Set(assets.map(v=>v.expertContentSha256)).size!==assets.length
  ){
    fail(
      'hsme_stage_prefetch_roster_duplicate',
      'asset expert/content identities must be unique',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA,
    routeTableEvidenceSha256:sha256(
      r.routeTableEvidenceSha256,'roster.routeTableEvidenceSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'roster.prototypeSha256'),
    routerContentSha256:sha256(
      r.routerContentSha256,'roster.routerContentSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,'roster.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'roster.hardwareClass',160),
    assets:Object.freeze(assets),
    realMeasuredOrManifestEvidence:true,
    ...authorityBoundary(),
  });
}

export async function hsmeStagePrefetchAssetRosterV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_PREFETCH_ASSET_ROSTER_DIGEST_DOMAIN,
    normalizeHsmeStagePrefetchAssetRosterV1(raw),
    hash,
  );
}

export function normalizeHsmeStageTransitionPrefetchPolicyV1(
  raw:unknown,
):HsmeStageTransitionPrefetchPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','routeTableEvidenceSha256','assetRosterSha256',
    'transitions','reviewState','movementExecutionAllowed',
    'stageRoutingExecutionAllowed','routeSelectionAllowed',
    'routeMutationAllowed','inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA){
    fail('hsme_stage_prefetch_policy_schema','prefetch policy schema unsupported');
  }
  if(r.reviewState!=='STAGE_TRANSITION_PREFETCH_POLICY_REVIEWED'){
    fail('hsme_stage_prefetch_policy_review','prefetch policy review state invalid');
  }
  assertNoAuthority(r,'policy');
  if(!Array.isArray(r.transitions)||r.transitions.length!==TRANSITION_IDS.length){
    fail(
      'hsme_stage_prefetch_policy_transitions',
      'exactly two transitions are required',
    );
  }
  const transitions=r.transitions.map((value,index)=>
    normalizePolicyTransition(value,'policy.transitions['+index+']')
  ).sort(comparePolicyTransitions);
  if(
    new Set(transitions.map(v=>v.transitionId)).size!==transitions.length
  ){
    fail('hsme_stage_prefetch_policy_duplicate','transition id must be unique');
  }
  for(let index=0;index<transitions.length;index+=1){
    if(transitions[index].transitionId!==TRANSITION_IDS[index]){
      fail(
        'hsme_stage_prefetch_policy_order',
        'transitions must cover GEOMETRY→APPEARANCE→DETAIL',
      );
    }
  }
  return deepFreeze({
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA,
    routeTableEvidenceSha256:sha256(
      r.routeTableEvidenceSha256,'policy.routeTableEvidenceSha256',
    ),
    assetRosterSha256:sha256(r.assetRosterSha256,'policy.assetRosterSha256'),
    transitions:Object.freeze(transitions),
    reviewState:'STAGE_TRANSITION_PREFETCH_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeStageTransitionPrefetchPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_TRANSITION_PREFETCH_POLICY_DIGEST_DOMAIN,
    normalizeHsmeStageTransitionPrefetchPolicyV1(raw),
    hash,
  );
}

export async function freezeHsmeStageTransitionPrefetchScheduleV1(
  routeTable:HsmeStageRouteTableV1,
  expectedRouteTableSha256:string,
  routeTableOrigin:HsmeStageRouteTableOriginVerifierV1,
  rawRoster:unknown,
  expectedRosterSha256:string,
  rosterOrigin:HsmeStagePrefetchAssetRosterOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeStageTransitionPrefetchPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageTransitionPrefetchScheduleV1>{
  if(!readyRouteTable(routeTable)){
    return blocked(['STAGE_PREFETCH_FROZEN_ROUTE_TABLE_REQUIRED']);
  }

  let routeTableSha:string;
  try{
    routeTableSha=await hsmeStageRouteTableV1Digest(routeTable,hash);
  }catch{
    return invalid(['STAGE_PREFETCH_ROUTE_TABLE_REHASH_INVALID']);
  }
  const common={routeTableEvidenceSha256:routeTableSha};
  if(
    !exactDigest(
      expectedRouteTableSha256,
      routeTableSha,
      routeTable.routeTableEvidenceSha256 as string,
    )
  ){
    return invalid(['STAGE_PREFETCH_ROUTE_TABLE_REHASH_MISMATCH'],common);
  }
  if(!await verify(
    ()=>routeTableOrigin.verifyStageRouteTable(routeTable,routeTableSha),
  )){
    return invalid(['STAGE_PREFETCH_ROUTE_TABLE_ORIGIN_UNVERIFIED'],common);
  }

  let roster:HsmeStagePrefetchAssetRosterV1;
  let rosterSha:string;
  try{
    roster=normalizeHsmeStagePrefetchAssetRosterV1(rawRoster);
    rosterSha=await hsmeStagePrefetchAssetRosterV1Digest(roster,hash);
  }catch{
    return invalid(['STAGE_PREFETCH_ASSET_ROSTER_INVALID'],common);
  }
  const withRoster={...common,assetRosterSha256:rosterSha};
  if(!exactDigest(expectedRosterSha256,rosterSha,rosterSha)){
    return invalid(['STAGE_PREFETCH_ASSET_ROSTER_DIGEST_MISMATCH'],withRoster);
  }
  if(!await verify(
    ()=>rosterOrigin.verifyStagePrefetchAssetRoster(roster,rosterSha),
  )){
    return invalid(['STAGE_PREFETCH_ASSET_ROSTER_ORIGIN_UNVERIFIED'],withRoster);
  }
  if(
    roster.routeTableEvidenceSha256!==routeTableSha
    ||roster.prototypeSha256!==routeTable.prototypeSha256
    ||roster.routerContentSha256!==routeTable.routerContentSha256
    ||roster.runtimeRepresentationSha256!==routeTable.runtimeRepresentationSha256
    ||roster.hardwareClass!==routeTable.hardwareClass
  ){
    return invalid(['STAGE_PREFETCH_ASSET_ROSTER_BINDING_MISMATCH'],withRoster);
  }
  if(!assetRosterMatchesUsedExperts(routeTable,roster)){
    return invalid(['STAGE_PREFETCH_ASSET_ROSTER_EXACT_SET_REQUIRED'],withRoster);
  }

  let policy:HsmeStageTransitionPrefetchPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeStageTransitionPrefetchPolicyV1(rawPolicy);
    policySha=await hsmeStageTransitionPrefetchPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['STAGE_PREFETCH_POLICY_INVALID'],withRoster);
  }
  const bound={...withRoster,prefetchPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['STAGE_PREFETCH_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>policyOrigin.verifyStageTransitionPrefetchPolicy(policy,policySha),
  )){
    return invalid(['STAGE_PREFETCH_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    policy.routeTableEvidenceSha256!==routeTableSha
    ||policy.assetRosterSha256!==rosterSha
  ){
    return invalid(['STAGE_PREFETCH_POLICY_BINDING_MISMATCH'],bound);
  }

  const assetsById=new Map(
    roster.assets.map(asset=>[asset.expertId,asset] as const),
  );
  const routes=routeTable.routes;
  const transitions:HsmeStageTransitionPrefetchScheduleEntryV1[]=[];
  for(let index=0;index<TRANSITION_IDS.length;index+=1){
    const from=routes[index];
    const to=routes[index+1];
    const rule=policy.transitions[index];
    if(
      rule.transitionId!==TRANSITION_IDS[index]
      ||rule.fromStageId!==from.stageId
      ||rule.toStageId!==to.stageId
      ||rule.triggerProgressBps<=from.progressStartBps
      ||rule.triggerProgressBps>=from.progressEndBps
      ||rule.triggerProgressBps>=to.progressStartBps
    ){
      return invalid(['STAGE_PREFETCH_TRANSITION_BINDING_INVALID'],bound);
    }
    const current=new Set(
      from.activeExperts.map(value=>
        value.expertId+'\0'+value.expertContentSha256
      ),
    );
    const assets=to.activeExperts
      .filter(value=>!current.has(
        value.expertId+'\0'+value.expertContentSha256,
      ))
      .map(value=>{
        const asset=assetsById.get(value.expertId);
        if(
          !asset
          ||asset.expertContentSha256!==value.expertContentSha256
        ){
          fail(
            'hsme_stage_prefetch_asset_lookup',
            'target route asset missing from exact roster',
          );
        }
        return asset;
      })
      .sort((a,b)=>lexical(a.expertId,b.expertId));
    let prefetchBytes=0;
    for(const asset of assets){
      prefetchBytes=checkedAdd(prefetchBytes,asset.artifactBytes);
    }
    if(prefetchBytes>(routeTable.maxStageTransitionPrefetchBytes as number)){
      return invalid(['STAGE_PREFETCH_BYTE_BUDGET_EXCEEDED'],bound);
    }
    transitions.push(deepFreeze({
      transitionId:TRANSITION_IDS[index],
      fromStageId:from.stageId,
      fromStageKind:from.stageKind as 'GEOMETRY'|'APPEARANCE',
      toStageId:to.stageId,
      toStageKind:to.stageKind as 'APPEARANCE'|'DETAIL',
      triggerProgressBps:rule.triggerProgressBps,
      targetRouterContentSha256:to.routerContentSha256,
      targetDeterministicRouteSeedSha256:
        to.deterministicRouteSeedSha256,
      targetDeterministicRouteContractSha256:
        to.deterministicRouteContractSha256,
      assets:Object.freeze(assets),
      prefetchBytes,
      prefetchBudgetBytes:
        routeTable.maxStageTransitionPrefetchBytes as number,
      prefetchRequired:true,
      networkAllowed:false,
      deterministicOnly:true,
    }));
  }

  const payload={
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
    state:'STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    routeTableEvidenceSha256:routeTableSha,
    assetRosterSha256:rosterSha,
    prefetchPolicySha256:policySha,
    prototypeSha256:routeTable.prototypeSha256,
    routerContentSha256:routeTable.routerContentSha256,
    runtimeRepresentationSha256:routeTable.runtimeRepresentationSha256,
    hardwareClass:routeTable.hardwareClass,
    maxStageTransitionPrefetchBytes:
      routeTable.maxStageTransitionPrefetchBytes,
    transitions:Object.freeze(transitions),
    ...authorityBoundary(),
  };
  const scheduleEvidenceSha256=await digest(
    HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,scheduleEvidenceSha256});
}

export async function hsmeStageTransitionPrefetchScheduleV1Digest(
  value:HsmeStageTransitionPrefetchScheduleV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED'
    ||value.scheduleEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_stage_prefetch_schedule_digest_state',
      'only FROZEN_NOT_EXECUTED schedules are digestible',
    );
  }
  const {scheduleEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeAsset(raw:unknown,path:string):HsmeStagePrefetchAssetV1{
  const r=exactRecord(raw,[
    'expertId','expertContentSha256','artifactBytes',
    'immutableAssetEvidenceSha256',
  ],path);
  return deepFreeze({
    expertId:identifier(r.expertId,path+'.expertId',120),
    expertContentSha256:sha256(
      r.expertContentSha256,path+'.expertContentSha256',
    ),
    artifactBytes:safeInteger(
      r.artifactBytes,path+'.artifactBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    immutableAssetEvidenceSha256:sha256(
      r.immutableAssetEvidenceSha256,
      path+'.immutableAssetEvidenceSha256',
    ),
  });
}

function normalizePolicyTransition(
  raw:unknown,
  path:string,
):HsmeStageTransitionPrefetchPolicyEntryV1{
  const r=exactRecord(raw,[
    'transitionId','fromStageId','toStageId','triggerProgressBps',
    'prefetchRequired','networkAllowed','deterministicOnly',
  ],path);
  if(
    r.prefetchRequired!==true
    ||r.networkAllowed!==false
    ||r.deterministicOnly!==true
  ){
    fail(
      'hsme_stage_prefetch_policy_boundary',
      path+' prefetch/network/determinism boundary invalid',
    );
  }
  return deepFreeze({
    transitionId:enumValue(
      r.transitionId,TRANSITION_IDS,path+'.transitionId',
    ),
    fromStageId:identifier(r.fromStageId,path+'.fromStageId',120),
    toStageId:identifier(r.toStageId,path+'.toStageId',120),
    triggerProgressBps:safeInteger(
      r.triggerProgressBps,path+'.triggerProgressBps',1,9_999,
    ),
    prefetchRequired:true,
    networkAllowed:false,
    deterministicOnly:true,
  });
}

function assetRosterMatchesUsedExperts(
  routeTable:HsmeStageRouteTableV1,
  roster:HsmeStagePrefetchAssetRosterV1,
):boolean{
  const used=new Map<string,string>();
  for(const route of routeTable.routes){
    for(const expert of route.activeExperts){
      const existing=used.get(expert.expertId);
      if(existing!==undefined&&existing!==expert.expertContentSha256){
        return false;
      }
      used.set(expert.expertId,expert.expertContentSha256);
    }
  }
  if(roster.assets.length!==used.size){
    return false;
  }
  return roster.assets.every(
    asset=>used.get(asset.expertId)===asset.expertContentSha256,
  );
}

function readyRouteTable(value:HsmeStageRouteTableV1):boolean{
  return value.schemaVersion===HSME_STAGE_ROUTE_TABLE_V1_SCHEMA
    &&value.state==='STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.routeTableEvidenceSha256!=='UNKNOWN'
    &&value.prototypeSha256!=='UNKNOWN'
    &&value.routerContentSha256!=='UNKNOWN'
    &&value.runtimeRepresentationSha256!=='UNKNOWN'
    &&value.hardwareClass!=='UNKNOWN'
    &&typeof value.maxStageTransitionPrefetchBytes==='number'
    &&value.maxStageTransitionPrefetchBytes>=0
    &&value.routes.length===3
    &&value.stageRoutingExecutionAllowed===false
    &&value.routeSelectionAllowed===false
    &&value.routeMutationAllowed===false
    &&value.inferenceExecutionAllowed===false
    &&value.modelInstallAllowed===false
    &&value.modelFleetPromotionAllowed===false
    &&value.durableModelFleetPromotionAllowed===false
    &&value.productionAuthorityGranted===false
    &&value.providerAuthorityGranted===false
    &&value.billingAuthorityGranted===false
    &&value.projectArtifactMutationAllowed===false
    &&value.aeeExecutionAuthorityGranted===false;
}

type PartialOutput=Partial<Pick<
  HsmeStageTransitionPrefetchScheduleV1,
  'routeTableEvidenceSha256'|'assetRosterSha256'|'prefetchPolicySha256'
>>;

function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageTransitionPrefetchScheduleV1{
  return terminal(
    'STAGE_TRANSITION_PREFETCH_SCHEDULE_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageTransitionPrefetchScheduleV1{
  return terminal(
    'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID'
    |'STAGE_TRANSITION_PREFETCH_SCHEDULE_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeStageTransitionPrefetchScheduleV1{
  return deepFreeze({
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    routeTableEvidenceSha256:
      values.routeTableEvidenceSha256??'UNKNOWN',
    assetRosterSha256:values.assetRosterSha256??'UNKNOWN',
    prefetchPolicySha256:values.prefetchPolicySha256??'UNKNOWN',
    prototypeSha256:'UNKNOWN',
    routerContentSha256:'UNKNOWN',
    runtimeRepresentationSha256:'UNKNOWN',
    hardwareClass:'UNKNOWN',
    maxStageTransitionPrefetchBytes:'UNKNOWN',
    transitions:Object.freeze([]),
    scheduleEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    movementExecutionAllowed:false as const,
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
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_stage_prefetch_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function comparePolicyTransitions(
  a:HsmeStageTransitionPrefetchPolicyEntryV1,
  b:HsmeStageTransitionPrefetchPolicyEntryV1,
):number{
  return TRANSITION_IDS.indexOf(a.transitionId)
    -TRANSITION_IDS.indexOf(b.transitionId);
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_stage_prefetch_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_stage_prefetch_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_stage_prefetch_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_stage_prefetch_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_stage_prefetch_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_stage_prefetch_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_stage_prefetch_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_stage_prefetch_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_stage_prefetch_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

function checkedAdd(left:number,right:number):number{
  const value=left+right;
  if(!Number.isSafeInteger(value)||value<0){
    fail(
      'hsme_stage_prefetch_value',
      'prefetch byte sum overflowed safe integer range',
    );
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
    fail(
      'hsme_stage_prefetch_hash',
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
  throw new HsmeStageTransitionPrefetchScheduleV1Error(code,message);
}

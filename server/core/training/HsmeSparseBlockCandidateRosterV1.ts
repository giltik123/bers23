import {
  HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA,
  hsmeSelectiveSparseBlockPlanV1Digest,
  type HsmeDenseBlockProfileV1,
  type HsmeSelectiveSparseBlockPlanV1,
} from './HsmeSelectiveSparseBlockPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA =
  'BERS_HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1' as const;
export const HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_DIGEST_DOMAIN =
  'bers:hsme:sparse-block-candidate-manifest:v1\0' as const;
export const HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1_SCHEMA =
  'BERS_HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1' as const;
export const HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:selective-sparse-block-candidate-roster:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeSparseBlockInternalExpertV1=Readonly<{
  expertId:string;
  contentSha256:string;
  bytes:number;
}>;

export type HsmeSparseBlockCandidateManifestV1=Readonly<{
  schemaVersion:typeof HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA;
  sparseBlockPlanSha256:string;
  blockId:string;
  originalDenseBlockContentSha256:string;
  inputOutputContractSha256:string;
  conversionToolchainSha256:string;
  conversionReceiptSha256:string;
  sharedPathContentSha256:string;
  sharedPathBytes:number;
  routerContentSha256:string;
  routerConfigSha256:string;
  routerBytes:number;
  experts:readonly HsmeSparseBlockInternalExpertV1[];
  maxActiveExperts:number;
  sparseBlockPackageBytes:number;
  totalWeightsBytes:number;
  activeWeightsBytes:number;
  qualityPreservationContractSha256:string;
  deterministicReplayContractSha256:string;
  requiresSharedPath:true;
  containsFullDenseBlockCopy:false;
  standaloneExecutionAllowed:false;
  conversionExecutionAllowed:false;
  blockExecutionAllowed:false;
  selectionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export type HsmeSparseBlockCandidateManifestBindingV1=Readonly<{
  rawManifest:unknown;
  expectedManifestSha256:string;
}>;

export interface HsmeSparseBlockCandidatePlanOriginVerifierV1{
  verifySparseBlockPlan(
    plan:HsmeSelectiveSparseBlockPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSparseBlockCandidateManifestOriginVerifierV1{
  verifySparseBlockCandidateManifest(
    manifest:HsmeSparseBlockCandidateManifestV1,
    expectedManifestSha256:string,
  ):Promise<boolean>;
}

export type HsmeSparseBlockCandidateRosterEntryV1=Readonly<{
  manifestSha256:string;
  manifest:HsmeSparseBlockCandidateManifestV1;
}>;

export type HsmeSelectiveSparseBlockCandidateRosterV1=Readonly<{
  schemaVersion:typeof HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1_SCHEMA;
  state:
    |'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID'
    |'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_BLOCKED'
    |'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_READY_NOT_EXECUTED';
  blockers:readonly string[];
  sparseBlockPlanSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  candidates:readonly HsmeSparseBlockCandidateRosterEntryV1[];
  candidateCount:number;
  totalSparsePackageBytes:number;
  rosterEvidenceSha256:string|'UNKNOWN';
  conversionExecutionAllowed:false;
  blockExecutionAllowed:false;
  selectionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export class HsmeSparseBlockCandidateRosterV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSparseBlockCandidateRosterV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSparseBlockCandidateManifestV1(
  raw:unknown,
):HsmeSparseBlockCandidateManifestV1{
  const r=exactRecord(raw,[
    'schemaVersion','sparseBlockPlanSha256','blockId',
    'originalDenseBlockContentSha256','inputOutputContractSha256',
    'conversionToolchainSha256','conversionReceiptSha256',
    'sharedPathContentSha256','sharedPathBytes','routerContentSha256',
    'routerConfigSha256','routerBytes','experts','maxActiveExperts',
    'sparseBlockPackageBytes','totalWeightsBytes','activeWeightsBytes',
    'qualityPreservationContractSha256',
    'deterministicReplayContractSha256','requiresSharedPath',
    'containsFullDenseBlockCopy','standaloneExecutionAllowed',
    'conversionExecutionAllowed','blockExecutionAllowed','selectionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  ],'manifest');
  if(r.schemaVersion!==HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA){
    fail('hsme_sparse_candidate_manifest_schema','candidate manifest schema unsupported');
  }
  if(r.requiresSharedPath!==true){
    fail('hsme_sparse_candidate_shared_path','requiresSharedPath must be true');
  }
  if(r.containsFullDenseBlockCopy!==false){
    fail('hsme_sparse_candidate_dense_copy','containsFullDenseBlockCopy must be false');
  }
  if(r.standaloneExecutionAllowed!==false){
    fail('hsme_sparse_candidate_standalone','standaloneExecutionAllowed must be false');
  }
  assertNoAuthority(r,'manifest');

  if(!Array.isArray(r.experts)||r.experts.length<1||r.experts.length>4){
    fail('hsme_sparse_candidate_experts','expert count invalid');
  }
  const experts=r.experts.map((value,index)=>
    normalizeExpert(value,'manifest.experts['+index+']')
  ).sort((a,b)=>lexical(a.expertId,b.expertId));
  if(
    new Set(experts.map(v=>v.expertId)).size!==experts.length
    ||new Set(experts.map(v=>v.contentSha256)).size!==experts.length
  ){
    fail('hsme_sparse_candidate_experts','expert id/content identity must be unique');
  }

  const sharedPathBytes=safeInteger(
    r.sharedPathBytes,'manifest.sharedPathBytes',1,Number.MAX_SAFE_INTEGER,
  );
  const routerBytes=safeInteger(
    r.routerBytes,'manifest.routerBytes',1,Number.MAX_SAFE_INTEGER,
  );
  let expertBytes=0;
  for(const expert of experts){
    expertBytes=checkedAdd(expertBytes,expert.bytes,'manifest expert bytes');
  }
  const sparseBlockPackageBytes=safeInteger(
    r.sparseBlockPackageBytes,
    'manifest.sparseBlockPackageBytes',
    1,Number.MAX_SAFE_INTEGER,
  );
  if(
    checkedAdd(
      checkedAdd(sharedPathBytes,routerBytes,'manifest package bytes'),
      expertBytes,
      'manifest package bytes',
    )!==sparseBlockPackageBytes
  ){
    fail('hsme_sparse_candidate_package','package byte accounting mismatch');
  }
  const totalWeightsBytes=safeInteger(
    r.totalWeightsBytes,'manifest.totalWeightsBytes',1,sparseBlockPackageBytes,
  );
  const activeWeightsBytes=safeInteger(
    r.activeWeightsBytes,'manifest.activeWeightsBytes',1,totalWeightsBytes,
  );
  const maxActiveExperts=safeInteger(
    r.maxActiveExperts,'manifest.maxActiveExperts',1,experts.length,
  );

  return deepFreeze({
    schemaVersion:HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_V1_SCHEMA,
    sparseBlockPlanSha256:sha256(
      r.sparseBlockPlanSha256,'manifest.sparseBlockPlanSha256',
    ),
    blockId:identifier(r.blockId,'manifest.blockId',120),
    originalDenseBlockContentSha256:sha256(
      r.originalDenseBlockContentSha256,
      'manifest.originalDenseBlockContentSha256',
    ),
    inputOutputContractSha256:sha256(
      r.inputOutputContractSha256,
      'manifest.inputOutputContractSha256',
    ),
    conversionToolchainSha256:sha256(
      r.conversionToolchainSha256,'manifest.conversionToolchainSha256',
    ),
    conversionReceiptSha256:sha256(
      r.conversionReceiptSha256,'manifest.conversionReceiptSha256',
    ),
    sharedPathContentSha256:sha256(
      r.sharedPathContentSha256,'manifest.sharedPathContentSha256',
    ),
    sharedPathBytes,
    routerContentSha256:sha256(
      r.routerContentSha256,'manifest.routerContentSha256',
    ),
    routerConfigSha256:sha256(
      r.routerConfigSha256,'manifest.routerConfigSha256',
    ),
    routerBytes,
    experts:Object.freeze(experts),
    maxActiveExperts,
    sparseBlockPackageBytes,
    totalWeightsBytes,
    activeWeightsBytes,
    qualityPreservationContractSha256:sha256(
      r.qualityPreservationContractSha256,
      'manifest.qualityPreservationContractSha256',
    ),
    deterministicReplayContractSha256:sha256(
      r.deterministicReplayContractSha256,
      'manifest.deterministicReplayContractSha256',
    ),
    requiresSharedPath:true,
    containsFullDenseBlockCopy:false,
    standaloneExecutionAllowed:false,
    ...authorityBoundary(),
  });
}

export async function hsmeSparseBlockCandidateManifestV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPARSE_BLOCK_CANDIDATE_MANIFEST_DIGEST_DOMAIN,
    normalizeHsmeSparseBlockCandidateManifestV1(raw),
    hash,
  );
}

export async function freezeHsmeSelectiveSparseBlockCandidateRosterV1(
  plan:HsmeSelectiveSparseBlockPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeSparseBlockCandidatePlanOriginVerifierV1,
  bindings:readonly HsmeSparseBlockCandidateManifestBindingV1[],
  manifestOrigin:HsmeSparseBlockCandidateManifestOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSelectiveSparseBlockCandidateRosterV1>{
  if(
    plan.schemaVersion!==HSME_SELECTIVE_SPARSE_BLOCK_PLAN_V1_SCHEMA
    ||plan.state!=='SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['SPARSE_BLOCK_CANDIDATE_FROZEN_PLAN_REQUIRED']);
  }
  if(!validPlanBoundary(plan)){
    return invalid(['SPARSE_BLOCK_CANDIDATE_PLAN_BOUNDARY_INVALID']);
  }

  let planSha:string;
  try{
    planSha=await hsmeSelectiveSparseBlockPlanV1Digest(plan,hash);
  }catch{
    return invalid(['SPARSE_BLOCK_CANDIDATE_PLAN_REHASH_INVALID']);
  }
  const common=valuesFromPlan(plan,planSha);
  if(
    !HEX64.test(expectedPlanSha256)
    ||planSha!==expectedPlanSha256
    ||planSha!==plan.planEvidenceSha256
  ){
    return invalid(['SPARSE_BLOCK_CANDIDATE_PLAN_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifySparseBlockPlan(plan,planSha))){
    return invalid(['SPARSE_BLOCK_CANDIDATE_PLAN_ORIGIN_UNVERIFIED'],common);
  }

  if(!Array.isArray(bindings)||bindings.length!==plan.candidateProfiles.length){
    return invalid(['SPARSE_BLOCK_CANDIDATE_ROSTER_CARDINALITY_MISMATCH'],common);
  }

  const entries:HsmeSparseBlockCandidateRosterEntryV1[]=[];
  for(const binding of bindings){
    if(
      !binding||typeof binding!=='object'||Array.isArray(binding)
      ||Object.keys(binding).length!==2
      ||!Object.hasOwn(binding,'rawManifest')
      ||!Object.hasOwn(binding,'expectedManifestSha256')
    ){
      return invalid(['SPARSE_BLOCK_CANDIDATE_BINDING_INVALID'],common);
    }
    let manifest:HsmeSparseBlockCandidateManifestV1;
    let manifestSha:string;
    try{
      manifest=normalizeHsmeSparseBlockCandidateManifestV1(binding.rawManifest);
      manifestSha=await hsmeSparseBlockCandidateManifestV1Digest(manifest,hash);
    }catch{
      return invalid(['SPARSE_BLOCK_CANDIDATE_MANIFEST_INVALID'],common);
    }
    if(
      !HEX64.test(binding.expectedManifestSha256)
      ||manifestSha!==binding.expectedManifestSha256
    ){
      return invalid(['SPARSE_BLOCK_CANDIDATE_MANIFEST_DIGEST_MISMATCH'],common);
    }
    if(!await verify(
      ()=>manifestOrigin.verifySparseBlockCandidateManifest(manifest,manifestSha),
    )){
      return invalid(['SPARSE_BLOCK_CANDIDATE_MANIFEST_ORIGIN_UNVERIFIED'],common);
    }

    const profile=plan.candidateProfiles.find(v=>v.blockId===manifest.blockId);
    if(profile===undefined){
      return invalid(['SPARSE_BLOCK_CANDIDATE_BLOCK_OUTSIDE_FROZEN_ROSTER'],common);
    }
    const mismatch=validateManifestAgainstPlan(manifest,profile,plan,planSha);
    if(mismatch!==null){
      return invalid([mismatch],common);
    }
    entries.push(deepFreeze({manifestSha256:manifestSha,manifest}));
  }

  entries.sort((a,b)=>lexical(a.manifest.blockId,b.manifest.blockId));
  if(
    new Set(entries.map(v=>v.manifest.blockId)).size!==entries.length
    ||new Set(entries.map(v=>v.manifestSha256)).size!==entries.length
  ){
    return invalid(['SPARSE_BLOCK_CANDIDATE_ROSTER_DUPLICATE'],common);
  }
  const expectedIds=[...plan.candidateProfiles].map(v=>v.blockId).sort(lexical);
  const actualIds=entries.map(v=>v.manifest.blockId);
  if(JSON.stringify(expectedIds)!==JSON.stringify(actualIds)){
    return invalid(['SPARSE_BLOCK_CANDIDATE_ROSTER_COVERAGE_MISMATCH'],common);
  }

  let totalSparsePackageBytes=0;
  for(const entry of entries){
    totalSparsePackageBytes=checkedAdd(
      totalSparsePackageBytes,
      entry.manifest.sparseBlockPackageBytes,
      'candidate roster package bytes',
    );
  }

  const payload={
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1_SCHEMA,
    state:'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_READY_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    sparseBlockPlanSha256:planSha,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
    candidates:Object.freeze(entries),
    candidateCount:entries.length,
    totalSparsePackageBytes,
    ...authorityBoundary(),
  };
  const rosterEvidenceSha256=await digest(
    HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,rosterEvidenceSha256});
}

export async function hsmeSelectiveSparseBlockCandidateRosterV1Digest(
  roster:HsmeSelectiveSparseBlockCandidateRosterV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    roster.state!=='SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_READY_NOT_EXECUTED'
    ||roster.rosterEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_sparse_candidate_roster_digest_state','only READY_NOT_EXECUTED roster is digestible');
  }
  const {rosterEvidenceSha256:_ignored,...payload}=roster;
  return digest(
    HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function validateManifestAgainstPlan(
  manifest:HsmeSparseBlockCandidateManifestV1,
  profile:HsmeDenseBlockProfileV1,
  plan:HsmeSelectiveSparseBlockPlanV1,
  planSha:string,
):string|null{
  if(
    manifest.sparseBlockPlanSha256!==planSha
    ||manifest.originalDenseBlockContentSha256!==profile.denseBlockContentSha256
    ||manifest.inputOutputContractSha256!==profile.inputOutputContractSha256
    ||manifest.qualityPreservationContractSha256!==
      plan.qualityPreservationContractSha256
  ){
    return 'SPARSE_BLOCK_CANDIDATE_MANIFEST_BINDING_MISMATCH';
  }
  if(
    typeof plan.maxExpertsPerConvertedBlock!=='number'
    ||typeof plan.maxActiveExpertsPerBlock!=='number'
    ||typeof plan.maxRouterBytes!=='number'
    ||typeof plan.maxSparseBlockPackageBytes!=='number'
  ){
    return 'SPARSE_BLOCK_CANDIDATE_PLAN_BOUNDARY_INVALID';
  }
  if(
    manifest.experts.length>plan.maxExpertsPerConvertedBlock
    ||manifest.maxActiveExperts>plan.maxActiveExpertsPerBlock
    ||manifest.routerBytes>plan.maxRouterBytes
    ||manifest.sparseBlockPackageBytes>plan.maxSparseBlockPackageBytes
  ){
    return 'SPARSE_BLOCK_CANDIDATE_FROZEN_CAP_EXCEEDED';
  }
  return null;
}

function validPlanBoundary(
  plan:HsmeSelectiveSparseBlockPlanV1,
):boolean{
  return plan.blockers.length===0
    &&plan.denseBaselineContentSha256!=='UNKNOWN'
    &&plan.runtimeRepresentationSha256!=='UNKNOWN'
    &&plan.hardwareClass!=='UNKNOWN'
    &&plan.qualityPreservationContractSha256!=='UNKNOWN'
    &&typeof plan.maxExpertsPerConvertedBlock==='number'
    &&typeof plan.maxActiveExpertsPerBlock==='number'
    &&typeof plan.maxRouterBytes==='number'
    &&typeof plan.maxSparseBlockPackageBytes==='number'
    &&plan.conversionExecutionAllowed===false
    &&plan.blockExecutionAllowed===false
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
  HsmeSelectiveSparseBlockCandidateRosterV1,
  'sparseBlockPlanSha256'|'denseBaselineContentSha256'
  |'runtimeRepresentationSha256'|'hardwareClass'
>>;

function valuesFromPlan(
  plan:HsmeSelectiveSparseBlockPlanV1,
  planSha:string,
):PartialOutput{
  return {
    sparseBlockPlanSha256:planSha,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSelectiveSparseBlockCandidateRosterV1{
  return terminal(
    'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_BLOCKED',
    blockers,values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSelectiveSparseBlockCandidateRosterV1{
  return terminal(
    'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID',
    blockers,values,
  );
}

function terminal(
  state:
    |'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_INVALID'
    |'SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSelectiveSparseBlockCandidateRosterV1{
  return deepFreeze({
    schemaVersion:HSME_SELECTIVE_SPARSE_BLOCK_CANDIDATE_ROSTER_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    sparseBlockPlanSha256:values.sparseBlockPlanSha256??'UNKNOWN',
    denseBaselineContentSha256:values.denseBaselineContentSha256??'UNKNOWN',
    runtimeRepresentationSha256:values.runtimeRepresentationSha256??'UNKNOWN',
    hardwareClass:values.hardwareClass??'UNKNOWN',
    candidates:Object.freeze([]),
    candidateCount:0,
    totalSparsePackageBytes:0,
    rosterEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function normalizeExpert(
  raw:unknown,
  path:string,
):HsmeSparseBlockInternalExpertV1{
  const r=exactRecord(raw,['expertId','contentSha256','bytes'],path);
  return deepFreeze({
    expertId:identifier(r.expertId,path+'.expertId',120),
    contentSha256:sha256(r.contentSha256,path+'.contentSha256'),
    bytes:safeInteger(r.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
  });
}

function authorityBoundary(){
  return Object.freeze({
    conversionExecutionAllowed:false as const,
    blockExecutionAllowed:false as const,
    selectionAllowed:false as const,
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
      fail('hsme_sparse_candidate_authority',path+'.'+field+' must remain false');
    }
  }
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_sparse_candidate_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_sparse_candidate_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_sparse_candidate_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_sparse_candidate_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_sparse_candidate_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_sparse_candidate_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_sparse_candidate_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_sparse_candidate_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function checkedAdd(
  left:number,right:number,path:string,
):number{
  const value=left+right;
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_sparse_candidate_value',path+' overflowed safe integer range');
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
    fail('hsme_sparse_candidate_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeSparseBlockCandidateRosterV1Error(code,message);
}

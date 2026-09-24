import {
  hsmeSelectiveSparseBlockPlanV1Digest,
  type HsmeSelectiveSparseBlockPlanV1,
} from './HsmeSelectiveSparseBlockPlanV1.ts';
import {
  hsmeSparseBlockExecutionMatrixV1Digest,
  type HsmeSparseBlockExecutionMatrixV1,
  type HsmeSparseBlockExecutionMeasurementV1,
} from './HsmeSparseBlockExecutionMatrixV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1' as const;
export const HSME_SPARSE_BLOCK_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:sparse-block-disposition-policy:v1\0' as const;
export const HSME_SPARSE_BLOCK_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_SPARSE_BLOCK_DISPOSITION_V1' as const;
export const HSME_SPARSE_BLOCK_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:sparse-block-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeSparseBlockDispositionPolicyV1=Readonly<{
  schemaVersion:typeof HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1_SCHEMA;
  sparseBlockPlanSha256:string;
  executionMatrixSha256:string;
  maxHardPreservationFailureCount:number;
  maxCriticalFailureCount:number;
  minWallClockImprovementBps:number;
  minBytesMovedImprovementBps:number;
  maxPeakMemoryRegressionBps:number;
  maxKernelDispatchRegressionBps:number;
  reviewState:'QUALITY_FIRST_DEVICE_EFFICIENCY_POLICY_REVIEWED';
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

export interface HsmeSparseBlockDispositionPlanOriginVerifierV1{
  verifySparseBlockPlan(
    plan:HsmeSelectiveSparseBlockPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeSparseBlockDispositionMatrixOriginVerifierV1{
  verifyExecutionMatrix(
    matrix:HsmeSparseBlockExecutionMatrixV1,
    expectedMatrixSha256:string,
  ):Promise<boolean>;
}
export interface HsmeSparseBlockDispositionPolicyOriginVerifierV1{
  verifyDispositionPolicy(
    policy:HsmeSparseBlockDispositionPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeSparseBlockPerBlockDispositionV1=Readonly<{
  blockId:string;
  disposition:'ADVANCE'|'REDESIGN'|'REJECT';
  hardRejected:boolean;
  qualityEligible:boolean;
  efficiencyEligible:boolean;
  reasons:readonly string[];
  denseWallClockUs:number;
  sparseWallClockUs:number;
  denseTotalBytesMoved:number;
  sparseTotalBytesMoved:number;
  densePeakMemoryBytes:number;
  sparsePeakMemoryBytes:number;
  denseKernelDispatchCount:number;
  sparseKernelDispatchCount:number;
}>;

export type HsmeSparseBlockDispositionV1=Readonly<{
  schemaVersion:typeof HSME_SPARSE_BLOCK_DISPOSITION_V1_SCHEMA;
  state:
    |'SPARSE_BLOCK_DISPOSITION_INVALID'
    |'SPARSE_BLOCK_DISPOSITION_BLOCKED'
    |'SPARSE_BLOCK_DISPOSITION_READY';
  blockers:readonly string[];
  sparseBlockPlanSha256:string|'UNKNOWN';
  executionMatrixSha256:string|'UNKNOWN';
  dispositionPolicySha256:string|'UNKNOWN';
  blockDispositions:readonly HsmeSparseBlockPerBlockDispositionV1[];
  advancedBlockIds:readonly string[];
  redesignedBlockIds:readonly string[];
  rejectedBlockIds:readonly string[];
  dispositionEvidenceSha256:string|'UNKNOWN';
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

export class HsmeSparseBlockDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSparseBlockDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSparseBlockDispositionPolicyV1(
  raw:unknown,
):HsmeSparseBlockDispositionPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','sparseBlockPlanSha256','executionMatrixSha256',
    'maxHardPreservationFailureCount','maxCriticalFailureCount',
    'minWallClockImprovementBps','minBytesMovedImprovementBps',
    'maxPeakMemoryRegressionBps','maxKernelDispatchRegressionBps',
    'reviewState','blockExecutionAllowed','selectionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  ],'policy');
  if(r.schemaVersion!==HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1_SCHEMA){
    fail('hsme_sparse_disposition_policy_schema','policy schema unsupported');
  }
  if(r.reviewState!=='QUALITY_FIRST_DEVICE_EFFICIENCY_POLICY_REVIEWED'){
    fail('hsme_sparse_disposition_policy_review','policy review state invalid');
  }
  assertNoAuthority(r,'policy');
  return deepFreeze({
    schemaVersion:HSME_SPARSE_BLOCK_DISPOSITION_POLICY_V1_SCHEMA,
    sparseBlockPlanSha256:sha256(
      r.sparseBlockPlanSha256,'policy.sparseBlockPlanSha256',
    ),
    executionMatrixSha256:sha256(
      r.executionMatrixSha256,'policy.executionMatrixSha256',
    ),
    maxHardPreservationFailureCount:safeInteger(
      r.maxHardPreservationFailureCount,
      'policy.maxHardPreservationFailureCount',
      0,Number.MAX_SAFE_INTEGER,
    ),
    maxCriticalFailureCount:safeInteger(
      r.maxCriticalFailureCount,
      'policy.maxCriticalFailureCount',
      0,Number.MAX_SAFE_INTEGER,
    ),
    minWallClockImprovementBps:safeInteger(
      r.minWallClockImprovementBps,
      'policy.minWallClockImprovementBps',0,10_000,
    ),
    minBytesMovedImprovementBps:safeInteger(
      r.minBytesMovedImprovementBps,
      'policy.minBytesMovedImprovementBps',0,10_000,
    ),
    maxPeakMemoryRegressionBps:safeInteger(
      r.maxPeakMemoryRegressionBps,
      'policy.maxPeakMemoryRegressionBps',0,10_000,
    ),
    maxKernelDispatchRegressionBps:safeInteger(
      r.maxKernelDispatchRegressionBps,
      'policy.maxKernelDispatchRegressionBps',0,10_000,
    ),
    reviewState:'QUALITY_FIRST_DEVICE_EFFICIENCY_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeSparseBlockDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPARSE_BLOCK_DISPOSITION_POLICY_DIGEST_DOMAIN,
    normalizeHsmeSparseBlockDispositionPolicyV1(raw),
    hash,
  );
}

export async function decideHsmeSparseBlockDispositionV1(
  plan:HsmeSelectiveSparseBlockPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeSparseBlockDispositionPlanOriginVerifierV1,
  matrix:HsmeSparseBlockExecutionMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmeSparseBlockDispositionMatrixOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeSparseBlockDispositionPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSparseBlockDispositionV1>{
  if(
    plan.state!=='SELECTIVE_SPARSE_BLOCK_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['SPARSE_BLOCK_DISPOSITION_FROZEN_PLAN_REQUIRED']);
  }
  if(
    matrix.state!=='SPARSE_BLOCK_EXECUTION_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['SPARSE_BLOCK_DISPOSITION_READY_MATRIX_REQUIRED']);
  }

  let planSha:string;
  let matrixSha:string;
  try{
    planSha=await hsmeSelectiveSparseBlockPlanV1Digest(plan,hash);
    matrixSha=await hsmeSparseBlockExecutionMatrixV1Digest(matrix,hash);
  }catch{
    return invalid(['SPARSE_BLOCK_DISPOSITION_INPUT_REHASH_INVALID']);
  }
  const common={
    sparseBlockPlanSha256:planSha,
    executionMatrixSha256:matrixSha,
  };
  if(
    !exactDigest(expectedPlanSha256,planSha,plan.planEvidenceSha256)
    ||!exactDigest(expectedMatrixSha256,matrixSha,matrix.matrixEvidenceSha256)
  ){
    return invalid(['SPARSE_BLOCK_DISPOSITION_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifySparseBlockPlan(plan,planSha))){
    return invalid(['SPARSE_BLOCK_DISPOSITION_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>matrixOrigin.verifyExecutionMatrix(matrix,matrixSha))){
    return invalid(['SPARSE_BLOCK_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'],common);
  }
  if(
    matrix.sparseBlockPlanSha256!==planSha
    ||matrix.rows.length!==plan.candidateProfiles.length*2
  ){
    return invalid(['SPARSE_BLOCK_DISPOSITION_MATRIX_BINDING_MISMATCH'],common);
  }

  let policy:HsmeSparseBlockDispositionPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeSparseBlockDispositionPolicyV1(rawPolicy);
    policySha=await hsmeSparseBlockDispositionPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['SPARSE_BLOCK_DISPOSITION_POLICY_INVALID'],common);
  }
  const bound={...common,dispositionPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['SPARSE_BLOCK_DISPOSITION_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>policyOrigin.verifyDispositionPolicy(policy,policySha),
  )){
    return invalid(['SPARSE_BLOCK_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    policy.sparseBlockPlanSha256!==planSha
    ||policy.executionMatrixSha256!==matrixSha
  ){
    return invalid(['SPARSE_BLOCK_DISPOSITION_POLICY_BINDING_MISMATCH'],bound);
  }

  const blockDispositions:HsmeSparseBlockPerBlockDispositionV1[]=[];
  for(const profile of [...plan.candidateProfiles].sort(
    (a,b)=>lexical(a.blockId,b.blockId),
  )){
    const dense=matrix.rows.filter(
      row=>row.blockId===profile.blockId&&row.variant==='DENSE_CONTROL',
    );
    const sparse=matrix.rows.filter(
      row=>row.blockId===profile.blockId&&row.variant==='SPARSE_CANDIDATE',
    );
    if(dense.length!==1||sparse.length!==1){
      return invalid(['SPARSE_BLOCK_DISPOSITION_ROW_CARDINALITY_INVALID'],bound);
    }
    blockDispositions.push(
      evaluateBlock(profile.blockId,dense[0],sparse[0],policy),
    );
  }

  const advancedBlockIds=blockDispositions
    .filter(value=>value.disposition==='ADVANCE')
    .map(value=>value.blockId);
  const redesignedBlockIds=blockDispositions
    .filter(value=>value.disposition==='REDESIGN')
    .map(value=>value.blockId);
  const rejectedBlockIds=blockDispositions
    .filter(value=>value.disposition==='REJECT')
    .map(value=>value.blockId);

  const payload={
    schemaVersion:HSME_SPARSE_BLOCK_DISPOSITION_V1_SCHEMA,
    state:'SPARSE_BLOCK_DISPOSITION_READY' as const,
    blockers:Object.freeze([] as string[]),
    sparseBlockPlanSha256:planSha,
    executionMatrixSha256:matrixSha,
    dispositionPolicySha256:policySha,
    blockDispositions:Object.freeze(blockDispositions),
    advancedBlockIds:Object.freeze(advancedBlockIds),
    redesignedBlockIds:Object.freeze(redesignedBlockIds),
    rejectedBlockIds:Object.freeze(rejectedBlockIds),
    ...authorityBoundary(),
  };
  const dispositionEvidenceSha256=await digest(
    HSME_SPARSE_BLOCK_DISPOSITION_DIGEST_DOMAIN,
    payload,hash,
  );
  return deepFreeze({...payload,dispositionEvidenceSha256});
}

export async function hsmeSparseBlockDispositionV1Digest(
  value:HsmeSparseBlockDispositionV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='SPARSE_BLOCK_DISPOSITION_READY'
    ||value.dispositionEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_sparse_disposition_digest_state','only READY disposition is digestible');
  }
  const {dispositionEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_SPARSE_BLOCK_DISPOSITION_DIGEST_DOMAIN,payload,hash);
}

function evaluateBlock(
  blockId:string,
  dense:HsmeSparseBlockExecutionMeasurementV1,
  sparse:HsmeSparseBlockExecutionMeasurementV1,
  policy:HsmeSparseBlockDispositionPolicyV1,
):HsmeSparseBlockPerBlockDispositionV1{
  const denseTotalBytesMoved=totalBytesMoved(dense);
  const sparseTotalBytesMoved=totalBytesMoved(sparse);
  const metrics={
    denseWallClockUs:dense.wallClockUs,
    sparseWallClockUs:sparse.wallClockUs,
    denseTotalBytesMoved,
    sparseTotalBytesMoved,
    densePeakMemoryBytes:dense.peakMemoryBytes,
    sparsePeakMemoryBytes:sparse.peakMemoryBytes,
    denseKernelDispatchCount:dense.kernelDispatchCount,
    sparseKernelDispatchCount:sparse.kernelDispatchCount,
  };

  if(
    !dense.qualityPreservationPass
    ||dense.hardPreservationFailureCount>
      policy.maxHardPreservationFailureCount
    ||dense.criticalFailureCount>policy.maxCriticalFailureCount
  ){
    return result(
      blockId,'REDESIGN',false,false,false,
      ['DENSE_CONTROL_QUALITY_GATE_FAILED'],metrics,
    );
  }

  const hardRejected=
    sparse.hardPreservationFailureCount>
      Math.min(
        policy.maxHardPreservationFailureCount,
        dense.hardPreservationFailureCount,
      )
    ||sparse.criticalFailureCount>
      Math.min(policy.maxCriticalFailureCount,dense.criticalFailureCount);
  if(hardRejected){
    return result(
      blockId,'REJECT',true,false,false,
      ['SPARSE_HARD_QUALITY_GATE_FAILED'],metrics,
    );
  }

  if(!sparse.qualityPreservationPass){
    return result(
      blockId,'REDESIGN',false,false,false,
      ['SPARSE_QUALITY_PRESERVATION_FAILED'],metrics,
    );
  }

  const reasons:string[]=[];
  const wall=lowerBetterBps(dense.wallClockUs,sparse.wallClockUs);
  if(wall.improvementBps<policy.minWallClockImprovementBps){
    reasons.push('WALL_CLOCK_IMPROVEMENT_INSUFFICIENT');
  }
  const bytes=lowerBetterBps(denseTotalBytesMoved,sparseTotalBytesMoved);
  if(bytes.improvementBps<policy.minBytesMovedImprovementBps){
    reasons.push('BYTES_MOVED_IMPROVEMENT_INSUFFICIENT');
  }
  const peak=lowerBetterBps(dense.peakMemoryBytes,sparse.peakMemoryBytes);
  if(peak.regressionBps>policy.maxPeakMemoryRegressionBps){
    reasons.push('PEAK_MEMORY_REGRESSION_EXCEEDED');
  }
  const dispatch=lowerBetterBps(
    dense.kernelDispatchCount,
    sparse.kernelDispatchCount,
  );
  if(dispatch.regressionBps>policy.maxKernelDispatchRegressionBps){
    reasons.push('KERNEL_DISPATCH_REGRESSION_EXCEEDED');
  }

  if(reasons.length>0){
    return result(
      blockId,'REDESIGN',false,true,false,reasons,metrics,
    );
  }
  return result(
    blockId,'ADVANCE',false,true,true,[],metrics,
  );
}

function result(
  blockId:string,
  disposition:'ADVANCE'|'REDESIGN'|'REJECT',
  hardRejected:boolean,
  qualityEligible:boolean,
  efficiencyEligible:boolean,
  reasons:readonly string[],
  metrics:Omit<
    HsmeSparseBlockPerBlockDispositionV1,
    'blockId'|'disposition'|'hardRejected'|'qualityEligible'
    |'efficiencyEligible'|'reasons'
  >,
):HsmeSparseBlockPerBlockDispositionV1{
  return deepFreeze({
    blockId,disposition,hardRejected,qualityEligible,efficiencyEligible,
    reasons:Object.freeze([...reasons].sort(lexical)),
    ...metrics,
  });
}

function totalBytesMoved(
  row:HsmeSparseBlockExecutionMeasurementV1,
):number{
  return checkedAdd(
    checkedAdd(
      row.flashBytesMoved,row.ramBytesMoved,'bytes moved',
    ),
    row.acceleratorBytesMoved,'bytes moved',
  );
}

function lowerBetterBps(
  baseline:number,
  candidate:number,
):Readonly<{improvementBps:number;regressionBps:number}>{
  if(baseline===0){
    return candidate===0
      ?Object.freeze({improvementBps:0,regressionBps:0})
      :Object.freeze({improvementBps:0,regressionBps:10_001});
  }
  if(candidate<baseline){
    return Object.freeze({
      improvementBps:Math.trunc(((baseline-candidate)*10_000)/baseline),
      regressionBps:0,
    });
  }
  if(candidate>baseline){
    return Object.freeze({
      improvementBps:0,
      regressionBps:Math.trunc(((candidate-baseline)*10_000)/baseline),
    });
  }
  return Object.freeze({improvementBps:0,regressionBps:0});
}

type PartialOutput=Partial<Pick<
  HsmeSparseBlockDispositionV1,
  'sparseBlockPlanSha256'|'executionMatrixSha256'|'dispositionPolicySha256'
>>;

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSparseBlockDispositionV1{
  return terminal('SPARSE_BLOCK_DISPOSITION_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSparseBlockDispositionV1{
  return terminal('SPARSE_BLOCK_DISPOSITION_INVALID',blockers,values);
}
function terminal(
  state:'SPARSE_BLOCK_DISPOSITION_INVALID'|'SPARSE_BLOCK_DISPOSITION_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSparseBlockDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_SPARSE_BLOCK_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    sparseBlockPlanSha256:values.sparseBlockPlanSha256??'UNKNOWN',
    executionMatrixSha256:values.executionMatrixSha256??'UNKNOWN',
    dispositionPolicySha256:values.dispositionPolicySha256??'UNKNOWN',
    blockDispositions:Object.freeze([]),
    advancedBlockIds:Object.freeze([]),
    redesignedBlockIds:Object.freeze([]),
    rejectedBlockIds:Object.freeze([]),
    dispositionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
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
      fail('hsme_sparse_disposition_authority',path+'.'+field+' must remain false');
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
    fail('hsme_sparse_disposition_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_sparse_disposition_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail('hsme_sparse_disposition_schema',path+' contains unknown or missing fields');
  }
  return r;
}
function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_sparse_disposition_value',path+' must be lowercase SHA-256');
  }
  return raw;
}
function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_sparse_disposition_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}
function checkedAdd(a:number,b:number,path:string):number{
  const value=a+b;
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_sparse_disposition_value',path+' overflowed safe integer range');
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
    fail('hsme_sparse_disposition_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeSparseBlockDispositionV1Error(code,message);
}

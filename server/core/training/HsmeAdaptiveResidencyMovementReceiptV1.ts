import {
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  type HsmeAdaptiveResidencyExperimentPlanV1,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  hsmeDeterministicResidencyScheduleV1Digest,
  type HsmeDeterministicResidencyScheduleV1,
} from './HsmeDeterministicResidencyScheduleV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1' as const;
export const CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:adaptive-residency-movement-result:v1\0' as const;
export const HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA =
  'BERS_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1' as const;
export const HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:adaptive-residency-movement-receipt:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeAdaptiveResidencyStageTelemetryV1=Readonly<{
  stageIndex:number;
  stageId:string;
  flashReadBytes:number;
  flashToRamBytes:number;
  ramToAcceleratorBytes:number;
  acceleratorToRamBytes:number;
  flashHitCount:number;
  ramHitCount:number;
  acceleratorHitCount:number;
  cacheMissCount:number;
  deterministicPrefetchBytes:number;
  usefulPrefetchBytes:number;
  wastedPrefetchBytes:number;
  evictionBytes:number;
  peakRamResidentBytes:number;
  peakAcceleratorResidentBytes:number;
  flashToRamTransferMs:number;
  ramToAcceleratorTransferMs:number;
  acceleratorToRamTransferMs:number;
  computeStallMsWaitingForWeights:number;
  networkBytesDuringExecution:0;
}>;

export type CoreHsmeAdaptiveResidencyMovementRequestV1=Readonly<{
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  prototypeSha256:string;
  stages:HsmeDeterministicResidencyScheduleV1['stages'];
  assetBytes:HsmeDeterministicResidencyScheduleV1['assetBytes'];
  maxRamBudgetBytes:number;
  maxAcceleratorBudgetBytes:number;
  maxDeterministicPrefetchBytesPerStage:number;
  maxConcurrentTransfers:number;
  networkDuringExecutionAllowed:false;
  inferenceExecutionAllowed:false;
}>;

export interface CoreHsmeAdaptiveResidencyMovementPortV1{
  executeExactResidencyMovements(
    request:CoreHsmeAdaptiveResidencyMovementRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmeAdaptiveResidencyMovementResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1_SCHEMA;
  state:'ADAPTIVE_RESIDENCY_MOVEMENT_COMPLETED_NO_INFERENCE';
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  prototypeSha256:string;
  executionAttemptId:string;
  stages:readonly HsmeAdaptiveResidencyStageTelemetryV1[];
  inferenceExecuted:false;
  networkBytesDuringExecution:0;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
  hostResultSha256:string;
}>;

export interface HsmeAdaptiveResidencyMovementPlanOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeAdaptiveResidencyMovementScheduleOriginVerifierV1{
  verifyDeterministicSchedule(
    schedule:HsmeDeterministicResidencyScheduleV1,
    expectedScheduleSha256:string,
  ):Promise<boolean>;
}
export interface CoreHsmeAdaptiveResidencyMovementResultOriginVerifierV1{
  verifyMovementResult(
    result:CoreHsmeAdaptiveResidencyMovementResultV1,
    expectedResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdaptiveResidencyMovementReceiptV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA;
  state:
    |'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID'
    |'ADAPTIVE_RESIDENCY_MOVEMENT_BLOCKED'
    |'ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED';
  blockers:readonly string[];
  residencyPlanSha256:string|'UNKNOWN';
  deterministicScheduleSha256:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  stages:readonly HsmeAdaptiveResidencyStageTelemetryV1[];
  totalFlashReadBytes:number|'UNKNOWN';
  totalFlashToRamBytes:number|'UNKNOWN';
  totalRamToAcceleratorBytes:number|'UNKNOWN';
  totalAcceleratorToRamBytes:number|'UNKNOWN';
  totalDeterministicPrefetchBytes:number|'UNKNOWN';
  totalUsefulPrefetchBytes:number|'UNKNOWN';
  totalWastedPrefetchBytes:number|'UNKNOWN';
  totalEvictionBytes:number|'UNKNOWN';
  peakRamResidentBytes:number|'UNKNOWN';
  peakAcceleratorResidentBytes:number|'UNKNOWN';
  totalComputeStallMsWaitingForWeights:number|'UNKNOWN';
  networkBytesDuringExecution:0;
  inferenceExecuted:false;
  hostResultSha256:string|'UNKNOWN';
  receiptEvidenceSha256:string|'UNKNOWN';
  furtherMovementExecutionAllowed:false;
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

export class HsmeAdaptiveResidencyMovementReceiptV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdaptiveResidencyMovementReceiptV1Error';
    this.code=code;
  }
}

export async function executeHsmeAdaptiveResidencyMovementsV1(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeAdaptiveResidencyMovementPlanOriginVerifierV1,
  schedule:HsmeDeterministicResidencyScheduleV1,
  expectedScheduleSha256:string,
  scheduleOrigin:HsmeAdaptiveResidencyMovementScheduleOriginVerifierV1,
  host:CoreHsmeAdaptiveResidencyMovementPortV1,
  resultOrigin:CoreHsmeAdaptiveResidencyMovementResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdaptiveResidencyMovementReceiptV1>{
  if(
    plan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
    ||schedule.state!=='DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED'
    ||schedule.scheduleEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTIVE_RESIDENCY_MOVEMENT_READY_INPUTS_REQUIRED']);
  }

  let planSha:string;
  let scheduleSha:string;
  try{
    planSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(plan,hash);
    scheduleSha=await hsmeDeterministicResidencyScheduleV1Digest(schedule,hash);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_INPUT_REHASH_INVALID']);
  }
  const common={
    residencyPlanSha256:planSha,
    deterministicScheduleSha256:scheduleSha,
    prototypeSha256:schedule.prototypeSha256,
  };
  if(
    !HEX64.test(expectedPlanSha256)
    ||planSha!==expectedPlanSha256
    ||planSha!==plan.planEvidenceSha256
    ||!HEX64.test(expectedScheduleSha256)
    ||scheduleSha!==expectedScheduleSha256
    ||scheduleSha!==schedule.scheduleEvidenceSha256
  ){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyResidencyPlan(plan,planSha))){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(
    ()=>scheduleOrigin.verifyDeterministicSchedule(schedule,scheduleSha),
  )){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_SCHEDULE_ORIGIN_UNVERIFIED'],common);
  }
  if(
    schedule.residencyPlanSha256!==planSha
    ||schedule.prototypeSha256!==plan.prototypeSha256
    ||typeof plan.maxRamBudgetBytes!=='number'
    ||typeof plan.maxAcceleratorBudgetBytes!=='number'
    ||typeof plan.maxDeterministicPrefetchBytesPerStage!=='number'
    ||typeof plan.maxConcurrentTransfers!=='number'
  ){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_INPUT_BINDING_MISMATCH'],common);
  }

  const request:CoreHsmeAdaptiveResidencyMovementRequestV1=deepFreeze({
    residencyPlanSha256:planSha,
    deterministicScheduleSha256:scheduleSha,
    prototypeSha256:schedule.prototypeSha256 as string,
    stages:schedule.stages,
    assetBytes:schedule.assetBytes,
    maxRamBudgetBytes:plan.maxRamBudgetBytes,
    maxAcceleratorBudgetBytes:plan.maxAcceleratorBudgetBytes,
    maxDeterministicPrefetchBytesPerStage:
      plan.maxDeterministicPrefetchBytesPerStage,
    maxConcurrentTransfers:plan.maxConcurrentTransfers,
    networkDuringExecutionAllowed:false,
    inferenceExecutionAllowed:false,
  });

  let rawResult:unknown;
  try{
    rawResult=await host.executeExactResidencyMovements(request);
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_HOST_FAILED'],common);
  }

  let result:CoreHsmeAdaptiveResidencyMovementResultV1;
  let hostResultSha256:string;
  try{
    result=normalizeCoreHsmeAdaptiveResidencyMovementResultV1(rawResult);
    hostResultSha256=await coreHsmeAdaptiveResidencyMovementResultV1Digest(
      result,hash,
    );
  }catch{
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_HOST_RESULT_INVALID'],common);
  }
  if(hostResultSha256!==result.hostResultSha256){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_HOST_RESULT_REHASH_MISMATCH'],{
      ...common,hostResultSha256,
    });
  }
  if(!await verify(()=>resultOrigin.verifyMovementResult(result,hostResultSha256))){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_HOST_RESULT_ORIGIN_UNVERIFIED'],{
      ...common,hostResultSha256,
    });
  }
  if(
    result.residencyPlanSha256!==planSha
    ||result.deterministicScheduleSha256!==scheduleSha
    ||result.prototypeSha256!==schedule.prototypeSha256
    ||result.stages.length!==schedule.stages.length
  ){
    return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_HOST_BINDING_MISMATCH'],{
      ...common,hostResultSha256,
    });
  }

  const stageRows:HsmeAdaptiveResidencyStageTelemetryV1[]=[];
  for(let index=0;index<result.stages.length;index+=1){
    const row=result.stages[index];
    const expectedStage=schedule.stages[index];
    if(
      row.stageIndex!==expectedStage.stageIndex
      ||row.stageId!==expectedStage.stageId
    ){
      return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_STAGE_BINDING_MISMATCH'],{
        ...common,hostResultSha256,
      });
    }
    const plannedPrefetchBytes=sumAssetBytes(
      expectedStage.deterministicPrefetchAssetIds,
      schedule.assetBytes,
    );
    if(
      row.deterministicPrefetchBytes>plannedPrefetchBytes
      ||row.deterministicPrefetchBytes>
        plan.maxDeterministicPrefetchBytesPerStage
    ){
      return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_PREFETCH_BYTES_EXCEEDED'],{
        ...common,hostResultSha256,
      });
    }
    if(
      checkedAdd(row.usefulPrefetchBytes,row.wastedPrefetchBytes)>
        row.deterministicPrefetchBytes
    ){
      return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_PREFETCH_ACCOUNTING_INVALID'],{
        ...common,hostResultSha256,
      });
    }
    if(
      row.peakRamResidentBytes>plan.maxRamBudgetBytes
      ||row.peakAcceleratorResidentBytes>plan.maxAcceleratorBudgetBytes
    ){
      return invalid(['ADAPTIVE_RESIDENCY_MOVEMENT_RESIDENCY_BUDGET_EXCEEDED'],{
        ...common,hostResultSha256,
      });
    }
    stageRows.push(row);
  }

  const totals={
    totalFlashReadBytes:sumField(stageRows,'flashReadBytes'),
    totalFlashToRamBytes:sumField(stageRows,'flashToRamBytes'),
    totalRamToAcceleratorBytes:sumField(stageRows,'ramToAcceleratorBytes'),
    totalAcceleratorToRamBytes:sumField(stageRows,'acceleratorToRamBytes'),
    totalDeterministicPrefetchBytes:
      sumField(stageRows,'deterministicPrefetchBytes'),
    totalUsefulPrefetchBytes:sumField(stageRows,'usefulPrefetchBytes'),
    totalWastedPrefetchBytes:sumField(stageRows,'wastedPrefetchBytes'),
    totalEvictionBytes:sumField(stageRows,'evictionBytes'),
    peakRamResidentBytes:Math.max(...stageRows.map(v=>v.peakRamResidentBytes)),
    peakAcceleratorResidentBytes:
      Math.max(...stageRows.map(v=>v.peakAcceleratorResidentBytes)),
    totalComputeStallMsWaitingForWeights:
      sumField(stageRows,'computeStallMsWaitingForWeights'),
  };

  const payload={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED' as const,
    blockers:Object.freeze([] as string[]),
    residencyPlanSha256:planSha,
    deterministicScheduleSha256:scheduleSha,
    prototypeSha256:schedule.prototypeSha256,
    executionAttemptId:result.executionAttemptId,
    stages:Object.freeze(stageRows),
    ...totals,
    networkBytesDuringExecution:0 as const,
    inferenceExecuted:false as const,
    hostResultSha256,
    ...authorityBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_DIGEST_DOMAIN,
    payload,hash,
  );
  return deepFreeze({...payload,receiptEvidenceSha256});
}

export function normalizeCoreHsmeAdaptiveResidencyMovementResultV1(
  raw:unknown,
):CoreHsmeAdaptiveResidencyMovementResultV1{
  const r=exactRecord(raw,[
    'schemaVersion','state','residencyPlanSha256',
    'deterministicScheduleSha256','prototypeSha256','executionAttemptId',
    'stages','inferenceExecuted','networkBytesDuringExecution',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed','hostResultSha256',
  ],'result');
  if(
    r.schemaVersion!==CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1_SCHEMA
    ||r.state!=='ADAPTIVE_RESIDENCY_MOVEMENT_COMPLETED_NO_INFERENCE'
    ||r.inferenceExecuted!==false
    ||r.networkBytesDuringExecution!==0
  ){
    fail('hsme_residency_movement_result_boundary','host result boundary invalid');
  }
  assertNoAuthority(r);
  if(!Array.isArray(r.stages)||r.stages.length<1||r.stages.length>128){
    fail('hsme_residency_movement_result_stages','host stage telemetry invalid');
  }
  const stages=r.stages.map((v,i)=>
    normalizeStageTelemetry(v,'result.stages['+i+']')
  );
  return deepFreeze({
    schemaVersion:CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_MOVEMENT_COMPLETED_NO_INFERENCE',
    residencyPlanSha256:sha256(r.residencyPlanSha256,'result.residencyPlanSha256'),
    deterministicScheduleSha256:sha256(
      r.deterministicScheduleSha256,'result.deterministicScheduleSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'result.prototypeSha256'),
    executionAttemptId:identifier(r.executionAttemptId,'result.executionAttemptId',160),
    stages:Object.freeze(stages),
    inferenceExecuted:false,
    networkBytesDuringExecution:0,
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(r.hostResultSha256,'result.hostResultSha256'),
  });
}

export async function coreHsmeAdaptiveResidencyMovementResultV1Digest(
  result:CoreHsmeAdaptiveResidencyMovementResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const normalized=normalizeCoreHsmeAdaptiveResidencyMovementResultV1(result);
  const {hostResultSha256:_ignored,...payload}=normalized;
  return digest(CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_DIGEST_DOMAIN,payload,hash);
}

export async function hsmeAdaptiveResidencyMovementReceiptV1Digest(
  receipt:HsmeAdaptiveResidencyMovementReceiptV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    receipt.state!=='ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED'
    ||receipt.receiptEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_residency_movement_receipt_digest_state','only READY_NOT_INFERRED receipt is digestible');
  }
  const {receiptEvidenceSha256:_ignored,...payload}=receipt;
  return digest(HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_DIGEST_DOMAIN,payload,hash);
}

function normalizeStageTelemetry(raw:unknown,path:string):HsmeAdaptiveResidencyStageTelemetryV1{
  const fields=[
    'stageIndex','stageId','flashReadBytes','flashToRamBytes',
    'ramToAcceleratorBytes','acceleratorToRamBytes','flashHitCount',
    'ramHitCount','acceleratorHitCount','cacheMissCount',
    'deterministicPrefetchBytes','usefulPrefetchBytes','wastedPrefetchBytes',
    'evictionBytes','peakRamResidentBytes','peakAcceleratorResidentBytes',
    'flashToRamTransferMs','ramToAcceleratorTransferMs',
    'acceleratorToRamTransferMs','computeStallMsWaitingForWeights',
    'networkBytesDuringExecution',
  ];
  const r=exactRecord(raw,fields,path);
  if(r.networkBytesDuringExecution!==0){
    fail('hsme_residency_movement_network','network bytes during execution must be zero');
  }
  const int=(name:string)=>safeInteger(r[name],path+'.'+name,0,Number.MAX_SAFE_INTEGER);
  return deepFreeze({
    stageIndex:int('stageIndex'),
    stageId:identifier(r.stageId,path+'.stageId',120),
    flashReadBytes:int('flashReadBytes'),
    flashToRamBytes:int('flashToRamBytes'),
    ramToAcceleratorBytes:int('ramToAcceleratorBytes'),
    acceleratorToRamBytes:int('acceleratorToRamBytes'),
    flashHitCount:int('flashHitCount'),
    ramHitCount:int('ramHitCount'),
    acceleratorHitCount:int('acceleratorHitCount'),
    cacheMissCount:int('cacheMissCount'),
    deterministicPrefetchBytes:int('deterministicPrefetchBytes'),
    usefulPrefetchBytes:int('usefulPrefetchBytes'),
    wastedPrefetchBytes:int('wastedPrefetchBytes'),
    evictionBytes:int('evictionBytes'),
    peakRamResidentBytes:int('peakRamResidentBytes'),
    peakAcceleratorResidentBytes:int('peakAcceleratorResidentBytes'),
    flashToRamTransferMs:int('flashToRamTransferMs'),
    ramToAcceleratorTransferMs:int('ramToAcceleratorTransferMs'),
    acceleratorToRamTransferMs:int('acceleratorToRamTransferMs'),
    computeStallMsWaitingForWeights:int('computeStallMsWaitingForWeights'),
    networkBytesDuringExecution:0,
  });
}

type PartialOutput=Partial<Pick<
  HsmeAdaptiveResidencyMovementReceiptV1,
  'residencyPlanSha256'|'deterministicScheduleSha256'|'prototypeSha256'
  |'executionAttemptId'|'hostResultSha256'
>>;
function invalid(blockers:readonly string[],values:PartialOutput={}){
  return terminal('ADAPTIVE_RESIDENCY_MOVEMENT_INVALID',blockers,values);
}
function blocked(blockers:readonly string[],values:PartialOutput={}){
  return terminal('ADAPTIVE_RESIDENCY_MOVEMENT_BLOCKED',blockers,values);
}
function terminal(
  state:'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID'|'ADAPTIVE_RESIDENCY_MOVEMENT_BLOCKED',
  blockers:readonly string[],values:PartialOutput,
):HsmeAdaptiveResidencyMovementReceiptV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort()),
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    deterministicScheduleSha256:values.deterministicScheduleSha256??'UNKNOWN',
    prototypeSha256:values.prototypeSha256??'UNKNOWN',
    executionAttemptId:values.executionAttemptId??'UNKNOWN',
    stages:Object.freeze([]),
    totalFlashReadBytes:'UNKNOWN',
    totalFlashToRamBytes:'UNKNOWN',
    totalRamToAcceleratorBytes:'UNKNOWN',
    totalAcceleratorToRamBytes:'UNKNOWN',
    totalDeterministicPrefetchBytes:'UNKNOWN',
    totalUsefulPrefetchBytes:'UNKNOWN',
    totalWastedPrefetchBytes:'UNKNOWN',
    totalEvictionBytes:'UNKNOWN',
    peakRamResidentBytes:'UNKNOWN',
    peakAcceleratorResidentBytes:'UNKNOWN',
    totalComputeStallMsWaitingForWeights:'UNKNOWN',
    networkBytesDuringExecution:0,
    inferenceExecuted:false,
    hostResultSha256:values.hostResultSha256??'UNKNOWN',
    receiptEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}
function authorityBoundary(){
  return Object.freeze({
    furtherMovementExecutionAllowed:false as const,
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
function hostAuthorityBoundary(){
  const {furtherMovementExecutionAllowed:_f,inferenceExecutionAllowed:_i,...rest}=authorityBoundary();
  return rest;
}
function assertNoAuthority(r:Record<string,unknown>):void{
  for(const key of Object.keys(hostAuthorityBoundary())){
    if(r[key]!==false) fail('hsme_residency_movement_authority','host result authority widening');
  }
}
function sumAssetBytes(ids:readonly string[],bytes:Readonly<Record<string,number>>):number{
  return ids.reduce((s,id)=>checkedAdd(s,bytes[id]??0),0);
}
type NumericTelemetryKey=
  |'flashReadBytes'|'flashToRamBytes'|'ramToAcceleratorBytes'
  |'acceleratorToRamBytes'|'deterministicPrefetchBytes'
  |'usefulPrefetchBytes'|'wastedPrefetchBytes'|'evictionBytes'
  |'computeStallMsWaitingForWeights';
function sumField(rows:readonly HsmeAdaptiveResidencyStageTelemetryV1[],key:NumericTelemetryKey):number{
  return rows.reduce((s,row)=>checkedAdd(s,row[key]),0);
}
function checkedAdd(a:number,b:number):number{
  const v=a+b;
  if(!Number.isSafeInteger(v)||v<0) fail('hsme_residency_movement_value','safe integer overflow');
  return v;
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) fail('hsme_residency_movement_schema',path+' must be object');
  const r=raw as Record<string,unknown>,keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_residency_movement_schema',path+' unknown or missing fields');
  }
  return r;
}
function identifier(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>max||!IDENTIFIER.test(raw)){
    fail('hsme_residency_movement_value',path+' invalid identifier');
  }
  return raw;
}
function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)) fail('hsme_residency_movement_value',path+' invalid SHA-256');
  return raw;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max) fail('hsme_residency_movement_value',path+' invalid integer');
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_residency_movement_hash','hash port invalid');
  return d;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{
  throw new HsmeAdaptiveResidencyMovementReceiptV1Error(code,message);
}

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

export const HSME_DOUBLE_BUFFER_CAMPAIGN_V1_SCHEMA =
  'BERS_HSME_DOUBLE_BUFFER_CAMPAIGN_V1' as const;
export const HSME_DOUBLE_BUFFER_CAMPAIGN_DIGEST_DOMAIN =
  'bers:hsme:double-buffer-campaign:v1\0' as const;
export const HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA =
  'BERS_HSME_DOUBLE_BUFFER_MEASUREMENT_V1' as const;
export const HSME_DOUBLE_BUFFER_MEASUREMENT_DIGEST_DOMAIN =
  'bers:hsme:double-buffer-measurement:v1\0' as const;
export const HSME_DOUBLE_BUFFER_COMPARISON_V1_SCHEMA =
  'BERS_HSME_DOUBLE_BUFFER_COMPARISON_V1' as const;
export const HSME_DOUBLE_BUFFER_COMPARISON_DIGEST_DOMAIN =
  'bers:hsme:double-buffer-comparison:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const MODES=Object.freeze(['SERIALIZED_CONTROL','DOUBLE_BUFFERED'] as const);
export type HsmeDoubleBufferModeV1=typeof MODES[number];

export type HsmeDoubleBufferCampaignV1=Readonly<{
  schemaVersion:typeof HSME_DOUBLE_BUFFER_CAMPAIGN_V1_SCHEMA;
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  fixtureTraceSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  maxConcurrentTransfers:number;
  sameInputs:true;
  sameStages:true;
  sameAssetIdentity:true;
  networkDuringExecutionAllowed:false;
  dispositionAllowed:false;
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

export type HsmeDoubleBufferMeasurementV1=Readonly<{
  schemaVersion:typeof HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA;
  campaignSha256:string;
  mode:HsmeDoubleBufferModeV1;
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  prototypeSha256:string;
  fixtureTraceSha256:string;
  runtimeRepresentationSha256:string;
  endToEndLatencyMs:number;
  transferMs:number;
  computeMs:number;
  observedTransferComputeOverlapMs:number;
  computeStallMsWaitingForWeights:number;
  flashReadBytes:number;
  flashToRamBytes:number;
  ramToAcceleratorBytes:number;
  acceleratorToRamBytes:number;
  peakRamResidentBytes:number;
  peakAcceleratorResidentBytes:number;
  bufferBytes:number;
  networkBytesDuringExecution:0;
  qualityEvidenceSha256:string;
  realMeasuredEvidence:true;
  inferenceAdmissionGranted:false;
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

export type HsmeDoubleBufferMeasurementBindingV1=Readonly<{
  rawMeasurement:unknown;
  expectedMeasurementSha256:string;
}>;

export interface HsmeDoubleBufferPlanOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeDoubleBufferScheduleOriginVerifierV1{
  verifySchedule(
    schedule:HsmeDeterministicResidencyScheduleV1,
    expectedScheduleSha256:string,
  ):Promise<boolean>;
}
export interface HsmeDoubleBufferCampaignOriginVerifierV1{
  verifyCampaign(
    campaign:HsmeDoubleBufferCampaignV1,
    expectedCampaignSha256:string,
  ):Promise<boolean>;
}
export interface HsmeDoubleBufferMeasurementOriginVerifierV1{
  verifyMeasurement(
    measurement:HsmeDoubleBufferMeasurementV1,
    expectedMeasurementSha256:string,
  ):Promise<boolean>;
}

export type HsmeDoubleBufferComparisonV1=Readonly<{
  schemaVersion:typeof HSME_DOUBLE_BUFFER_COMPARISON_V1_SCHEMA;
  state:
    |'DOUBLE_BUFFER_COMPARISON_INVALID'
    |'DOUBLE_BUFFER_COMPARISON_BLOCKED'
    |'DOUBLE_BUFFER_COMPARISON_READY_NOT_DISPOSED';
  blockers:readonly string[];
  residencyPlanSha256:string|'UNKNOWN';
  deterministicScheduleSha256:string|'UNKNOWN';
  campaignSha256:string|'UNKNOWN';
  rows:readonly HsmeDoubleBufferMeasurementV1[];
  serializedMeasurementSha256:string|'UNKNOWN';
  doubleBufferedMeasurementSha256:string|'UNKNOWN';
  endToEndLatencyDeltaMs:number|'UNKNOWN';
  computeStallDeltaMs:number|'UNKNOWN';
  measuredOverlapMs:number|'UNKNOWN';
  bufferBytes:number|'UNKNOWN';
  comparisonEvidenceSha256:string|'UNKNOWN';
  dispositionAllowed:false;
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

export class HsmeDoubleBufferComparisonV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDoubleBufferComparisonV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDoubleBufferCampaignV1(raw:unknown):HsmeDoubleBufferCampaignV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','deterministicScheduleSha256',
    'fixtureTraceSha256','runtimeRepresentationSha256','hardwareClass',
    'maxConcurrentTransfers','sameInputs','sameStages','sameAssetIdentity',
    'networkDuringExecutionAllowed','dispositionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'campaign');
  if(r.schemaVersion!==HSME_DOUBLE_BUFFER_CAMPAIGN_V1_SCHEMA){
    fail('hsme_double_buffer_campaign_schema','campaign schema unsupported');
  }
  if(
    r.sameInputs!==true||r.sameStages!==true||r.sameAssetIdentity!==true
    ||r.networkDuringExecutionAllowed!==false
  ){
    fail('hsme_double_buffer_campaign_boundary','campaign comparison boundary invalid');
  }
  assertNoAuthority(r,'campaign');
  return deepFreeze({
    schemaVersion:HSME_DOUBLE_BUFFER_CAMPAIGN_V1_SCHEMA,
    residencyPlanSha256:sha256(r.residencyPlanSha256,'campaign.residencyPlanSha256'),
    deterministicScheduleSha256:sha256(
      r.deterministicScheduleSha256,'campaign.deterministicScheduleSha256',
    ),
    fixtureTraceSha256:sha256(r.fixtureTraceSha256,'campaign.fixtureTraceSha256'),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,'campaign.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'campaign.hardwareClass',160),
    maxConcurrentTransfers:safeInteger(
      r.maxConcurrentTransfers,'campaign.maxConcurrentTransfers',1,16,
    ),
    sameInputs:true,sameStages:true,sameAssetIdentity:true,
    networkDuringExecutionAllowed:false,
    ...authorityBoundary(),
  });
}

export function normalizeHsmeDoubleBufferMeasurementV1(
  raw:unknown,
):HsmeDoubleBufferMeasurementV1{
  const r=exactRecord(raw,[
    'schemaVersion','campaignSha256','mode','residencyPlanSha256',
    'deterministicScheduleSha256','prototypeSha256','fixtureTraceSha256',
    'runtimeRepresentationSha256','endToEndLatencyMs','transferMs','computeMs',
    'observedTransferComputeOverlapMs','computeStallMsWaitingForWeights',
    'flashReadBytes','flashToRamBytes','ramToAcceleratorBytes',
    'acceleratorToRamBytes','peakRamResidentBytes',
    'peakAcceleratorResidentBytes','bufferBytes','networkBytesDuringExecution',
    'qualityEvidenceSha256','realMeasuredEvidence','inferenceAdmissionGranted',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'measurement');
  if(r.schemaVersion!==HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA){
    fail('hsme_double_buffer_measurement_schema','measurement schema unsupported');
  }
  if(
    r.realMeasuredEvidence!==true
    ||r.networkBytesDuringExecution!==0
    ||r.inferenceAdmissionGranted!==false
  ){
    fail('hsme_double_buffer_measurement_boundary','measurement boundary invalid');
  }
  assertMeasurementNoAuthority(r);
  const mode=enumValue(r.mode,MODES,'measurement.mode');
  const overlap=safeInteger(
    r.observedTransferComputeOverlapMs,
    'measurement.observedTransferComputeOverlapMs',0,Number.MAX_SAFE_INTEGER,
  );
  const transferMs=safeInteger(r.transferMs,'measurement.transferMs',0,Number.MAX_SAFE_INTEGER);
  const computeMs=safeInteger(r.computeMs,'measurement.computeMs',0,Number.MAX_SAFE_INTEGER);
  if(mode==='SERIALIZED_CONTROL'&&overlap!==0){
    fail('hsme_double_buffer_serialized_overlap','serialized control overlap must be zero');
  }
  if(mode==='DOUBLE_BUFFERED'&&overlap>Math.min(transferMs,computeMs)){
    fail('hsme_double_buffer_overlap_physics','observed overlap exceeds transfer/compute window');
  }
  return deepFreeze({
    schemaVersion:HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA,
    campaignSha256:sha256(r.campaignSha256,'measurement.campaignSha256'),
    mode,
    residencyPlanSha256:sha256(r.residencyPlanSha256,'measurement.residencyPlanSha256'),
    deterministicScheduleSha256:sha256(
      r.deterministicScheduleSha256,'measurement.deterministicScheduleSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'measurement.prototypeSha256'),
    fixtureTraceSha256:sha256(r.fixtureTraceSha256,'measurement.fixtureTraceSha256'),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,'measurement.runtimeRepresentationSha256',
    ),
    endToEndLatencyMs:safeInteger(
      r.endToEndLatencyMs,'measurement.endToEndLatencyMs',0,Number.MAX_SAFE_INTEGER,
    ),
    transferMs,computeMs,
    observedTransferComputeOverlapMs:overlap,
    computeStallMsWaitingForWeights:safeInteger(
      r.computeStallMsWaitingForWeights,
      'measurement.computeStallMsWaitingForWeights',0,Number.MAX_SAFE_INTEGER,
    ),
    flashReadBytes:safeInteger(r.flashReadBytes,'measurement.flashReadBytes',0,Number.MAX_SAFE_INTEGER),
    flashToRamBytes:safeInteger(r.flashToRamBytes,'measurement.flashToRamBytes',0,Number.MAX_SAFE_INTEGER),
    ramToAcceleratorBytes:safeInteger(
      r.ramToAcceleratorBytes,'measurement.ramToAcceleratorBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    acceleratorToRamBytes:safeInteger(
      r.acceleratorToRamBytes,'measurement.acceleratorToRamBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    peakRamResidentBytes:safeInteger(
      r.peakRamResidentBytes,'measurement.peakRamResidentBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    peakAcceleratorResidentBytes:safeInteger(
      r.peakAcceleratorResidentBytes,
      'measurement.peakAcceleratorResidentBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    bufferBytes:safeInteger(r.bufferBytes,'measurement.bufferBytes',0,Number.MAX_SAFE_INTEGER),
    networkBytesDuringExecution:0,
    qualityEvidenceSha256:sha256(
      r.qualityEvidenceSha256,'measurement.qualityEvidenceSha256',
    ),
    realMeasuredEvidence:true,
    inferenceAdmissionGranted:false,
    ...measurementAuthorityBoundary(),
  });
}

export async function hsmeDoubleBufferCampaignV1Digest(
  raw:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_DOUBLE_BUFFER_CAMPAIGN_DIGEST_DOMAIN,
    normalizeHsmeDoubleBufferCampaignV1(raw),hash,
  );
}
export async function hsmeDoubleBufferMeasurementV1Digest(
  raw:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_DOUBLE_BUFFER_MEASUREMENT_DIGEST_DOMAIN,
    normalizeHsmeDoubleBufferMeasurementV1(raw),hash,
  );
}

export async function buildHsmeDoubleBufferComparisonV1(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeDoubleBufferPlanOriginVerifierV1,
  schedule:HsmeDeterministicResidencyScheduleV1,
  expectedScheduleSha256:string,
  scheduleOrigin:HsmeDoubleBufferScheduleOriginVerifierV1,
  rawCampaign:unknown,
  expectedCampaignSha256:string,
  campaignOrigin:HsmeDoubleBufferCampaignOriginVerifierV1,
  bindings:readonly HsmeDoubleBufferMeasurementBindingV1[],
  measurementOrigin:HsmeDoubleBufferMeasurementOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeDoubleBufferComparisonV1>{
  if(
    plan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||schedule.state!=='DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED'
  ){
    return blocked(['DOUBLE_BUFFER_READY_PLAN_SCHEDULE_REQUIRED']);
  }
  let planSha:string,scheduleSha:string;
  try{
    planSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(plan,hash);
    scheduleSha=await hsmeDeterministicResidencyScheduleV1Digest(schedule,hash);
  }catch{return invalid(['DOUBLE_BUFFER_INPUT_REHASH_INVALID']);}
  const common={residencyPlanSha256:planSha,deterministicScheduleSha256:scheduleSha};
  if(
    !HEX64.test(expectedPlanSha256)||planSha!==expectedPlanSha256
    ||planSha!==plan.planEvidenceSha256
    ||!HEX64.test(expectedScheduleSha256)||scheduleSha!==expectedScheduleSha256
    ||scheduleSha!==schedule.scheduleEvidenceSha256
  ){
    return invalid(['DOUBLE_BUFFER_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyResidencyPlan(plan,planSha))){
    return invalid(['DOUBLE_BUFFER_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>scheduleOrigin.verifySchedule(schedule,scheduleSha))){
    return invalid(['DOUBLE_BUFFER_SCHEDULE_ORIGIN_UNVERIFIED'],common);
  }
  if(schedule.residencyPlanSha256!==planSha){
    return invalid(['DOUBLE_BUFFER_PLAN_SCHEDULE_BINDING_MISMATCH'],common);
  }

  let campaign:HsmeDoubleBufferCampaignV1,campaignSha:string;
  try{
    campaign=normalizeHsmeDoubleBufferCampaignV1(rawCampaign);
    campaignSha=await hsmeDoubleBufferCampaignV1Digest(campaign,hash);
  }catch{return invalid(['DOUBLE_BUFFER_CAMPAIGN_INVALID'],common);}
  if(
    !HEX64.test(expectedCampaignSha256)||campaignSha!==expectedCampaignSha256
    ||campaign.residencyPlanSha256!==planSha
    ||campaign.deterministicScheduleSha256!==scheduleSha
    ||campaign.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
  ){
    return invalid(['DOUBLE_BUFFER_CAMPAIGN_BINDING_MISMATCH'],{
      ...common,campaignSha256:campaignSha,
    });
  }
  if(!await verify(()=>campaignOrigin.verifyCampaign(campaign,campaignSha))){
    return invalid(['DOUBLE_BUFFER_CAMPAIGN_ORIGIN_UNVERIFIED'],{
      ...common,campaignSha256:campaignSha,
    });
  }
  if(
    plan.doubleBufferingAllowed!==true
    ||typeof plan.maxConcurrentTransfers!=='number'
    ||campaign.maxConcurrentTransfers>plan.maxConcurrentTransfers
  ){
    return invalid(['DOUBLE_BUFFER_CAMPAIGN_CAP_ESCALATION'],{
      ...common,campaignSha256:campaignSha,
    });
  }
  if(!Array.isArray(bindings)||bindings.length!==2){
    return invalid(['DOUBLE_BUFFER_EXACT_TWO_MEASUREMENTS_REQUIRED'],{
      ...common,campaignSha256:campaignSha,
    });
  }

  const rows:HsmeDoubleBufferMeasurementV1[]=[];
  const digests=new Map<HsmeDoubleBufferModeV1,string>();
  for(const binding of bindings){
    let row:HsmeDoubleBufferMeasurementV1,rowSha:string;
    try{
      row=normalizeHsmeDoubleBufferMeasurementV1(binding.rawMeasurement);
      rowSha=await hsmeDoubleBufferMeasurementV1Digest(row,hash);
    }catch{
      return invalid(['DOUBLE_BUFFER_MEASUREMENT_INVALID'],{
        ...common,campaignSha256:campaignSha,
      });
    }
    if(
      !HEX64.test(binding.expectedMeasurementSha256)
      ||rowSha!==binding.expectedMeasurementSha256
      ||!await verify(()=>measurementOrigin.verifyMeasurement(row,rowSha))
    ){
      return invalid(['DOUBLE_BUFFER_MEASUREMENT_ORIGIN_OR_DIGEST_INVALID'],{
        ...common,campaignSha256:campaignSha,
      });
    }
    if(
      row.campaignSha256!==campaignSha
      ||row.residencyPlanSha256!==planSha
      ||row.deterministicScheduleSha256!==scheduleSha
      ||row.prototypeSha256!==plan.prototypeSha256
      ||row.fixtureTraceSha256!==campaign.fixtureTraceSha256
      ||row.runtimeRepresentationSha256!==campaign.runtimeRepresentationSha256
    ){
      return invalid(['DOUBLE_BUFFER_MEASUREMENT_BINDING_MISMATCH'],{
        ...common,campaignSha256:campaignSha,
      });
    }
    if(
      typeof plan.maxRamBudgetBytes!=='number'
      ||typeof plan.maxAcceleratorBudgetBytes!=='number'
      ||row.peakRamResidentBytes>plan.maxRamBudgetBytes
      ||row.peakAcceleratorResidentBytes>plan.maxAcceleratorBudgetBytes
    ){
      return invalid(['DOUBLE_BUFFER_MEASUREMENT_BUDGET_EXCEEDED'],{
        ...common,campaignSha256:campaignSha,
      });
    }
    if(digests.has(row.mode)){
      return invalid(['DOUBLE_BUFFER_DUPLICATE_MODE'],{
        ...common,campaignSha256:campaignSha,
      });
    }
    digests.set(row.mode,rowSha);
    rows.push(row);
  }
  if(!digests.has('SERIALIZED_CONTROL')||!digests.has('DOUBLE_BUFFERED')){
    return invalid(['DOUBLE_BUFFER_MANDATORY_MODES_MISSING'],{
      ...common,campaignSha256:campaignSha,
    });
  }
  rows.sort((a,b)=>MODES.indexOf(a.mode)-MODES.indexOf(b.mode));
  const serialized=rows[0],buffered=rows[1];
  if(
    serialized.qualityEvidenceSha256!==buffered.qualityEvidenceSha256
    ||serialized.flashReadBytes!==buffered.flashReadBytes
    ||serialized.flashToRamBytes!==buffered.flashToRamBytes
    ||serialized.ramToAcceleratorBytes!==buffered.ramToAcceleratorBytes
    ||serialized.acceleratorToRamBytes!==buffered.acceleratorToRamBytes
  ){
    return invalid(['DOUBLE_BUFFER_CONTENT_OR_QUALITY_PARITY_MISMATCH'],{
      ...common,campaignSha256:campaignSha,
    });
  }

  const payload={
    schemaVersion:HSME_DOUBLE_BUFFER_COMPARISON_V1_SCHEMA,
    state:'DOUBLE_BUFFER_COMPARISON_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    ...common,
    campaignSha256,
    rows:Object.freeze(rows),
    serializedMeasurementSha256:digests.get('SERIALIZED_CONTROL') as string,
    doubleBufferedMeasurementSha256:digests.get('DOUBLE_BUFFERED') as string,
    endToEndLatencyDeltaMs:
      buffered.endToEndLatencyMs-serialized.endToEndLatencyMs,
    computeStallDeltaMs:
      buffered.computeStallMsWaitingForWeights-
      serialized.computeStallMsWaitingForWeights,
    measuredOverlapMs:buffered.observedTransferComputeOverlapMs,
    bufferBytes:buffered.bufferBytes,
    ...authorityBoundary(),
  };
  const comparisonEvidenceSha256=await digest(
    HSME_DOUBLE_BUFFER_COMPARISON_DIGEST_DOMAIN,payload,hash,
  );
  return deepFreeze({...payload,comparisonEvidenceSha256});
}

export async function hsmeDoubleBufferComparisonV1Digest(
  value:HsmeDoubleBufferComparisonV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='DOUBLE_BUFFER_COMPARISON_READY_NOT_DISPOSED'
    ||value.comparisonEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_double_buffer_digest_state','only READY_NOT_DISPOSED comparison is digestible');
  }
  const {comparisonEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_DOUBLE_BUFFER_COMPARISON_DIGEST_DOMAIN,payload,hash);
}

type PartialOutput=Partial<Pick<
  HsmeDoubleBufferComparisonV1,
  'residencyPlanSha256'|'deterministicScheduleSha256'|'campaignSha256'
>>;
function invalid(blockers:readonly string[],values:PartialOutput={}){
  return terminal('DOUBLE_BUFFER_COMPARISON_INVALID',blockers,values);
}
function blocked(blockers:readonly string[],values:PartialOutput={}){
  return terminal('DOUBLE_BUFFER_COMPARISON_BLOCKED',blockers,values);
}
function terminal(
  state:'DOUBLE_BUFFER_COMPARISON_INVALID'|'DOUBLE_BUFFER_COMPARISON_BLOCKED',
  blockers:readonly string[],values:PartialOutput,
):HsmeDoubleBufferComparisonV1{
  return deepFreeze({
    schemaVersion:HSME_DOUBLE_BUFFER_COMPARISON_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort()),
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    deterministicScheduleSha256:values.deterministicScheduleSha256??'UNKNOWN',
    campaignSha256:values.campaignSha256??'UNKNOWN',
    rows:Object.freeze([]),
    serializedMeasurementSha256:'UNKNOWN',
    doubleBufferedMeasurementSha256:'UNKNOWN',
    endToEndLatencyDeltaMs:'UNKNOWN',
    computeStallDeltaMs:'UNKNOWN',
    measuredOverlapMs:'UNKNOWN',
    bufferBytes:'UNKNOWN',
    comparisonEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}
function authorityBoundary(){
  return Object.freeze({
    dispositionAllowed:false as const,
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
function measurementAuthorityBoundary(){
  const {dispositionAllowed:_d,...rest}=authorityBoundary();
  return Object.freeze({inferenceAdmissionGranted:false as const,...rest});
}
function assertNoAuthority(r:Record<string,unknown>,path:string):void{
  for(const key of Object.keys(authorityBoundary())){
    if(r[key]!==false) fail('hsme_double_buffer_authority',path+'.'+key+' authority widening');
  }
}
function assertMeasurementNoAuthority(r:Record<string,unknown>):void{
  for(const key of Object.keys(measurementAuthorityBoundary())){
    if(r[key]!==false) fail('hsme_double_buffer_measurement_authority','measurement authority widening');
  }
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) fail('hsme_double_buffer_schema',path+' must be object');
  const r=raw as Record<string,unknown>,keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_double_buffer_schema',path+' unknown or missing fields');
  }
  return r;
}
function enumValue<T extends readonly string[]>(raw:unknown,values:T,path:string):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)) fail('hsme_double_buffer_value',path+' unsupported');
  return raw as T[number];
}
function identifier(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>max||!IDENTIFIER.test(raw)) fail('hsme_double_buffer_value',path+' invalid identifier');
  return raw;
}
function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)) fail('hsme_double_buffer_value',path+' invalid SHA-256');
  return raw;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max) fail('hsme_double_buffer_value',path+' invalid integer');
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_double_buffer_hash','hash port invalid');
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
  throw new HsmeDoubleBufferComparisonV1Error(code,message);
}

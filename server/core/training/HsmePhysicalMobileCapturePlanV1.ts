import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
  type HsmeHardwarePlacementMatrixV1,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA,
  hsmeRealMobileQualificationPolicyV1Digest,
  type HsmeRealMobileQualificationPolicyV1,
} from './HsmeRealMobileQualificationV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1_SCHEMA =
  'BERS_HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1' as const;
export const HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-capture-request:v1\0' as const;
export const HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA =
  'BERS_HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1' as const;
export const HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-capture-plan:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._+\-]*$/;
const MAX_CAPTURE_PLAN_AGE_MS=7*24*60*60*1000;

export const HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1=Object.freeze([
  'REPEATED_WARM_LATENCY',
  'PEAK_HOST_MEMORY',
  'PEAK_ACCELERATOR_MEMORY',
  'FLASH_BYTES_MOVED',
  'RAM_BYTES_MOVED',
  'ACCELERATOR_BYTES_MOVED',
  'MEASURED_ENERGY_MICROJOULES',
  'BATTERY_START_END',
  'THERMAL_START_PEAK_END',
  'THROTTLED_RUN_COUNT',
] as const);

export type HsmePhysicalMobileRequiredTelemetryV1=
  typeof HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1[number];

export type HsmePhysicalMobileCaptureRequestV1=Readonly<{
  schemaVersion:typeof HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1_SCHEMA;
  hardwarePlacementMatrixSha256:string;
  candidateId:string;
  requestedPlacement:'CPU'|'GPU'|'NPU';
  supportedDeviceClass:string;
  platformFamily:'APPLE'|'ANDROID';
  fleetModelId:string;
  fleetVersion:string;
  representationContentSha256:string;
  placementMeasurementEvidenceSha256:string;
  runtimeIdentity:string;
  repeatedRunCount:number;
  requiredTelemetry:readonly HsmePhysicalMobileRequiredTelemetryV1[];
  requireBatteryPower:true;
  networkBytesDuringExecution:0;
  requireFoundationPhysicalBundle:true;
  requireIndependentNativeTelemetryAttestation:true;
  reviewedAtMs:number;
  expiresAtMs:number;
  reviewState:'PHYSICAL_MOBILE_CAPTURE_REQUEST_REVIEWED';
  physicalCaptureExecutionAllowed:false;
  qualificationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmePhysicalMobileCaptureMatrixOriginVerifierV1{
  verifyHardwarePlacementMatrix(
    matrix:HsmeHardwarePlacementMatrixV1,
    expectedMatrixSha256:string,
  ):Promise<boolean>;
}

export interface HsmePhysicalMobileCapturePolicyOriginVerifierV1{
  verifyRealMobileQualificationPolicy(
    policy:HsmeRealMobileQualificationPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export interface HsmePhysicalMobileCaptureRequestOriginVerifierV1{
  verifyPhysicalMobileCaptureRequest(
    request:HsmePhysicalMobileCaptureRequestV1,
    expectedRequestSha256:string,
  ):Promise<boolean>;
}

export type HsmePhysicalMobileCapturePlanV1=Readonly<{
  schemaVersion:typeof HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA;
  state:
    |'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID'
    |'PHYSICAL_MOBILE_CAPTURE_PLAN_BLOCKED'
    |'PHYSICAL_MOBILE_CAPTURE_PLAN_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  hardwarePlacementMatrixSha256:string|'UNKNOWN';
  qualificationPolicySha256:string|'UNKNOWN';
  captureRequestSha256:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  requestedPlacement:'CPU'|'GPU'|'NPU'|'UNKNOWN';
  supportedDeviceClass:string|'UNKNOWN';
  platformFamily:'APPLE'|'ANDROID'|'UNKNOWN';
  fleetModelId:string|'UNKNOWN';
  fleetVersion:string|'UNKNOWN';
  representationContentSha256:string|'UNKNOWN';
  placementMeasurementEvidenceSha256:string|'UNKNOWN';
  runtimeIdentity:string|'UNKNOWN';
  repeatedRunCount:number|'UNKNOWN';
  requiredTelemetry:readonly HsmePhysicalMobileRequiredTelemetryV1[];
  requireBatteryPower:boolean;
  networkBytesDuringExecution:0|'UNKNOWN';
  requireFoundationPhysicalBundle:boolean;
  requireIndependentNativeTelemetryAttestation:boolean;
  reviewedAtMs:number|'UNKNOWN';
  expiresAtMs:number|'UNKNOWN';
  capturePlanEvidenceSha256:string|'UNKNOWN';
  physicalCaptureExecutionAllowed:false;
  qualificationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmePhysicalMobileCapturePlanV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmePhysicalMobileCapturePlanV1Error';
    this.code=code;
  }
}

export function normalizeHsmePhysicalMobileCaptureRequestV1(
  raw:unknown,
):HsmePhysicalMobileCaptureRequestV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'hardwarePlacementMatrixSha256',
    'candidateId',
    'requestedPlacement',
    'supportedDeviceClass',
    'platformFamily',
    'fleetModelId',
    'fleetVersion',
    'representationContentSha256',
    'placementMeasurementEvidenceSha256',
    'runtimeIdentity',
    'repeatedRunCount',
    'requiredTelemetry',
    'requireBatteryPower',
    'networkBytesDuringExecution',
    'requireFoundationPhysicalBundle',
    'requireIndependentNativeTelemetryAttestation',
    'reviewedAtMs',
    'expiresAtMs',
    'reviewState',
    'physicalCaptureExecutionAllowed',
    'qualificationAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'fashionGeometryAuthorityGranted',
    'artifactAuthorityGranted',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'request');

  if(r.schemaVersion!==HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1_SCHEMA){
    fail(
      'hsme_physical_mobile_capture_request_schema',
      'physical mobile capture request schema unsupported',
    );
  }
  if(r.reviewState!=='PHYSICAL_MOBILE_CAPTURE_REQUEST_REVIEWED'){
    fail(
      'hsme_physical_mobile_capture_request_review',
      'capture request review state invalid',
    );
  }
  if(
    r.requireBatteryPower!==true
    ||r.networkBytesDuringExecution!==0
    ||r.requireFoundationPhysicalBundle!==true
    ||r.requireIndependentNativeTelemetryAttestation!==true
  ){
    fail(
      'hsme_physical_mobile_capture_request_boundary',
      'capture request physical trust boundary invalid',
    );
  }
  assertNoAuthority(r,'request');

  const requiredTelemetry=enumSet(
    r.requiredTelemetry,
    HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1,
    'request.requiredTelemetry',
    HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1.length,
    HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1.length,
  ).sort((a,b)=>
    HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1.indexOf(a)
    -HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1.indexOf(b)
  );
  if(
    HSME_PHYSICAL_MOBILE_REQUIRED_TELEMETRY_V1.some(
      value=>!requiredTelemetry.includes(value),
    )
  ){
    fail(
      'hsme_physical_mobile_capture_request_telemetry',
      'all mandatory physical telemetry fields are required',
    );
  }

  const reviewedAtMs=safeInteger(
    r.reviewedAtMs,
    'request.reviewedAtMs',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const expiresAtMs=safeInteger(
    r.expiresAtMs,
    'request.expiresAtMs',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if(
    expiresAtMs<=reviewedAtMs
    ||expiresAtMs-reviewedAtMs>MAX_CAPTURE_PLAN_AGE_MS
  ){
    fail(
      'hsme_physical_mobile_capture_request_lifetime',
      'capture request lifetime invalid',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_V1_SCHEMA,
    hardwarePlacementMatrixSha256:sha256(
      r.hardwarePlacementMatrixSha256,
      'request.hardwarePlacementMatrixSha256',
    ),
    candidateId:identifier(
      r.candidateId,
      'request.candidateId',
      160,
    ),
    requestedPlacement:enumValue(
      r.requestedPlacement,
      ['CPU','GPU','NPU'] as const,
      'request.requestedPlacement',
    ),
    supportedDeviceClass:identifier(
      r.supportedDeviceClass,
      'request.supportedDeviceClass',
      160,
    ),
    platformFamily:enumValue(
      r.platformFamily,
      ['APPLE','ANDROID'] as const,
      'request.platformFamily',
    ),
    fleetModelId:identifier(
      r.fleetModelId,
      'request.fleetModelId',
      160,
    ),
    fleetVersion:version(
      r.fleetVersion,
      'request.fleetVersion',
      100,
    ),
    representationContentSha256:sha256(
      r.representationContentSha256,
      'request.representationContentSha256',
    ),
    placementMeasurementEvidenceSha256:sha256(
      r.placementMeasurementEvidenceSha256,
      'request.placementMeasurementEvidenceSha256',
    ),
    runtimeIdentity:identifier(
      r.runtimeIdentity,
      'request.runtimeIdentity',
      160,
    ),
    repeatedRunCount:safeInteger(
      r.repeatedRunCount,
      'request.repeatedRunCount',
      1,
      4096,
    ),
    requiredTelemetry:Object.freeze(requiredTelemetry),
    requireBatteryPower:true,
    networkBytesDuringExecution:0,
    requireFoundationPhysicalBundle:true,
    requireIndependentNativeTelemetryAttestation:true,
    reviewedAtMs,
    expiresAtMs,
    reviewState:'PHYSICAL_MOBILE_CAPTURE_REQUEST_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmePhysicalMobileCaptureRequestV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_PHYSICAL_MOBILE_CAPTURE_REQUEST_DIGEST_DOMAIN,
    normalizeHsmePhysicalMobileCaptureRequestV1(raw),
    hash,
  );
}

export async function freezeHsmePhysicalMobileCapturePlanV1(
  matrix:HsmeHardwarePlacementMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmePhysicalMobileCaptureMatrixOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmePhysicalMobileCapturePolicyOriginVerifierV1,
  rawRequest:unknown,
  expectedRequestSha256:string,
  requestOrigin:HsmePhysicalMobileCaptureRequestOriginVerifierV1,
  nowMs:number,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmePhysicalMobileCapturePlanV1>{
  if(
    matrix.schemaVersion!==HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA
    ||matrix.state!=='HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    return blocked([
      'PHYSICAL_MOBILE_CAPTURE_READY_MATRIX_REQUIRED',
    ]);
  }
  if(!Number.isSafeInteger(nowMs)||nowMs<0){
    return invalid(['PHYSICAL_MOBILE_CAPTURE_NOW_INVALID']);
  }

  let matrixSha256:string;
  try{
    matrixSha256=await hsmeHardwarePlacementMatrixV1Digest(
      matrix,
      hash,
    );
  }catch{
    return invalid(['PHYSICAL_MOBILE_CAPTURE_MATRIX_REHASH_INVALID']);
  }
  const common={hardwarePlacementMatrixSha256:matrixSha256};
  if(
    !exactDigest(
      expectedMatrixSha256,
      matrixSha256,
      matrix.matrixEvidenceSha256 as string,
    )
  ){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_MATRIX_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>matrixOrigin.verifyHardwarePlacementMatrix(
      matrix,
      matrixSha256,
    ),
  )){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_MATRIX_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let policy:HsmeRealMobileQualificationPolicyV1;
  let policySha256:string;
  try{
    if(
      (rawPolicy as {schemaVersion?:unknown})?.schemaVersion!==
        HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA
    ){
      throw new Error('schema mismatch');
    }
    policy=await normalizePolicy(rawPolicy);
    policySha256=await hsmeRealMobileQualificationPolicyV1Digest(
      policy,
      hash,
    );
  }catch{
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_QUALIFICATION_POLICY_INVALID'],
      common,
    );
  }
  const policyBound={
    ...common,
    qualificationPolicySha256:policySha256,
  };
  if(
    !exactDigest(
      expectedPolicySha256,
      policySha256,
      policySha256,
    )
  ){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_QUALIFICATION_POLICY_DIGEST_MISMATCH'],
      policyBound,
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifyRealMobileQualificationPolicy(
      policy,
      policySha256,
    ),
  )){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_QUALIFICATION_POLICY_ORIGIN_UNVERIFIED'],
      policyBound,
    );
  }
  if(policy.hardwarePlacementMatrixSha256!==matrixSha256){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_QUALIFICATION_POLICY_BINDING_MISMATCH'],
      policyBound,
    );
  }

  let request:HsmePhysicalMobileCaptureRequestV1;
  let requestSha256:string;
  try{
    request=normalizeHsmePhysicalMobileCaptureRequestV1(rawRequest);
    requestSha256=await hsmePhysicalMobileCaptureRequestV1Digest(
      request,
      hash,
    );
  }catch{
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_REQUEST_INVALID'],
      policyBound,
    );
  }
  const requestBound={
    ...policyBound,
    captureRequestSha256:requestSha256,
  };
  if(
    !exactDigest(
      expectedRequestSha256,
      requestSha256,
      requestSha256,
    )
  ){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_REQUEST_DIGEST_MISMATCH'],
      requestBound,
    );
  }
  if(!await verify(
    ()=>requestOrigin.verifyPhysicalMobileCaptureRequest(
      request,
      requestSha256,
    ),
  )){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_REQUEST_ORIGIN_UNVERIFIED'],
      requestBound,
    );
  }
  if(request.hardwarePlacementMatrixSha256!==matrixSha256){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_REQUEST_MATRIX_BINDING_MISMATCH'],
      requestBound,
    );
  }
  if(
    request.reviewedAtMs>nowMs
    ||request.expiresAtMs<nowMs
  ){
    return blocked(
      ['PHYSICAL_MOBILE_CAPTURE_REQUEST_NOT_CURRENT'],
      requestBound,
    );
  }
  if(request.repeatedRunCount<policy.minRepeatedRunCount){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_RUN_COUNT_BELOW_POLICY'],
      requestBound,
    );
  }

  const rows=matrix.rows.filter(
    value=>
      value.candidateId===request.candidateId
      &&value.requestedPlacement===request.requestedPlacement,
  );
  if(rows.length!==1){
    return invalid(
      [
        rows.length===0
          ?'PHYSICAL_MOBILE_CAPTURE_PLACEMENT_ROW_MISSING'
          :'PHYSICAL_MOBILE_CAPTURE_PLACEMENT_ROW_DUPLICATE',
      ],
      requestBound,
    );
  }
  const row=rows[0];
  if(
    row.supportedDeviceClass!==request.supportedDeviceClass
    ||row.platformFamily!==request.platformFamily
    ||row.fleetModelId!==request.fleetModelId
    ||row.fleetVersion!==request.fleetVersion
    ||row.representationContentSha256!==
      request.representationContentSha256
    ||row.measurementEvidenceSha256!==
      request.placementMeasurementEvidenceSha256
    ||row.runtimeIdentity!==request.runtimeIdentity
    ||row.actualPlacement!==request.requestedPlacement
    ||row.runtimeFallbackUsed
  ){
    return invalid(
      ['PHYSICAL_MOBILE_CAPTURE_REQUEST_ROW_BINDING_MISMATCH'],
      requestBound,
    );
  }

  const payload={
    schemaVersion:HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA,
    state:'PHYSICAL_MOBILE_CAPTURE_PLAN_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    hardwarePlacementMatrixSha256:matrixSha256,
    qualificationPolicySha256:policySha256,
    captureRequestSha256:requestSha256,
    candidateId:request.candidateId,
    requestedPlacement:request.requestedPlacement,
    supportedDeviceClass:request.supportedDeviceClass,
    platformFamily:request.platformFamily,
    fleetModelId:request.fleetModelId,
    fleetVersion:request.fleetVersion,
    representationContentSha256:request.representationContentSha256,
    placementMeasurementEvidenceSha256:
      request.placementMeasurementEvidenceSha256,
    runtimeIdentity:request.runtimeIdentity,
    repeatedRunCount:request.repeatedRunCount,
    requiredTelemetry:request.requiredTelemetry,
    requireBatteryPower:true,
    networkBytesDuringExecution:0 as const,
    requireFoundationPhysicalBundle:true,
    requireIndependentNativeTelemetryAttestation:true,
    reviewedAtMs:request.reviewedAtMs,
    expiresAtMs:request.expiresAtMs,
    ...authorityBoundary(),
  };
  const capturePlanEvidenceSha256=await digest(
    HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({
    ...payload,
    capturePlanEvidenceSha256,
  });
}

export async function hsmePhysicalMobileCapturePlanV1Digest(
  value:HsmePhysicalMobileCapturePlanV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='PHYSICAL_MOBILE_CAPTURE_PLAN_FROZEN_NOT_EXECUTED'
    ||value.capturePlanEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_physical_mobile_capture_plan_digest_state',
      'only FROZEN_NOT_EXECUTED capture plan is digestible',
    );
  }
  const {capturePlanEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

async function normalizePolicy(
  raw:unknown,
):Promise<HsmeRealMobileQualificationPolicyV1>{
  const module=await import('./HsmeRealMobileQualificationV1.ts');
  return module.normalizeHsmeRealMobileQualificationPolicyV1(raw);
}

type PartialOutput=Partial<Pick<
  HsmePhysicalMobileCapturePlanV1,
  'hardwarePlacementMatrixSha256'
  |'qualificationPolicySha256'
  |'captureRequestSha256'
>>;

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmePhysicalMobileCapturePlanV1{
  return terminal(
    'PHYSICAL_MOBILE_CAPTURE_PLAN_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmePhysicalMobileCapturePlanV1{
  return terminal(
    'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'PHYSICAL_MOBILE_CAPTURE_PLAN_INVALID'
    |'PHYSICAL_MOBILE_CAPTURE_PLAN_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmePhysicalMobileCapturePlanV1{
  return deepFreeze({
    schemaVersion:HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    hardwarePlacementMatrixSha256:
      values.hardwarePlacementMatrixSha256??'UNKNOWN',
    qualificationPolicySha256:
      values.qualificationPolicySha256??'UNKNOWN',
    captureRequestSha256:
      values.captureRequestSha256??'UNKNOWN',
    candidateId:'UNKNOWN',
    requestedPlacement:'UNKNOWN',
    supportedDeviceClass:'UNKNOWN',
    platformFamily:'UNKNOWN',
    fleetModelId:'UNKNOWN',
    fleetVersion:'UNKNOWN',
    representationContentSha256:'UNKNOWN',
    placementMeasurementEvidenceSha256:'UNKNOWN',
    runtimeIdentity:'UNKNOWN',
    repeatedRunCount:'UNKNOWN',
    requiredTelemetry:Object.freeze([]),
    requireBatteryPower:false,
    networkBytesDuringExecution:'UNKNOWN',
    requireFoundationPhysicalBundle:false,
    requireIndependentNativeTelemetryAttestation:false,
    reviewedAtMs:'UNKNOWN',
    expiresAtMs:'UNKNOWN',
    capturePlanEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    physicalCaptureExecutionAllowed:false as const,
    qualificationAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    artifactAuthorityGranted:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_physical_mobile_capture_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function enumSet<T extends readonly string[]>(
  raw:unknown,
  allowed:T,
  path:string,
  min:number,
  max:number,
):T[number][]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>
    enumValue(value,allowed,path+'['+index+']')
  );
  if(new Set(values).size!==values.length){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' contains duplicates',
    );
  }
  return values;
}

function exactDigest(
  expected:string,
  actual:string,
  embedded:string,
):boolean{
  return HEX64.test(expected)
    &&expected===actual
    &&actual===embedded;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail(
      'hsme_physical_mobile_capture_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_physical_mobile_capture_schema',
      path+' must be a plain object',
    );
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_physical_mobile_capture_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(
    typeof raw!=='string'
    ||!(values as readonly string[]).includes(raw)
  ){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' is unsupported',
    );
  }
  return raw as T[number];
}

function identifier(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function version(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!VERSION.test(value)){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' must be a version identifier',
    );
  }
  return value;
}

function sha256(
  raw:unknown,
  path:string,
):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(
  raw:unknown,
  path:string,
  max:number,
):string{
  if(typeof raw!=='string'){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' must be a string',
    );
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' is invalid',
    );
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(
    !Number.isSafeInteger(raw)
    ||(raw as number)<min
    ||(raw as number)>max
  ){
    fail(
      'hsme_physical_mobile_capture_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(
      domain+JSON.stringify(value),
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_physical_mobile_capture_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(
  run:()=>Promise<boolean>,
):Promise<boolean>{
  try{
    return await run()===true;
  }catch{
    return false;
  }
}

function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(
      value as Record<string,unknown>,
    )){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(
  code:string,
  message:string,
):never{
  throw new HsmePhysicalMobileCapturePlanV1Error(
    code,
    message,
  );
}

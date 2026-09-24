import {
  HSME_FOUNDATION_NATIVE_MOBILE_IDENTITY_DIGEST_DOMAIN,
} from './HsmeFoundationNativeMobileWorkingSetAdaptersV1';
import type {
  HsmeFoundationBenchmarkRunHashPortV1,
} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_V1' as const;
export const HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:native-mobile-energy-thermal-evidence:v1\0' as const;
export const HSME_NATIVE_MOBILE_ENERGY_THERMAL_METHOD_DIGEST_DOMAIN =
  'bers:hsme:native-mobile-energy-thermal-method:v1\0' as const;
export const HSME_NATIVE_MOBILE_BATTERY_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:native-mobile-battery-evidence:v1\0' as const;
export const HSME_NATIVE_MOBILE_THERMAL_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:native-mobile-thermal-evidence:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const MAX_TEXT=256;
const MAX_RUNS=4096;
const THERMAL_STATES=Object.freeze([
  'NORMAL',
  'ELEVATED',
  'HIGH',
  'CRITICAL',
] as const);
const RAW_KEYS=Object.freeze([
  'platform',
  'processIdentity',
  'sessionIdentity',
  'deviceRunSessionSha256',
  'deviceCapabilityKey',
  'supportedDeviceClass',
  'runtimeIdentitySha256',
  'actualPlacement',
  'nativeTelemetryAttestationSha256',
  'sourceApi',
  'sourceApiVersion',
  'bridgeVersion',
  'adapterBuildSha256',
  'osBuildSha256',
  'runtimeBuildSha256',
  'capturedAtMicrosStart',
  'capturedAtMicrosEnd',
  'warmLatencyUs',
  'peakHostMemoryBytes',
  'peakAcceleratorMemoryBytes',
  'flashBytesMoved',
  'ramBytesMoved',
  'acceleratorBytesMoved',
  'energyMicroJoulesTotal',
  'batteryStartBps',
  'batteryEndBps',
  'powerSource',
  'thermalStartState',
  'thermalPeakState',
  'thermalEndState',
  'throttledRunCount',
  'networkBytesDuringExecution',
  'energyMeasurementKind',
  'physicalOriginClaim',
].sort());

type ThermalState=typeof THERMAL_STATES[number];

export type HsmeNativeMobileEnergyThermalRawCaptureV1=Readonly<{
  platform:'ANDROID'|'IOS';
  processIdentity:string;
  sessionIdentity:string;
  deviceRunSessionSha256:string;
  deviceCapabilityKey:string;
  supportedDeviceClass:string;
  runtimeIdentitySha256:string;
  actualPlacement:'CPU'|'GPU'|'NPU';
  nativeTelemetryAttestationSha256:string;
  sourceApi:string;
  sourceApiVersion:string;
  bridgeVersion:string;
  adapterBuildSha256:string;
  osBuildSha256:string;
  runtimeBuildSha256:string;
  capturedAtMicrosStart:number;
  capturedAtMicrosEnd:number;
  warmLatencyUs:readonly number[];
  peakHostMemoryBytes:number;
  peakAcceleratorMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  energyMicroJoulesTotal:number;
  batteryStartBps:number;
  batteryEndBps:number;
  powerSource:'BATTERY';
  thermalStartState:ThermalState;
  thermalPeakState:ThermalState;
  thermalEndState:ThermalState;
  throttledRunCount:number;
  networkBytesDuringExecution:0;
  energyMeasurementKind:'MEASURED_TOTAL_MICROJOULES';
  physicalOriginClaim:'REAL_PHYSICAL_DEVICE';
}>;

export interface HsmeNativeMobileEnergyThermalBridgeV1{
  capture():Promise<HsmeNativeMobileEnergyThermalRawCaptureV1>;
}

export type HsmeNativeMobileEnergyThermalEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_V1_SCHEMA;
  platform:'ANDROID'|'IOS';
  processIdentitySha256:string;
  sessionIdentitySha256:string;
  deviceRunSessionSha256:string;
  deviceCapabilityKey:string;
  supportedDeviceClass:string;
  runtimeIdentitySha256:string;
  actualPlacement:'CPU'|'GPU'|'NPU';
  nativeTelemetryAttestationSha256:string;
  osBuildSha256:string;
  runtimeBuildSha256:string;
  capturedAtMicrosStart:number;
  capturedAtMicrosEnd:number;
  repeatedRunCount:number;
  repeatedWarmLatencyP50Us:number;
  repeatedWarmLatencyP95Us:number;
  peakHostMemoryBytes:number;
  peakAcceleratorMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  energyMicroJoulesTotal:number;
  energyMicroJoulesPerRun:number;
  energyAggregation:'CEIL_TOTAL_UJ_DIV_RUN_COUNT';
  batteryStartBps:number;
  batteryEndBps:number;
  powerSource:'BATTERY';
  thermalStartState:ThermalState;
  thermalPeakState:ThermalState;
  thermalEndState:ThermalState;
  throttledRunCount:number;
  networkBytesDuringExecution:0;
  sourceApi:string;
  sourceApiVersion:string;
  bridgeVersion:string;
  adapterBuildSha256:string;
  energyMeasurementKind:'MEASURED_TOTAL_MICROJOULES';
  physicalOriginClaim:'REAL_PHYSICAL_DEVICE';
  measurementMethodSha256:string;
  batteryMeasurementEvidenceSha256:string;
  thermalMeasurementEvidenceSha256:string;
  estimatedEnergyUsed:false;
  browserTelemetryUsed:false;
  simulatedDeviceUsed:false;
  manifestEstimateUsed:false;
  runtimeEstimateUsed:false;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeNativeMobileEnergyThermalEvidenceRecordV1=Readonly<{
  evidenceSha256:string;
  evidence:HsmeNativeMobileEnergyThermalEvidenceV1;
}>;

export class HsmeNativeMobileEnergyThermalEvidenceV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeNativeMobileEnergyThermalEvidenceV1Error';
    this.code=code;
  }
}

export async function captureHsmeNativeMobileEnergyThermalEvidenceV1(
  bridge:HsmeNativeMobileEnergyThermalBridgeV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeNativeMobileEnergyThermalEvidenceRecordV1>{
  const raw=await bridge.capture();
  validateRaw(raw);

  const processIdentitySha256=await identityDigest(
    'process',
    raw.processIdentity,
    hash,
  );
  const sessionIdentitySha256=await identityDigest(
    'session',
    raw.sessionIdentity,
    hash,
  );

  const sortedLatencies=[...raw.warmLatencyUs].sort((a,b)=>a-b);
  const repeatedRunCount=sortedLatencies.length;
  const repeatedWarmLatencyP50Us=percentileNearestRank(
    sortedLatencies,
    50,
  );
  const repeatedWarmLatencyP95Us=percentileNearestRank(
    sortedLatencies,
    95,
  );
  const energyMicroJoulesPerRun=Math.ceil(
    raw.energyMicroJoulesTotal/repeatedRunCount,
  );
  if(
    !Number.isSafeInteger(energyMicroJoulesPerRun)
    ||energyMicroJoulesPerRun<1
  ){
    fail(
      'hsme_native_mobile_energy_average',
      'derived energy per run is not a positive safe integer',
    );
  }

  const methodPayload={
    platform:raw.platform,
    sourceApi:boundedText(raw.sourceApi,'sourceApi'),
    sourceApiVersion:boundedText(
      raw.sourceApiVersion,
      'sourceApiVersion',
    ),
    bridgeVersion:boundedText(
      raw.bridgeVersion,
      'bridgeVersion',
    ),
    adapterBuildSha256:sha256(
      raw.adapterBuildSha256,
      'adapterBuildSha256',
    ),
    runtimeIdentitySha256:sha256(
      raw.runtimeIdentitySha256,
      'runtimeIdentitySha256',
    ),
    energyMeasurementKind:'MEASURED_TOTAL_MICROJOULES' as const,
    energyAggregation:'CEIL_TOTAL_UJ_DIV_RUN_COUNT' as const,
    latencyAggregation:'NEAREST_RANK_P50_P95' as const,
    physicalOriginClaim:'REAL_PHYSICAL_DEVICE' as const,
    estimatedEnergyUsed:false as const,
    browserTelemetryUsed:false as const,
    simulatedDeviceUsed:false as const,
    manifestEstimateUsed:false as const,
    runtimeEstimateUsed:false as const,
  };
  const measurementMethodSha256=await digest(
    HSME_NATIVE_MOBILE_ENERGY_THERMAL_METHOD_DIGEST_DOMAIN,
    methodPayload,
    hash,
  );

  const batteryPayload={
    platform:raw.platform,
    sessionIdentitySha256,
    deviceRunSessionSha256:raw.deviceRunSessionSha256,
    capturedAtMicrosStart:raw.capturedAtMicrosStart,
    capturedAtMicrosEnd:raw.capturedAtMicrosEnd,
    batteryStartBps:raw.batteryStartBps,
    batteryEndBps:raw.batteryEndBps,
    powerSource:'BATTERY' as const,
    energyMicroJoulesTotal:raw.energyMicroJoulesTotal,
    repeatedRunCount,
    energyMicroJoulesPerRun,
    measurementMethodSha256,
  };
  const batteryMeasurementEvidenceSha256=await digest(
    HSME_NATIVE_MOBILE_BATTERY_EVIDENCE_DIGEST_DOMAIN,
    batteryPayload,
    hash,
  );

  const thermalPayload={
    platform:raw.platform,
    sessionIdentitySha256,
    deviceRunSessionSha256:raw.deviceRunSessionSha256,
    capturedAtMicrosStart:raw.capturedAtMicrosStart,
    capturedAtMicrosEnd:raw.capturedAtMicrosEnd,
    thermalStartState:raw.thermalStartState,
    thermalPeakState:raw.thermalPeakState,
    thermalEndState:raw.thermalEndState,
    throttledRunCount:raw.throttledRunCount,
    repeatedRunCount,
    measurementMethodSha256,
  };
  const thermalMeasurementEvidenceSha256=await digest(
    HSME_NATIVE_MOBILE_THERMAL_EVIDENCE_DIGEST_DOMAIN,
    thermalPayload,
    hash,
  );

  const evidence:HsmeNativeMobileEnergyThermalEvidenceV1=deepFreeze({
    schemaVersion:HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_V1_SCHEMA,
    platform:raw.platform,
    processIdentitySha256,
    sessionIdentitySha256,
    deviceRunSessionSha256:raw.deviceRunSessionSha256,
    deviceCapabilityKey:raw.deviceCapabilityKey,
    supportedDeviceClass:raw.supportedDeviceClass,
    runtimeIdentitySha256:raw.runtimeIdentitySha256,
    actualPlacement:raw.actualPlacement,
    nativeTelemetryAttestationSha256:raw.nativeTelemetryAttestationSha256,
    osBuildSha256:raw.osBuildSha256,
    runtimeBuildSha256:raw.runtimeBuildSha256,
    capturedAtMicrosStart:raw.capturedAtMicrosStart,
    capturedAtMicrosEnd:raw.capturedAtMicrosEnd,
    repeatedRunCount,
    repeatedWarmLatencyP50Us,
    repeatedWarmLatencyP95Us,
    peakHostMemoryBytes:raw.peakHostMemoryBytes,
    peakAcceleratorMemoryBytes:raw.peakAcceleratorMemoryBytes,
    flashBytesMoved:raw.flashBytesMoved,
    ramBytesMoved:raw.ramBytesMoved,
    acceleratorBytesMoved:raw.acceleratorBytesMoved,
    energyMicroJoulesTotal:raw.energyMicroJoulesTotal,
    energyMicroJoulesPerRun,
    energyAggregation:'CEIL_TOTAL_UJ_DIV_RUN_COUNT',
    batteryStartBps:raw.batteryStartBps,
    batteryEndBps:raw.batteryEndBps,
    powerSource:'BATTERY',
    thermalStartState:raw.thermalStartState,
    thermalPeakState:raw.thermalPeakState,
    thermalEndState:raw.thermalEndState,
    throttledRunCount:raw.throttledRunCount,
    networkBytesDuringExecution:0,
    sourceApi:raw.sourceApi,
    sourceApiVersion:raw.sourceApiVersion,
    bridgeVersion:raw.bridgeVersion,
    adapterBuildSha256:raw.adapterBuildSha256,
    energyMeasurementKind:'MEASURED_TOTAL_MICROJOULES',
    physicalOriginClaim:'REAL_PHYSICAL_DEVICE',
    measurementMethodSha256,
    batteryMeasurementEvidenceSha256,
    thermalMeasurementEvidenceSha256,
    estimatedEnergyUsed:false,
    browserTelemetryUsed:false,
    simulatedDeviceUsed:false,
    manifestEstimateUsed:false,
    runtimeEstimateUsed:false,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
  const evidenceSha256=await digest(
    HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_DIGEST_DOMAIN,
    evidence,
    hash,
  );
  return deepFreeze({
    evidenceSha256,
    evidence,
  });
}

export async function hsmeNativeMobileEnergyThermalEvidenceV1Digest(
  evidence:HsmeNativeMobileEnergyThermalEvidenceV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  validateEvidence(evidence);
  return digest(
    HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_DIGEST_DOMAIN,
    evidence,
    hash,
  );
}

function validateRaw(
  raw:HsmeNativeMobileEnergyThermalRawCaptureV1,
):void{
  if(!exactObjectShape(raw,RAW_KEYS)){
    fail(
      'hsme_native_mobile_energy_schema',
      'raw native capture contains unknown or missing fields',
    );
  }
  if(
    raw.platform!=='ANDROID'
    &&raw.platform!=='IOS'
  ){
    fail(
      'hsme_native_mobile_energy_platform',
      'platform must be ANDROID or IOS',
    );
  }
  boundedText(raw.processIdentity,'processIdentity');
  boundedText(raw.sessionIdentity,'sessionIdentity');
  boundedText(raw.sourceApi,'sourceApi');
  boundedText(raw.sourceApiVersion,'sourceApiVersion');
  boundedText(raw.bridgeVersion,'bridgeVersion');
  sha256(raw.deviceRunSessionSha256,'deviceRunSessionSha256');
  sha256(raw.deviceCapabilityKey,'deviceCapabilityKey');
  boundedText(raw.supportedDeviceClass,'supportedDeviceClass');
  sha256(raw.runtimeIdentitySha256,'runtimeIdentitySha256');
  if(!['CPU','GPU','NPU'].includes(raw.actualPlacement)){
    fail(
      'hsme_native_mobile_energy_placement',
      'actualPlacement must be CPU GPU or NPU',
    );
  }
  sha256(raw.nativeTelemetryAttestationSha256,'nativeTelemetryAttestationSha256');
  sha256(raw.adapterBuildSha256,'adapterBuildSha256');
  sha256(raw.osBuildSha256,'osBuildSha256');
  sha256(raw.runtimeBuildSha256,'runtimeBuildSha256');
  if(
    !Number.isSafeInteger(raw.capturedAtMicrosStart)
    ||raw.capturedAtMicrosStart<0
    ||!Number.isSafeInteger(raw.capturedAtMicrosEnd)
    ||raw.capturedAtMicrosEnd<=raw.capturedAtMicrosStart
  ){
    fail(
      'hsme_native_mobile_energy_time',
      'capture timestamps must be safe and strictly increasing',
    );
  }
  if(
    !Array.isArray(raw.warmLatencyUs)
    ||raw.warmLatencyUs.length<2
    ||raw.warmLatencyUs.length>MAX_RUNS
  ){
    fail(
      'hsme_native_mobile_energy_runs',
      'warm latency sample count must be 2..4096',
    );
  }
  for(const [index,value] of raw.warmLatencyUs.entries()){
    safeInteger(
      value,
      'warmLatencyUs['+index+']',
      1,
      Number.MAX_SAFE_INTEGER,
    );
  }

  safeInteger(
    raw.peakHostMemoryBytes,
    'peakHostMemoryBytes',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    raw.peakAcceleratorMemoryBytes,
    'peakAcceleratorMemoryBytes',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    raw.flashBytesMoved,
    'flashBytesMoved',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    raw.ramBytesMoved,
    'ramBytesMoved',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    raw.acceleratorBytesMoved,
    'acceleratorBytesMoved',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    raw.energyMicroJoulesTotal,
    'energyMicroJoulesTotal',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  safeInteger(
    raw.batteryStartBps,
    'batteryStartBps',
    0,
    10_000,
  );
  safeInteger(
    raw.batteryEndBps,
    'batteryEndBps',
    0,
    10_000,
  );
  if(raw.batteryEndBps>raw.batteryStartBps){
    fail(
      'hsme_native_mobile_energy_battery',
      'battery cannot increase during BATTERY-only capture',
    );
  }
  if(raw.powerSource!=='BATTERY'){
    fail(
      'hsme_native_mobile_energy_power',
      'capture must run on battery power',
    );
  }
  thermal(raw.thermalStartState,'thermalStartState');
  thermal(raw.thermalPeakState,'thermalPeakState');
  thermal(raw.thermalEndState,'thermalEndState');
  safeInteger(
    raw.throttledRunCount,
    'throttledRunCount',
    0,
    raw.warmLatencyUs.length,
  );
  if(raw.networkBytesDuringExecution!==0){
    fail(
      'hsme_native_mobile_energy_network',
      'local physical capture must have zero model-network bytes',
    );
  }
  if(raw.energyMeasurementKind!=='MEASURED_TOTAL_MICROJOULES'){
    fail(
      'hsme_native_mobile_energy_source',
      'measured total microjoules source required',
    );
  }
  if(raw.physicalOriginClaim!=='REAL_PHYSICAL_DEVICE'){
    fail(
      'hsme_native_mobile_energy_origin',
      'real physical device origin claim required',
    );
  }
}

function validateEvidence(
  value:HsmeNativeMobileEnergyThermalEvidenceV1,
):void{
  if(
    value.schemaVersion!==
      HSME_NATIVE_MOBILE_ENERGY_THERMAL_EVIDENCE_V1_SCHEMA
    ||value.productionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false
    ||value.estimatedEnergyUsed!==false
    ||value.browserTelemetryUsed!==false
    ||value.simulatedDeviceUsed!==false
    ||value.manifestEstimateUsed!==false
    ||value.runtimeEstimateUsed!==false
  ){
    fail(
      'hsme_native_mobile_energy_evidence',
      'native energy/thermal evidence boundary invalid',
    );
  }
  sha256(value.processIdentitySha256,'processIdentitySha256');
  sha256(value.sessionIdentitySha256,'sessionIdentitySha256');
  sha256(value.deviceRunSessionSha256,'deviceRunSessionSha256');
  sha256(value.deviceCapabilityKey,'deviceCapabilityKey');
  boundedText(value.supportedDeviceClass,'supportedDeviceClass');
  sha256(value.runtimeIdentitySha256,'runtimeIdentitySha256');
  if(!['CPU','GPU','NPU'].includes(value.actualPlacement)){
    fail(
      'hsme_native_mobile_energy_placement',
      'evidence actualPlacement invalid',
    );
  }
  sha256(value.nativeTelemetryAttestationSha256,'nativeTelemetryAttestationSha256');
  sha256(value.osBuildSha256,'osBuildSha256');
  sha256(value.runtimeBuildSha256,'runtimeBuildSha256');
  sha256(value.measurementMethodSha256,'measurementMethodSha256');
  sha256(
    value.batteryMeasurementEvidenceSha256,
    'batteryMeasurementEvidenceSha256',
  );
  sha256(
    value.thermalMeasurementEvidenceSha256,
    'thermalMeasurementEvidenceSha256',
  );
}

function exactObjectShape(
  value:unknown,
  expected:readonly string[],
):boolean{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)return false;
  const keys=Object.keys(value as Record<string,unknown>).sort();
  return keys.length===expected.length
    &&keys.every((key,index)=>key===expected[index]);
}

function percentileNearestRank(
  sorted:readonly number[],
  percentile:number,
):number{
  const rank=Math.ceil((percentile/100)*sorted.length);
  return sorted[Math.max(0,rank-1)];
}

async function identityDigest(
  kind:'process'|'session',
  value:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(
      HSME_FOUNDATION_NATIVE_MOBILE_IDENTITY_DIGEST_DOMAIN
      +kind+'\0'+value,
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_native_mobile_energy_hash',
      'identity hash must be lowercase SHA-256',
    );
  }
  return result;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(
      domain+JSON.stringify(value),
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_native_mobile_energy_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

function thermal(value:unknown,path:string):ThermalState{
  if(
    typeof value!=='string'
    ||!(THERMAL_STATES as readonly string[]).includes(value)
  ){
    fail(
      'hsme_native_mobile_energy_thermal',
      path+' invalid',
    );
  }
  return value as ThermalState;
}

function boundedText(value:unknown,path:string):string{
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>MAX_TEXT
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail(
      'hsme_native_mobile_energy_text',
      path+' invalid',
    );
  }
  return value;
}

function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value)){
    fail(
      'hsme_native_mobile_energy_sha',
      path+' invalid',
    );
  }
  return value;
}

function safeInteger(
  value:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(
    !Number.isSafeInteger(value)
    ||(value as number)<min
    ||(value as number)>max
  ){
    fail(
      'hsme_native_mobile_energy_value',
      path+' must be a bounded safe integer',
    );
  }
  return value as number;
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

function fail(code:string,message:string):never{
  throw new HsmeNativeMobileEnergyThermalEvidenceV1Error(
    code,
    message,
  );
}

import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';
import type {HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1} from './HsmeFoundationTargetDeviceMeasuredCaptureV1';

export const HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_ADAPTER_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_ADAPTER_V1' as const;
export const HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_SOURCE_EVIDENCE_DOMAIN =
  'bers:hsme:native-mobile-working-set-source:v1\0' as const;

export const HSME_FOUNDATION_NATIVE_MOBILE_IDENTITY_DIGEST_DOMAIN =
  'bers:hsme:native-mobile-working-set-identity:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const PHASES=Object.freeze(['BASELINE','POST_LOAD','POST_COLD_INFERENCE','POST_WARM_INFERENCE'] as const);
const MAX_TEXT_LENGTH=256;

type Phase=typeof PHASES[number];
type UnavailableReason='PERMISSION_DENIED'|'SOURCE_UNAVAILABLE'|'UNSUPPORTED_METRIC';

type CommonMeasuredSample=Readonly<{
  status:'MEASURED';
  bytes:number;
  capturedAtMicros:number;
  processIdentity:string;
  sessionIdentity:string;
  sourceApi:string;
  sourceApiVersion:string;
  monotonicTimeDomain:string;
  bridgeVersion:string;
  adapterBuildSha256:string;
  runtimeIdentitySha256:string;
}>;

export type HsmeFoundationAndroidNativeWorkingSetSampleV1=
  | Readonly<CommonMeasuredSample&{
      platform:'ANDROID';
      metricKind:'PROCESS_RESIDENT_SET_RSS_BYTES';
    }>
  | Readonly<{
      status:'UNAVAILABLE';
      reason:UnavailableReason;
      detailCode?:string;
    }>;

export type HsmeFoundationIosNativeWorkingSetSampleV1=
  | Readonly<CommonMeasuredSample&{
      platform:'IOS';
      metricKind:'TASK_VM_INFO_PHYS_FOOTPRINT_BYTES';
    }>
  | Readonly<{
      status:'UNAVAILABLE';
      reason:UnavailableReason;
      detailCode?:string;
    }>;

export interface HsmeFoundationAndroidNativeWorkingSetBridgeV1{
  sample(phase:Phase,sequence:number):Promise<HsmeFoundationAndroidNativeWorkingSetSampleV1>;
}

export interface HsmeFoundationIosNativeWorkingSetBridgeV1{
  sample(phase:Phase,sequence:number):Promise<HsmeFoundationIosNativeWorkingSetSampleV1>;
}

export class HsmeFoundationNativeMobileWorkingSetAdapterV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationNativeMobileWorkingSetAdapterV1Error';
    this.code=code;
  }
}

export type HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_ADAPTER_V1_SCHEMA;
  platform:'ANDROID'|'IOS';
  metricKind:'PROCESS_RESIDENT_SET_RSS_BYTES'|'TASK_VM_INFO_PHYS_FOOTPRINT_BYTES';
  phase:Phase;
  sequence:number;
  capturedAtMicros:number;
  bytes:number;
  processIdentitySha256:string;
  sessionIdentitySha256:string;
  sourceApi:string;
  sourceApiVersion:string;
  monotonicTimeDomain:string;
  bridgeVersion:string;
  adapterBuildSha256:string;
  runtimeIdentitySha256:string;
  deviceCapacityUsed:false;
  browserHeapUsed:false;
  runtimeEstimateUsed:false;
  manifestResourceEstimateUsed:false;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationNativeMobileWorkingSetSourceEvidenceRecordV1=Readonly<{
  sourceEvidenceSha256:string;
  evidence:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1;
}>;

export type HsmeFoundationNativeMobileWorkingSetMeasurementAdapterV1=
  HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1&Readonly<{
    platform:'ANDROID'|'IOS';
    sourceEvidenceLedger():readonly HsmeFoundationNativeMobileWorkingSetSourceEvidenceRecordV1[];
  }>;

type AcceptedPlatform='ANDROID'|'IOS';
type AcceptedMetric='PROCESS_RESIDENT_SET_RSS_BYTES'|'TASK_VM_INFO_PHYS_FOOTPRINT_BYTES';

type PinnedIdentity=Readonly<{
  platform:AcceptedPlatform;
  metricKind:AcceptedMetric;
  processIdentity:string;
  sessionIdentity:string;
  sourceApi:string;
  sourceApiVersion:string;
  monotonicTimeDomain:string;
  bridgeVersion:string;
  adapterBuildSha256:string;
  runtimeIdentitySha256:string;
}>;

type NativeMeasuredSample=Extract<HsmeFoundationAndroidNativeWorkingSetSampleV1,{status:'MEASURED'}>
  | Extract<HsmeFoundationIosNativeWorkingSetSampleV1,{status:'MEASURED'}>;
type NativeBridge=Readonly<{
  sample(phase:Phase,sequence:number):Promise<
    HsmeFoundationAndroidNativeWorkingSetSampleV1|HsmeFoundationIosNativeWorkingSetSampleV1
  >;
}>;

export function createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1(
  bridge:HsmeFoundationAndroidNativeWorkingSetBridgeV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):HsmeFoundationNativeMobileWorkingSetMeasurementAdapterV1{
  return createAdapter('ANDROID','PROCESS_RESIDENT_SET_RSS_BYTES','NATIVE_PROCESS_WORKING_SET',bridge,hash);
}

export function createHsmeFoundationIosWorkingSetMeasurementAdapterV1(
  bridge:HsmeFoundationIosNativeWorkingSetBridgeV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):HsmeFoundationNativeMobileWorkingSetMeasurementAdapterV1{
  return createAdapter('IOS','TASK_VM_INFO_PHYS_FOOTPRINT_BYTES','NATIVE_UNIFIED_PROCESS_WORKING_SET',bridge,hash);
}

function createAdapter(
  expectedPlatform:AcceptedPlatform,
  expectedMetric:AcceptedMetric,
  sourceKind:'NATIVE_PROCESS_WORKING_SET'|'NATIVE_UNIFIED_PROCESS_WORKING_SET',
  bridge:NativeBridge,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):HsmeFoundationNativeMobileWorkingSetMeasurementAdapterV1{
  let pinned:PinnedIdentity|undefined;
  let lastCapturedAtMicros:number|undefined;
  const ledger:HsmeFoundationNativeMobileWorkingSetSourceEvidenceRecordV1[]=[];

  return Object.freeze({
    platform:expectedPlatform,
    memoryAccountingMode:'UNIFIED_PROCESS_WORKING_SET' as const,
    sourceKind,
    sourceEvidenceLedger(){
      return Object.freeze([...ledger]);
    },
    async sample(phase:Phase,sequence:number){
      validateRequest(phase,sequence,ledger.length);
      const raw=await bridge.sample(phase,sequence);
      if(raw.status==='UNAVAILABLE'){
        const detail=raw.detailCode?': '+boundedText(raw.detailCode,'detailCode'):'';
        fail('MEASUREMENT_UNAVAILABLE',raw.reason+detail);
      }

      const measured=raw as NativeMeasuredSample;
      validateMeasuredSample(measured,expectedPlatform,expectedMetric);
      const identity=identityOf(measured);

      if(pinned===undefined){
        pinned=identity;
      }else if(!sameIdentity(pinned,identity)){
        fail('hsme_native_mobile_identity_drift','native measurement identity drifted within one capture session');
      }

      if(lastCapturedAtMicros!==undefined&&measured.capturedAtMicros<=lastCapturedAtMicros){
        fail('hsme_native_mobile_timestamp_regression','native measurement timestamps must strictly increase');
      }
      lastCapturedAtMicros=measured.capturedAtMicros;

      const processIdentitySha256=await digestIdentity('process',measured.processIdentity,hash);
      const sessionIdentitySha256=await digestIdentity('session',measured.sessionIdentity,hash);
      const evidence:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1=Object.freeze({
        schemaVersion:HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_ADAPTER_V1_SCHEMA,
        platform:measured.platform,
        metricKind:measured.metricKind,
        phase,
        sequence,
        capturedAtMicros:measured.capturedAtMicros,
        bytes:measured.bytes,
        processIdentitySha256,
        sessionIdentitySha256,
        sourceApi:measured.sourceApi,
        sourceApiVersion:measured.sourceApiVersion,
        monotonicTimeDomain:measured.monotonicTimeDomain,
        bridgeVersion:measured.bridgeVersion,
        adapterBuildSha256:measured.adapterBuildSha256,
        runtimeIdentitySha256:measured.runtimeIdentitySha256,
        deviceCapacityUsed:false,
        browserHeapUsed:false,
        runtimeEstimateUsed:false,
        manifestResourceEstimateUsed:false,
        productionAuthorityGranted:false,
        winnerSelectionAllowed:false,
      });
      const sourceEvidenceSha256=await digest(evidence,hash);
      if(ledger.length>=32)fail('hsme_native_mobile_evidence_bound','native source-evidence ledger exceeds bounded capture size');
      ledger.push(Object.freeze({sourceEvidenceSha256,evidence}));

      return Object.freeze({
        capturedAtMicros:measured.capturedAtMicros,
        hostBytes:measured.bytes,
        acceleratorBytes:'UNAVAILABLE' as const,
        sourceEvidenceSha256,
      });
    },
  });
}

function validateRequest(phase:Phase,sequence:number,acceptedSampleCount:number):void{
  if(!PHASES.includes(phase))fail('hsme_native_mobile_phase','measurement phase invalid');
  if(!Number.isSafeInteger(sequence)||sequence<0)fail('hsme_native_mobile_sequence','measurement sequence invalid');
  if(sequence!==acceptedSampleCount){
    fail('hsme_native_mobile_sequence_drift','measurement sequence must be contiguous and start at zero');
  }
  const expectedPhase:Phase=
    sequence===0?'BASELINE'
      :sequence===1?'POST_LOAD'
        :sequence===2?'POST_COLD_INFERENCE'
          :'POST_WARM_INFERENCE';
  if(phase!==expectedPhase){
    fail('hsme_native_mobile_phase_sequence','measurement phase does not match canonical capture sequence');
  }
}

function validateMeasuredSample(
  sample:NativeMeasuredSample,
  expectedPlatform:AcceptedPlatform,
  expectedMetric:AcceptedMetric,
):void{
  if(sample.platform!==expectedPlatform)fail('hsme_native_mobile_platform','native bridge platform mismatch');
  if(sample.metricKind!==expectedMetric)fail('MEASUREMENT_UNAVAILABLE','native bridge metric is not accepted for this adapter');
  if(!Number.isSafeInteger(sample.bytes)||sample.bytes<1){
    fail('hsme_native_mobile_bytes','native working-set bytes must be a positive safe integer');
  }
  if(!Number.isSafeInteger(sample.capturedAtMicros)||sample.capturedAtMicros<0){
    fail('hsme_native_mobile_timestamp','native capture timestamp invalid');
  }
  boundedText(sample.processIdentity,'processIdentity');
  boundedText(sample.sessionIdentity,'sessionIdentity');
  boundedText(sample.sourceApi,'sourceApi');
  boundedText(sample.sourceApiVersion,'sourceApiVersion');
  boundedText(sample.monotonicTimeDomain,'monotonicTimeDomain');
  boundedText(sample.bridgeVersion,'bridgeVersion');
  sha256(sample.adapterBuildSha256,'adapterBuildSha256');
  sha256(sample.runtimeIdentitySha256,'runtimeIdentitySha256');
}

function identityOf(sample:NativeMeasuredSample):PinnedIdentity{
  return Object.freeze({
    platform:sample.platform,
    metricKind:sample.metricKind,
    processIdentity:sample.processIdentity,
    sessionIdentity:sample.sessionIdentity,
    sourceApi:sample.sourceApi,
    sourceApiVersion:sample.sourceApiVersion,
    monotonicTimeDomain:sample.monotonicTimeDomain,
    bridgeVersion:sample.bridgeVersion,
    adapterBuildSha256:sample.adapterBuildSha256,
    runtimeIdentitySha256:sample.runtimeIdentitySha256,
  });
}

function sameIdentity(a:PinnedIdentity,b:PinnedIdentity):boolean{
  return a.platform===b.platform
    && a.metricKind===b.metricKind
    && a.processIdentity===b.processIdentity
    && a.sessionIdentity===b.sessionIdentity
    && a.sourceApi===b.sourceApi
    && a.sourceApiVersion===b.sourceApiVersion
    && a.monotonicTimeDomain===b.monotonicTimeDomain
    && a.bridgeVersion===b.bridgeVersion
    && a.adapterBuildSha256===b.adapterBuildSha256
    && a.runtimeIdentitySha256===b.runtimeIdentitySha256;
}

async function digestIdentity(
  kind:'process'|'session',
  value:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const bytes=new TextEncoder().encode(
    HSME_FOUNDATION_NATIVE_MOBILE_IDENTITY_DIGEST_DOMAIN+kind+'\\0'+value,
  );
  const result=await hash.sha256(bytes);
  if(!HEX64.test(result))fail('hsme_native_mobile_hash','hash port must return lowercase SHA-256');
  return result;
}

async function digest(
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const bytes=new TextEncoder().encode(
    HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_SOURCE_EVIDENCE_DOMAIN+JSON.stringify(value),
  );
  const result=await hash.sha256(bytes);
  if(!HEX64.test(result))fail('hsme_native_mobile_hash','hash port must return lowercase SHA-256');
  return result;
}

function boundedText(value:unknown,path:string):string{
  if(typeof value!=='string'||value.length<1||value.length>MAX_TEXT_LENGTH||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_native_mobile_text',path+' invalid');
  }
  return value;
}

function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value))fail('hsme_native_mobile_sha',path+' invalid');
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeFoundationNativeMobileWorkingSetAdapterV1Error(code,message);
}

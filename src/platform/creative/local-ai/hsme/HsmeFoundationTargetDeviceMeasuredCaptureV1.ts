import {
  deviceCapabilityKeyForBenchmarkEvidenceV1,
  type BenchmarkEvidence,
} from '../benchmark/BenchmarkEvidence';
import type {
  DeviceCapabilitySnapshot,
  ExecutionProvider,
  InferenceRequest,
  InferenceResult,
  LocalModelBenchmark,
  ModelManifest,
  RuntimeKind,
} from '../types';
import {
  HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA,
  hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest,
  type HsmeFoundationTargetDeviceMeasurementAttestationV1,
} from './HsmeFoundationTargetDeviceBenchmarkAdapterV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_TARGET_DEVICE_MEASURED_CAPTURE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TARGET_DEVICE_MEASURED_CAPTURE_V1' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_METHOD_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_METHOD_V1' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_DIGEST_DOMAIN =
  'bers:hsme:target-device-measured-capture:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_METHOD_DIGEST_DOMAIN =
  'bers:hsme:target-device-capture-method:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const SAFE_STATUS=Object.freeze(['AVAILABLE','INSTALLED','READY'] as const);
const PHASES=Object.freeze(['BASELINE','POST_LOAD','POST_COLD_INFERENCE','POST_WARM_INFERENCE'] as const);
const UNIFIED_SOURCES=Object.freeze(['NATIVE_PROCESS_WORKING_SET','NATIVE_UNIFIED_PROCESS_WORKING_SET'] as const);
const DISCRETE_SOURCES=Object.freeze(['NATIVE_HOST_AND_ACCELERATOR_WORKING_SET'] as const);

type Phase=typeof PHASES[number];
type TargetTier='MOBILE_DEFAULT'|'DESKTOP_HIGH_END';
type MemoryMode='UNIFIED_PROCESS_WORKING_SET'|'DISCRETE_HOST_PLUS_ACCELERATOR';
type MemorySourceKind=
  | typeof UNIFIED_SOURCES[number]
  | typeof DISCRETE_SOURCES[number];

export interface HsmeFoundationTargetDeviceBenchmarkExecutionPortV1{
  state():'UNLOADED'|'LOADED';
  load(manifest:ModelManifest,bytes:Uint8Array):Promise<void>;
  synchronize():Promise<void>;
  infer(request:InferenceRequest):Promise<InferenceResult>;
  unload():Promise<void>;
}

export interface HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1{
  readonly memoryAccountingMode:MemoryMode;
  readonly sourceKind:MemorySourceKind;
  sample(phase:Phase,sequence:number):Promise<Readonly<{
    capturedAtMicros:number;
    hostBytes:number;
    acceleratorBytes:number|'UNAVAILABLE';
    sourceEvidenceSha256:string;
  }>>;
}

export interface HsmeFoundationTargetDeviceBenchmarkEvidenceRecordPortV1{
  record(
    snapshot:DeviceCapabilitySnapshot,
    manifest:ModelManifest,
    benchmark:LocalModelBenchmark,
  ):Promise<BenchmarkEvidence>;
}

export interface HsmeFoundationTargetDeviceMonotonicClockV1{
  nowMicros():number;
}

export type HsmeFoundationTargetDeviceCaptureInputV1=Readonly<{
  targetTier:TargetTier;
  snapshot:DeviceCapabilitySnapshot;
  manifest:ModelManifest;
  modelBytes:Uint8Array;
  request:InferenceRequest;
  benchmarkFixtureSha256:string;
  targetRuntimeInventorySha256:string;
  representationBindingSha256:string;
  warmSampleCount:number;
  energyEstimate:number;
  energyEvidenceSha256:string;
}>;

export type HsmeFoundationTargetDeviceCaptureMethodV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_METHOD_V1_SCHEMA;
  clock:'MONOTONIC_INTEGER_MICROSECONDS';
  coldLatencyDefinition:'MODEL_LOAD_PLUS_FIRST_FROZEN_INFERENCE';
  warmLatencyDefinition:'SUBSEQUENT_FROZEN_INFERENCE';
  warmAggregation:'ARITHMETIC_MEAN_HALF_UP';
  synchronization:'BEFORE_AND_AFTER_TIMED_INFERENCE';
  memorySampling:'BASELINE_POST_LOAD_POST_COLD_AND_EACH_WARM';
  memoryAccountingMode:MemoryMode;
  memorySourceKind:MemorySourceKind;
  ramMetric:'PEAK_PROCESS_WORKING_SET_BYTES'|'PEAK_HOST_WORKING_SET_BYTES';
  vramMetric:'NOT_SEPARATELY_BUDGETED'|'PEAK_ACCELERATOR_BYTES';
  runtimeEstimateFallbackAllowed:false;
  manifestResourceFallbackAllowed:false;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTargetDeviceWorkingSetSampleV1=Readonly<{
  phase:Phase;
  sequence:number;
  capturedAtMicros:number;
  hostBytes:number;
  acceleratorBytes:number|'UNAVAILABLE';
  sourceEvidenceSha256:string;
}>;

export type HsmeFoundationTargetDeviceRawCaptureV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TARGET_DEVICE_MEASURED_CAPTURE_V1_SCHEMA;
  targetTier:TargetTier;
  captureStartedAtMicros:number;
  captureEndedAtMicros:number;
  deviceCapabilityKey:string;
  modelId:string;
  modelVersion:string;
  manifestSha256:string;
  runtime:RuntimeKind;
  provider:ExecutionProvider;
  benchmarkFixtureSha256:string;
  targetRuntimeInventorySha256:string;
  representationBindingSha256:string;
  captureMethodSha256:string;
  coldLatencyMicros:number;
  warmLatencySamplesMicros:readonly number[];
  warmLatencyMeanMicros:number;
  workingSetSamples:readonly HsmeFoundationTargetDeviceWorkingSetSampleV1[];
  peakHostWorkingSetBytes:number;
  peakAcceleratorBytes:number|'UNAVAILABLE';
  energyEstimate:number;
  energyEvidenceSha256:string;
  outputDimensions:readonly number[];
  modelBytesRetained:false;
  runtimeEstimateUsed:false;
  manifestResourceEstimateUsed:false;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTargetDeviceMeasuredCaptureResultV1=Readonly<{
  rawCapture:HsmeFoundationTargetDeviceRawCaptureV1;
  measurementCaptureSha256:string;
  benchmarkEvidence:BenchmarkEvidence;
  benchmarkEvidenceSha256:string;
  measurementAttestation:HsmeFoundationTargetDeviceMeasurementAttestationV1;
  productionAuthorityGranted:false;
  modelFleetPromotionAllowed:false;
  installOrDownloadAllowed:false;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeFoundationTargetDeviceMeasuredCaptureV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationTargetDeviceMeasuredCaptureV1Error';
    this.code=code;
  }
}

export async function captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
  input:HsmeFoundationTargetDeviceCaptureInputV1,
  execution:HsmeFoundationTargetDeviceBenchmarkExecutionPortV1,
  memory:HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1,
  evidenceStore:HsmeFoundationTargetDeviceBenchmarkEvidenceRecordPortV1,
  clock:HsmeFoundationTargetDeviceMonotonicClockV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationTargetDeviceMeasuredCaptureResultV1>{
  validateInput(input,memory);
  if(execution.state()!=='UNLOADED')fail('hsme_target_capture_runtime_state','capture requires dedicated unloaded execution port');

  const modelDigest=await hash.sha256(input.modelBytes);
  if(!HEX64.test(modelDigest)||modelDigest!==input.manifest.sha256){
    fail('hsme_target_capture_model_bytes','model bytes do not match manifest SHA-256');
  }
  const deviceCapabilityKey=await deviceCapabilityKeyForBenchmarkEvidenceV1(input.snapshot,hash);
  if(!HEX64.test(deviceCapabilityKey))fail('hsme_target_capture_device_hash','deviceCapabilityKey must be lowercase SHA-256');

  const method=freezeMethod(memory);
  const captureMethodSha256=await digest(HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_METHOD_DIGEST_DOMAIN,method,hash);
  const captureStartedAtMicros=readClock(clock,'captureStartedAtMicros');

  const samples:HsmeFoundationTargetDeviceWorkingSetSampleV1[]=[];
  const warmLatencySamplesMicros:number[]=[];
  let provider:ExecutionProvider|undefined;
  let outputDimensions:readonly number[]|undefined;
  let coldLatencyMicros=0;
  let loaded=false;

  const takeSample=async(phase:Phase,sequence:number)=>{
    const sample=normalizeSample(await memory.sample(phase,sequence),phase,sequence,memory);
    const previous=samples[samples.length-1];
    if(previous&&sample.capturedAtMicros<=previous.capturedAtMicros){
      fail('hsme_target_capture_sample_time_regression','working-set sample timestamps must strictly increase');
    }
    samples.push(sample);
  };

  try{
    await takeSample('BASELINE',0);
    const coldStart=readClock(clock,'coldStart');
    await execution.load(input.manifest,input.modelBytes);
    loaded=true;
    await execution.synchronize();
    await takeSample('POST_LOAD',1);
    await execution.synchronize();
    const cold=await execution.infer({...input.request,requestId:input.request.requestId+':cold'});
    await execution.synchronize();
    coldLatencyMicros=elapsed(coldStart,readClock(clock,'coldEnd'),'coldLatencyMicros');
    validateResult(cold,input.manifest);
    provider=cold.provider;
    outputDimensions=outputShape(cold);
    await takeSample('POST_COLD_INFERENCE',2);

    for(let index=0;index<input.warmSampleCount;index+=1){
      await execution.synchronize();
      const start=readClock(clock,'warmStart['+index+']');
      const result=await execution.infer({...input.request,requestId:input.request.requestId+':warm:'+index});
      await execution.synchronize();
      warmLatencySamplesMicros.push(elapsed(start,readClock(clock,'warmEnd['+index+']'),'warmLatency['+index+']'));
      validateResult(result,input.manifest);
      if(result.provider!==provider)fail('hsme_target_capture_provider_drift','execution provider changed during capture');
      if(!sameShape(outputShape(result),outputDimensions))fail('hsme_target_capture_output_shape','output dimensions changed during capture');
      await takeSample('POST_WARM_INFERENCE',3+index);
    }
  }finally{
    if(loaded||execution.state()==='LOADED'){
      await execution.unload();
    }
  }

  const captureEndedAtMicros=readClock(clock,'captureEndedAtMicros');
  if(captureEndedAtMicros<=captureStartedAtMicros)fail('hsme_target_capture_window','capture window must be positive');
  for(const sample of samples){
    if(sample.capturedAtMicros<captureStartedAtMicros||sample.capturedAtMicros>captureEndedAtMicros){
      fail('hsme_target_capture_sample_window','memory sample lies outside capture window');
    }
  }
  if(!provider||!outputDimensions)fail('hsme_target_capture_no_output','capture produced no valid output');
  validateProvider(input.snapshot,input.manifest,provider);

  const warmLatencyMeanMicros=meanHalfUp(warmLatencySamplesMicros);
  const peakHostWorkingSetBytes=Math.max(...samples.map(value=>value.hostBytes));
  const peakAcceleratorBytes=memory.memoryAccountingMode==='UNIFIED_PROCESS_WORKING_SET'
    ? 'UNAVAILABLE'
    : maxAccelerator(samples);

  const rawCapture:HsmeFoundationTargetDeviceRawCaptureV1=deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_MEASURED_CAPTURE_V1_SCHEMA,
    targetTier:input.targetTier,
    captureStartedAtMicros,
    captureEndedAtMicros,
    deviceCapabilityKey,
    modelId:input.manifest.modelId,
    modelVersion:input.manifest.version,
    manifestSha256:input.manifest.sha256,
    runtime:input.manifest.runtime,
    provider,
    benchmarkFixtureSha256:input.benchmarkFixtureSha256,
    targetRuntimeInventorySha256:input.targetRuntimeInventorySha256,
    representationBindingSha256:input.representationBindingSha256,
    captureMethodSha256,
    coldLatencyMicros,
    warmLatencySamplesMicros:Object.freeze([...warmLatencySamplesMicros]),
    warmLatencyMeanMicros,
    workingSetSamples:Object.freeze([...samples]),
    peakHostWorkingSetBytes,
    peakAcceleratorBytes,
    energyEstimate:input.energyEstimate,
    energyEvidenceSha256:input.energyEvidenceSha256,
    outputDimensions:Object.freeze([...outputDimensions]),
    modelBytesRetained:false,
    runtimeEstimateUsed:false,
    manifestResourceEstimateUsed:false,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
  const measurementCaptureSha256=await digest(HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_DIGEST_DOMAIN,rawCapture,hash);

  const benchmark:LocalModelBenchmark=deepFreeze({
    modelId:input.manifest.modelId,
    sampleCount:input.warmSampleCount,
    coldStartMs:exactMs(coldLatencyMicros,'coldStartMs'),
    warmStartMs:exactMs(warmLatencySamplesMicros[0],'warmStartMs'),
    latencyMs:exactMs(warmLatencyMeanMicros,'latencyMs'),
    ramBytes:peakHostWorkingSetBytes,
    vramBytes:peakAcceleratorBytes==='UNAVAILABLE'?0:peakAcceleratorBytes,
    energyEstimate:input.energyEstimate,
    successRate:1,
    outputDimensions:Object.freeze([...outputDimensions]),
    provider,
  });
  const benchmarkEvidence=await evidenceStore.record(input.snapshot,input.manifest,benchmark);
  if(benchmarkEvidence.deviceCapabilityKey!==deviceCapabilityKey)fail('hsme_target_capture_store_device','store changed deviceCapabilityKey');
  if(benchmarkEvidence.provider!==provider)fail('hsme_target_capture_store_provider','store changed provider');
  const benchmarkEvidenceSha256=await hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest(benchmarkEvidence,hash);

  const unified=memory.memoryAccountingMode==='UNIFIED_PROCESS_WORKING_SET';
  const measurementAttestation:HsmeFoundationTargetDeviceMeasurementAttestationV1=deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA,
    benchmarkEvidenceKey:benchmarkEvidence.evidenceKey,
    benchmarkEvidenceSha256,
    measurementCaptureSha256,
    memoryAccountingMode:memory.memoryAccountingMode,
    ramMetric:unified?'PEAK_PROCESS_WORKING_SET_BYTES':'PEAK_HOST_WORKING_SET_BYTES',
    vramMetric:unified?'NOT_SEPARATELY_BUDGETED':'PEAK_ACCELERATOR_BYTES',
    coldLatencySource:'coldStartMs',
    warmLatencySource:'latencyMs',
    millisecondsToMicroseconds:'EXACT_X1000',
    evidenceMethodSha256:captureMethodSha256,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });

  const result:HsmeFoundationTargetDeviceMeasuredCaptureResultV1=deepFreeze({
    rawCapture,
    measurementCaptureSha256,
    benchmarkEvidence,
    benchmarkEvidenceSha256,
    measurementAttestation,
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    winnerSelectionAllowed:false,
  });
  await verifyHsmeFoundationTargetDeviceMeasuredCaptureV1(result,hash);
  return result;
}

export async function verifyHsmeFoundationTargetDeviceMeasuredCaptureV1(
  result:HsmeFoundationTargetDeviceMeasuredCaptureResultV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<Readonly<{
  measurementCaptureSha256:string;
  benchmarkEvidenceSha256:string;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>>{
  const measurementCaptureSha256=await digest(
    HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_DIGEST_DOMAIN,
    result.rawCapture,
    hash,
  );
  if(measurementCaptureSha256!==result.measurementCaptureSha256){
    fail('hsme_target_capture_verify_capture_digest','raw capture digest mismatch');
  }
  const benchmarkEvidenceSha256=await hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest(result.benchmarkEvidence,hash);
  if(benchmarkEvidenceSha256!==result.benchmarkEvidenceSha256){
    fail('hsme_target_capture_verify_benchmark_digest','BenchmarkEvidence digest mismatch');
  }
  const attestation=result.measurementAttestation;
  if(attestation.measurementCaptureSha256!==measurementCaptureSha256){
    fail('hsme_target_capture_verify_attestation_capture','attestation capture digest mismatch');
  }
  if(attestation.benchmarkEvidenceSha256!==benchmarkEvidenceSha256
    || attestation.benchmarkEvidenceKey!==result.benchmarkEvidence.evidenceKey){
    fail('hsme_target_capture_verify_attestation_benchmark','attestation benchmark binding mismatch');
  }
  if(attestation.evidenceMethodSha256!==result.rawCapture.captureMethodSha256){
    fail('hsme_target_capture_verify_method','attestation method digest mismatch');
  }
  const benchmark=result.benchmarkEvidence;
  const raw=result.rawCapture;
  if(benchmark.deviceCapabilityKey!==raw.deviceCapabilityKey
    || benchmark.modelId!==raw.modelId
    || benchmark.modelVersion!==raw.modelVersion
    || benchmark.manifestSha256!==raw.manifestSha256
    || benchmark.runtime!==raw.runtime
    || benchmark.provider!==raw.provider){
    fail('hsme_target_capture_verify_identity','BenchmarkEvidence identity differs from raw capture');
  }
  if(benchmark.sampleCount!==raw.warmLatencySamplesMicros.length
    || benchmark.coldStartMs*1000!==raw.coldLatencyMicros
    || benchmark.latencyMs*1000!==raw.warmLatencyMeanMicros
    || benchmark.ramBytes!==raw.peakHostWorkingSetBytes
    || !sameShape(benchmark.outputDimensions,raw.outputDimensions)){
    fail('hsme_target_capture_verify_aggregate','BenchmarkEvidence aggregate differs from raw capture');
  }
  if(attestation.memoryAccountingMode==='UNIFIED_PROCESS_WORKING_SET'){
    if(attestation.ramMetric!=='PEAK_PROCESS_WORKING_SET_BYTES'
      || attestation.vramMetric!=='NOT_SEPARATELY_BUDGETED'
      || raw.peakAcceleratorBytes!=='UNAVAILABLE'
      || benchmark.vramBytes!==0){
      fail('hsme_target_capture_verify_memory','unified memory evidence mismatch');
    }
  }else{
    if(attestation.ramMetric!=='PEAK_HOST_WORKING_SET_BYTES'
      || attestation.vramMetric!=='PEAK_ACCELERATOR_BYTES'
      || raw.peakAcceleratorBytes==='UNAVAILABLE'
      || benchmark.vramBytes!==raw.peakAcceleratorBytes){
      fail('hsme_target_capture_verify_memory','discrete memory evidence mismatch');
    }
  }
  if(result.productionAuthorityGranted!==false
    || result.modelFleetPromotionAllowed!==false
    || result.installOrDownloadAllowed!==false
    || result.selectedCandidateIdAllowed!==false
    || result.reuseAdvanceAllowed!==false
    || result.fullStudentEscalationAllowed!==false
    || result.winnerSelectionAllowed!==false){
    fail('hsme_target_capture_verify_authority','capture result authority must remain false');
  }
  return deepFreeze({
    measurementCaptureSha256,
    benchmarkEvidenceSha256,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function validateInput(
  input:HsmeFoundationTargetDeviceCaptureInputV1,
  memory:HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1,
):void{
  for(const [value,path] of [
    [input.benchmarkFixtureSha256,'benchmarkFixtureSha256'],
    [input.targetRuntimeInventorySha256,'targetRuntimeInventorySha256'],
    [input.representationBindingSha256,'representationBindingSha256'],
    [input.energyEvidenceSha256,'energyEvidenceSha256'],
  ] as const)sha256(value,path);

  if(!Number.isInteger(input.warmSampleCount)||input.warmSampleCount<2||input.warmSampleCount>16){
    fail('hsme_target_capture_warm_count','warmSampleCount must be 2..16');
  }
  if(!Number.isFinite(input.energyEstimate)||input.energyEstimate<0)fail('hsme_target_capture_energy','energyEstimate invalid');
  if(!SAFE_STATUS.includes(input.manifest.status as typeof SAFE_STATUS[number]))fail('hsme_target_capture_model_status','model status unsafe');
  if(!input.manifest.supportedPlatforms.includes(input.snapshot.profile.platform))fail('hsme_target_capture_platform','target platform unsupported');
  if(input.snapshot.runtimeCapabilities[input.manifest.runtime]!==true)fail('hsme_target_capture_runtime','target runtime unavailable');

  if(input.targetTier==='MOBILE_DEFAULT'){
    if(input.snapshot.profile.deviceClass!=='MOBILE'||!['ANDROID','IOS'].includes(input.snapshot.profile.platform)){
      fail('hsme_target_capture_mobile_device','MOBILE_DEFAULT requires MOBILE ANDROID/IOS');
    }
  }else if(input.targetTier==='DESKTOP_HIGH_END'){
    if(input.snapshot.profile.deviceClass!=='DESKTOP'||!['WINDOWS','MACOS','LINUX'].includes(input.snapshot.profile.platform)){
      fail('hsme_target_capture_desktop_device','DESKTOP_HIGH_END requires desktop target');
    }
  }else fail('hsme_target_capture_tier','targetTier invalid');

  if(memory.memoryAccountingMode==='UNIFIED_PROCESS_WORKING_SET'){
    if(!UNIFIED_SOURCES.includes(memory.sourceKind as typeof UNIFIED_SOURCES[number])){
      fail('hsme_target_capture_memory_source','unified capture requires native process/unified working-set source');
    }
  }else{
    if(!DISCRETE_SOURCES.includes(memory.sourceKind as typeof DISCRETE_SOURCES[number])){
      fail('hsme_target_capture_memory_source','discrete capture requires native host+accelerator working-set source');
    }
  }
}

function freezeMethod(memory:HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1):HsmeFoundationTargetDeviceCaptureMethodV1{
  const unified=memory.memoryAccountingMode==='UNIFIED_PROCESS_WORKING_SET';
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_CAPTURE_METHOD_V1_SCHEMA,
    clock:'MONOTONIC_INTEGER_MICROSECONDS',
    coldLatencyDefinition:'MODEL_LOAD_PLUS_FIRST_FROZEN_INFERENCE',
    warmLatencyDefinition:'SUBSEQUENT_FROZEN_INFERENCE',
    warmAggregation:'ARITHMETIC_MEAN_HALF_UP',
    synchronization:'BEFORE_AND_AFTER_TIMED_INFERENCE',
    memorySampling:'BASELINE_POST_LOAD_POST_COLD_AND_EACH_WARM',
    memoryAccountingMode:memory.memoryAccountingMode,
    memorySourceKind:memory.sourceKind,
    ramMetric:unified?'PEAK_PROCESS_WORKING_SET_BYTES':'PEAK_HOST_WORKING_SET_BYTES',
    vramMetric:unified?'NOT_SEPARATELY_BUDGETED':'PEAK_ACCELERATOR_BYTES',
    runtimeEstimateFallbackAllowed:false,
    manifestResourceFallbackAllowed:false,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function normalizeSample(
  raw:Readonly<{capturedAtMicros:number;hostBytes:number;acceleratorBytes:number|'UNAVAILABLE';sourceEvidenceSha256:string}>,
  phase:Phase,
  sequence:number,
  memory:HsmeFoundationTargetDeviceWorkingSetMeasurementPortV1,
):HsmeFoundationTargetDeviceWorkingSetSampleV1{
  if(!PHASES.includes(phase))fail('hsme_target_capture_phase','phase invalid');
  if(!Number.isSafeInteger(raw.capturedAtMicros)||raw.capturedAtMicros<0)fail('hsme_target_capture_sample_time','sample time invalid');
  if(!Number.isSafeInteger(raw.hostBytes)||raw.hostBytes<1)fail('hsme_target_capture_sample_host','hostBytes invalid');
  sha256(raw.sourceEvidenceSha256,'sourceEvidenceSha256');
  if(memory.memoryAccountingMode==='UNIFIED_PROCESS_WORKING_SET'){
    if(raw.acceleratorBytes!=='UNAVAILABLE'&&raw.acceleratorBytes!==0)fail('hsme_target_capture_sample_accelerator','unified sample cannot separately budget accelerator');
  }else if(!Number.isSafeInteger(raw.acceleratorBytes)||Number(raw.acceleratorBytes)<0){
    fail('hsme_target_capture_sample_accelerator','discrete sample requires accelerator bytes');
  }
  return deepFreeze({phase,sequence,capturedAtMicros:raw.capturedAtMicros,hostBytes:raw.hostBytes,acceleratorBytes:raw.acceleratorBytes,sourceEvidenceSha256:raw.sourceEvidenceSha256});
}

function validateResult(result:InferenceResult,manifest:ModelManifest):void{
  if(result.modelId!==manifest.modelId)fail('hsme_target_capture_result_model','result modelId mismatch');
  if(!result.outputs||Object.keys(result.outputs).length<1)fail('hsme_target_capture_result_outputs','outputs missing');
}

function outputShape(result:InferenceResult):readonly number[]{
  const tensor=Object.values(result.outputs)[0];
  if(!tensor||!Array.isArray(tensor.dims)||tensor.dims.length<1)fail('hsme_target_capture_output_shape','output dims missing');
  if(tensor.dims.some(value=>!Number.isSafeInteger(value)||value<0))fail('hsme_target_capture_output_shape','output dims invalid');
  return Object.freeze([...tensor.dims]);
}

function validateProvider(snapshot:DeviceCapabilitySnapshot,manifest:ModelManifest,provider:ExecutionProvider):void{
  const runtime=providerRuntime(provider);
  if(runtime&&snapshot.runtimeCapabilities[runtime]!==true)fail('hsme_target_capture_provider','provider runtime unavailable');
  if(runtime&&!manifest.supportedAccelerators.includes(runtime))fail('hsme_target_capture_provider_manifest','manifest does not support measured provider');
}

function providerRuntime(provider:ExecutionProvider):RuntimeKind|null{
  if(provider==='webgpu')return 'WEBGPU';
  if(provider==='wasm')return 'WASM';
  if(provider==='cuda')return 'CUDA';
  if(provider==='dml')return 'DIRECTML';
  if(provider==='coreml')return 'METAL';
  if(provider==='nnapi')return 'NNAPI';
  return null;
}

function readClock(clock:HsmeFoundationTargetDeviceMonotonicClockV1,path:string):number{
  const value=clock.nowMicros();
  if(!Number.isSafeInteger(value)||value<0)fail('hsme_target_capture_clock',path+' invalid');
  return value;
}

function elapsed(start:number,end:number,path:string):number{
  if(end<=start||!Number.isSafeInteger(end-start))fail('hsme_target_capture_clock',path+' invalid');
  return end-start;
}

function meanHalfUp(values:readonly number[]):number{
  if(values.length<1)fail('hsme_target_capture_mean','warm samples missing');
  let sum=0;
  for(const value of values){
    if(!Number.isSafeInteger(value)||value<1)fail('hsme_target_capture_mean','warm sample invalid');
    sum+=value;
    if(!Number.isSafeInteger(sum))fail('hsme_target_capture_mean','warm sum overflow');
  }
  const q=Math.floor(sum/values.length),r=sum%values.length;
  return q+(2*r>=values.length?1:0);
}

function maxAccelerator(samples:readonly HsmeFoundationTargetDeviceWorkingSetSampleV1[]):number{
  const values=samples.map(sample=>{
    if(sample.acceleratorBytes==='UNAVAILABLE')fail('hsme_target_capture_accelerator_missing','discrete sample missing accelerator bytes');
    return sample.acceleratorBytes;
  });
  return Math.max(...values);
}

function exactMs(micros:number,path:string):number{
  if(!Number.isSafeInteger(micros)||micros<1)fail('hsme_target_capture_time',path+' invalid');
  const ms=micros/1000;
  if(!Number.isFinite(ms)||ms*1000!==micros)fail('hsme_target_capture_time',path+' cannot round-trip exactly through BenchmarkEvidence milliseconds');
  return ms;
}

function sameShape(a:readonly number[],b:readonly number[]):boolean{
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

async function digest(domain:string,value:unknown,hash:HsmeFoundationBenchmarkRunHashPortV1):Promise<string>{
  const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(result))fail('hsme_target_capture_hash','hash port must return lowercase SHA-256');
  return result;
}

function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value))fail('hsme_target_capture_sha',path+' invalid');
  return value;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeFoundationTargetDeviceMeasuredCaptureV1Error(code,message);
}

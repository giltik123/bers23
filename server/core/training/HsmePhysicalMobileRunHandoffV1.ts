import {
  HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA,
  hsmePhysicalMobileCapturePlanV1Digest,
  type HsmePhysicalMobileCapturePlanV1,
  type HsmePhysicalMobileRequiredTelemetryV1,
} from './HsmePhysicalMobileCapturePlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1_SCHEMA =
  'BERS_HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1' as const;
export const HSME_PHYSICAL_MOBILE_RUNNER_BINDING_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-runner-binding:v1\0' as const;
export const HSME_PHYSICAL_MOBILE_RUN_HANDOFF_V1_SCHEMA =
  'BERS_HSME_PHYSICAL_MOBILE_RUN_HANDOFF_V1' as const;
export const HSME_PHYSICAL_MOBILE_RUN_HANDOFF_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-run-handoff:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;

export type HsmePhysicalMobileRunnerBindingV1=Readonly<{
  schemaVersion:typeof HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1_SCHEMA;
  capturePlanEvidenceSha256:string;
  runnerKind:'ANDROID_NATIVE'|'IOS_NATIVE';
  nativeHarnessBuildSha256:string;
  nativeBridgeBuildSha256:string;
  nativeTelemetryVerifierKeyId:string;
  physicalEvidenceVerifierKeyId:string;
  outputSchemaVersion:string;
  outputEnvelopeMode:'CONTENT_ADDRESSED_AFTER_CAPTURE';
  modelAcquisitionState:'PREINSTALLED_VERIFIED_ONLY';
  networkDuringExecutionAllowed:false;
  postHocCandidateSelectionAllowed:false;
  postHocPlacementSelectionAllowed:false;
  modelMutationAllowed:false;
  reviewedBeforeExecution:true;
  physicalExecutionAllowed:false;
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

export interface HsmePhysicalMobileRunHandoffPlanOriginVerifierV1{
  verifyPhysicalMobileCapturePlan(
    plan:HsmePhysicalMobileCapturePlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmePhysicalMobileRunnerBindingOriginVerifierV1{
  verifyPhysicalMobileRunnerBinding(
    binding:HsmePhysicalMobileRunnerBindingV1,
    expectedBindingSha256:string,
  ):Promise<boolean>;
}

export type HsmePhysicalMobileRunHandoffV1=Readonly<{
  schemaVersion:typeof HSME_PHYSICAL_MOBILE_RUN_HANDOFF_V1_SCHEMA;
  state:
    |'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID'
    |'PHYSICAL_MOBILE_RUN_HANDOFF_BLOCKED'
    |'PHYSICAL_MOBILE_RUN_HANDOFF_READY_NOT_EXECUTED';
  blockers:readonly string[];
  capturePlanEvidenceSha256:string|'UNKNOWN';
  runnerBindingSha256:string|'UNKNOWN';
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
  runnerKind:'ANDROID_NATIVE'|'IOS_NATIVE'|'UNKNOWN';
  nativeHarnessBuildSha256:string|'UNKNOWN';
  nativeBridgeBuildSha256:string|'UNKNOWN';
  nativeTelemetryVerifierKeyId:string|'UNKNOWN';
  physicalEvidenceVerifierKeyId:string|'UNKNOWN';
  outputSchemaVersion:string|'UNKNOWN';
  outputEnvelopeMode:'CONTENT_ADDRESSED_AFTER_CAPTURE'|'UNKNOWN';
  modelAcquisitionState:'PREINSTALLED_VERIFIED_ONLY'|'UNKNOWN';
  networkDuringExecutionAllowed:false|'UNKNOWN';
  expectedFoundationPhysicalBundle:true;
  expectedNativeEnergyThermalEvidence:true;
  handoffEvidenceSha256:string|'UNKNOWN';
  physicalExecutionAllowed:false;
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

export class HsmePhysicalMobileRunHandoffV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmePhysicalMobileRunHandoffV1Error';
    this.code=code;
  }
}

export function normalizeHsmePhysicalMobileRunnerBindingV1(
  raw:unknown,
):HsmePhysicalMobileRunnerBindingV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'capturePlanEvidenceSha256',
    'runnerKind',
    'nativeHarnessBuildSha256',
    'nativeBridgeBuildSha256',
    'nativeTelemetryVerifierKeyId',
    'physicalEvidenceVerifierKeyId',
    'outputSchemaVersion',
    'outputEnvelopeMode',
    'modelAcquisitionState',
    'networkDuringExecutionAllowed',
    'postHocCandidateSelectionAllowed',
    'postHocPlacementSelectionAllowed',
    'modelMutationAllowed',
    'reviewedBeforeExecution',
    'physicalExecutionAllowed',
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
  ],'binding');

  if(r.schemaVersion!==HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1_SCHEMA){
    fail(
      'hsme_physical_mobile_runner_binding_schema',
      'runner binding schema unsupported',
    );
  }
  if(
    r.outputEnvelopeMode!=='CONTENT_ADDRESSED_AFTER_CAPTURE'
    ||r.modelAcquisitionState!=='PREINSTALLED_VERIFIED_ONLY'
    ||r.networkDuringExecutionAllowed!==false
    ||r.postHocCandidateSelectionAllowed!==false
    ||r.postHocPlacementSelectionAllowed!==false
    ||r.modelMutationAllowed!==false
    ||r.reviewedBeforeExecution!==true
  ){
    fail(
      'hsme_physical_mobile_runner_binding_boundary',
      'runner binding execution boundary invalid',
    );
  }
  assertNoAuthority(r,'binding');

  return deepFreeze({
    schemaVersion:HSME_PHYSICAL_MOBILE_RUNNER_BINDING_V1_SCHEMA,
    capturePlanEvidenceSha256:sha256(
      r.capturePlanEvidenceSha256,
      'binding.capturePlanEvidenceSha256',
    ),
    runnerKind:enumValue(
      r.runnerKind,
      ['ANDROID_NATIVE','IOS_NATIVE'] as const,
      'binding.runnerKind',
    ),
    nativeHarnessBuildSha256:sha256(
      r.nativeHarnessBuildSha256,
      'binding.nativeHarnessBuildSha256',
    ),
    nativeBridgeBuildSha256:sha256(
      r.nativeBridgeBuildSha256,
      'binding.nativeBridgeBuildSha256',
    ),
    nativeTelemetryVerifierKeyId:identifier(
      r.nativeTelemetryVerifierKeyId,
      'binding.nativeTelemetryVerifierKeyId',
      160,
    ),
    physicalEvidenceVerifierKeyId:identifier(
      r.physicalEvidenceVerifierKeyId,
      'binding.physicalEvidenceVerifierKeyId',
      160,
    ),
    outputSchemaVersion:identifier(
      r.outputSchemaVersion,
      'binding.outputSchemaVersion',
      100,
    ),
    outputEnvelopeMode:'CONTENT_ADDRESSED_AFTER_CAPTURE',
    modelAcquisitionState:'PREINSTALLED_VERIFIED_ONLY',
    networkDuringExecutionAllowed:false,
    postHocCandidateSelectionAllowed:false,
    postHocPlacementSelectionAllowed:false,
    modelMutationAllowed:false,
    reviewedBeforeExecution:true,
    ...authorityBoundary(),
  });
}

export async function hsmePhysicalMobileRunnerBindingV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_PHYSICAL_MOBILE_RUNNER_BINDING_DIGEST_DOMAIN,
    normalizeHsmePhysicalMobileRunnerBindingV1(raw),
    hash,
  );
}

export async function compileHsmePhysicalMobileRunHandoffV1(
  plan:HsmePhysicalMobileCapturePlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmePhysicalMobileRunHandoffPlanOriginVerifierV1,
  rawBinding:unknown,
  expectedBindingSha256:string,
  bindingOrigin:HsmePhysicalMobileRunnerBindingOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmePhysicalMobileRunHandoffV1>{
  if(
    plan.schemaVersion!==HSME_PHYSICAL_MOBILE_CAPTURE_PLAN_V1_SCHEMA
    ||plan.state!=='PHYSICAL_MOBILE_CAPTURE_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.capturePlanEvidenceSha256==='UNKNOWN'
  ){
    return blocked([
      'PHYSICAL_MOBILE_RUN_HANDOFF_FROZEN_PLAN_REQUIRED',
    ]);
  }

  let planSha256:string;
  try{
    planSha256=await hsmePhysicalMobileCapturePlanV1Digest(
      plan,
      hash,
    );
  }catch{
    return invalid([
      'PHYSICAL_MOBILE_RUN_HANDOFF_PLAN_REHASH_INVALID',
    ]);
  }
  const common={capturePlanEvidenceSha256:planSha256};
  if(
    !exactDigest(
      expectedPlanSha256,
      planSha256,
      plan.capturePlanEvidenceSha256 as string,
    )
  ){
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_PLAN_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>planOrigin.verifyPhysicalMobileCapturePlan(
      plan,
      planSha256,
    ),
  )){
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_PLAN_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let binding:HsmePhysicalMobileRunnerBindingV1;
  let bindingSha256:string;
  try{
    binding=normalizeHsmePhysicalMobileRunnerBindingV1(rawBinding);
    bindingSha256=await hsmePhysicalMobileRunnerBindingV1Digest(
      binding,
      hash,
    );
  }catch{
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_INVALID'],
      common,
    );
  }
  const bound={
    ...common,
    runnerBindingSha256:bindingSha256,
  };
  if(
    !exactDigest(
      expectedBindingSha256,
      bindingSha256,
      bindingSha256,
    )
  ){
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_DIGEST_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>bindingOrigin.verifyPhysicalMobileRunnerBinding(
      binding,
      bindingSha256,
    ),
  )){
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(binding.capturePlanEvidenceSha256!==planSha256){
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_RUNNER_BINDING_PLAN_MISMATCH'],
      bound,
    );
  }
  const expectedRunner=
    plan.platformFamily==='ANDROID'
      ?'ANDROID_NATIVE'
      :'IOS_NATIVE';
  if(binding.runnerKind!==expectedRunner){
    return invalid(
      ['PHYSICAL_MOBILE_RUN_HANDOFF_PLATFORM_RUNNER_MISMATCH'],
      bound,
    );
  }

  const payload={
    schemaVersion:HSME_PHYSICAL_MOBILE_RUN_HANDOFF_V1_SCHEMA,
    state:'PHYSICAL_MOBILE_RUN_HANDOFF_READY_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    capturePlanEvidenceSha256:planSha256,
    runnerBindingSha256:bindingSha256,
    candidateId:plan.candidateId as string,
    requestedPlacement:
      plan.requestedPlacement as 'CPU'|'GPU'|'NPU',
    supportedDeviceClass:plan.supportedDeviceClass as string,
    platformFamily:
      plan.platformFamily as 'APPLE'|'ANDROID',
    fleetModelId:plan.fleetModelId as string,
    fleetVersion:plan.fleetVersion as string,
    representationContentSha256:
      plan.representationContentSha256 as string,
    placementMeasurementEvidenceSha256:
      plan.placementMeasurementEvidenceSha256 as string,
    runtimeIdentity:plan.runtimeIdentity as string,
    repeatedRunCount:plan.repeatedRunCount as number,
    requiredTelemetry:plan.requiredTelemetry,
    runnerKind:binding.runnerKind,
    nativeHarnessBuildSha256:binding.nativeHarnessBuildSha256,
    nativeBridgeBuildSha256:binding.nativeBridgeBuildSha256,
    nativeTelemetryVerifierKeyId:
      binding.nativeTelemetryVerifierKeyId,
    physicalEvidenceVerifierKeyId:
      binding.physicalEvidenceVerifierKeyId,
    outputSchemaVersion:binding.outputSchemaVersion,
    outputEnvelopeMode:'CONTENT_ADDRESSED_AFTER_CAPTURE' as const,
    modelAcquisitionState:'PREINSTALLED_VERIFIED_ONLY' as const,
    networkDuringExecutionAllowed:false as const,
    expectedFoundationPhysicalBundle:true as const,
    expectedNativeEnergyThermalEvidence:true as const,
    ...authorityBoundary(),
  };
  const handoffEvidenceSha256=await digest(
    HSME_PHYSICAL_MOBILE_RUN_HANDOFF_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({
    ...payload,
    handoffEvidenceSha256,
  });
}

export async function hsmePhysicalMobileRunHandoffV1Digest(
  value:HsmePhysicalMobileRunHandoffV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='PHYSICAL_MOBILE_RUN_HANDOFF_READY_NOT_EXECUTED'
    ||value.handoffEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_physical_mobile_run_handoff_digest_state',
      'only READY_NOT_EXECUTED handoff is digestible',
    );
  }
  const {handoffEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_PHYSICAL_MOBILE_RUN_HANDOFF_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

type PartialOutput=Partial<Pick<
  HsmePhysicalMobileRunHandoffV1,
  'capturePlanEvidenceSha256'|'runnerBindingSha256'
>>;

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmePhysicalMobileRunHandoffV1{
  return terminal(
    'PHYSICAL_MOBILE_RUN_HANDOFF_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmePhysicalMobileRunHandoffV1{
  return terminal(
    'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'PHYSICAL_MOBILE_RUN_HANDOFF_INVALID'
    |'PHYSICAL_MOBILE_RUN_HANDOFF_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmePhysicalMobileRunHandoffV1{
  return deepFreeze({
    schemaVersion:HSME_PHYSICAL_MOBILE_RUN_HANDOFF_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    capturePlanEvidenceSha256:
      values.capturePlanEvidenceSha256??'UNKNOWN',
    runnerBindingSha256:
      values.runnerBindingSha256??'UNKNOWN',
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
    runnerKind:'UNKNOWN',
    nativeHarnessBuildSha256:'UNKNOWN',
    nativeBridgeBuildSha256:'UNKNOWN',
    nativeTelemetryVerifierKeyId:'UNKNOWN',
    physicalEvidenceVerifierKeyId:'UNKNOWN',
    outputSchemaVersion:'UNKNOWN',
    outputEnvelopeMode:'UNKNOWN',
    modelAcquisitionState:'UNKNOWN',
    networkDuringExecutionAllowed:'UNKNOWN',
    expectedFoundationPhysicalBundle:true,
    expectedNativeEnergyThermalEvidence:true,
    handoffEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    physicalExecutionAllowed:false as const,
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
        'hsme_physical_mobile_run_handoff_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
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
      'hsme_physical_mobile_run_handoff_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_physical_mobile_run_handoff_schema',
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
      'hsme_physical_mobile_run_handoff_schema',
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
      'hsme_physical_mobile_run_handoff_value',
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
  if(typeof raw!=='string'){
    fail(
      'hsme_physical_mobile_run_handoff_value',
      path+' must be a string',
    );
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||!IDENTIFIER.test(value)
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail(
      'hsme_physical_mobile_run_handoff_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function sha256(
  raw:unknown,
  path:string,
):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail(
      'hsme_physical_mobile_run_handoff_value',
      path+' must be lowercase SHA-256',
    );
  }
  return raw;
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
      'hsme_physical_mobile_run_handoff_hash',
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
  throw new HsmePhysicalMobileRunHandoffV1Error(
    code,
    message,
  );
}

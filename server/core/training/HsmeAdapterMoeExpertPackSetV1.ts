import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
  type HsmeAdapterMoeExperimentPlanV1,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-delta-manifest:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_PACK_SET_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-pack-set:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

const ADAPTER_KINDS=Object.freeze([
  'LORA_LOW_RANK',
  'DECOMPOSED_FFN_DELTA',
  'RESIDUAL_ADAPTER',
  'ATTENTION_DELTA',
  'EMBEDDING_NORM_DELTA',
] as const);

export type HsmeAdapterMoeExpertAdapterKindV1=
  typeof ADAPTER_KINDS[number];

export type HsmeAdapterMoeExpertDeltaManifestV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA;
  expertId:string;
  specialistHypothesis:string;
  adapterKind:HsmeAdapterMoeExpertAdapterKindV1;
  experimentPlanSha256:string;
  denseBaselineDecisionSha256:string;
  denseBaselineContentSha256:string;
  targetModuleSetSha256:string;
  adapterConfigSha256:string;
  artifactUri:string;
  artifactRevision:string;
  contentSha256:string;
  artifactBytes:number;
  trainableParameters:number;
  exportToolchainSha256:string;
  trainingReceiptSha256:string;
  license:string;
  licenseEvidenceSha256:string;
  requiresSharedBaseline:true;
  containsFullBackboneWeights:false;
  standaloneExecutionAllowed:false;
  trainingExecutionAllowed:false;
  prototypeAssemblyAllowed:false;
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

export type HsmeAdapterMoeExpertManifestBindingV1=Readonly<{
  rawManifest:unknown;
  expectedManifestSha256:string;
}>;

export interface HsmeAdapterMoeExperimentPlanOriginVerifierV1{
  verifyExperimentPlan(
    plan:HsmeAdapterMoeExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdapterMoeExpertManifestOriginVerifierV1{
  verifyExpertManifest(
    manifest:HsmeAdapterMoeExpertDeltaManifestV1,
    expectedManifestSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertPackEntryV1=Readonly<{
  manifestSha256:string;
  manifest:HsmeAdapterMoeExpertDeltaManifestV1;
}>;

export type HsmeAdapterMoeExpertPackSetV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_EXPERT_PACK_SET_INVALID'
    |'ADAPTER_MOE_EXPERT_PACK_SET_BLOCKED'
    |'ADAPTER_MOE_EXPERT_PACK_SET_READY_NOT_ASSEMBLED';
  blockers:readonly string[];
  experimentPlanSha256:string|'UNKNOWN';
  experimentId:string|'UNKNOWN';
  denseBaselineDecisionSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  denseBaselinePackageBytes:number|'UNKNOWN';
  experts:readonly HsmeAdapterMoeExpertPackEntryV1[];
  expertCount:number;
  totalExpertArtifactBytes:number;
  totalTrainableParameters:number;
  sharedPathRequired:boolean;
  fullBackboneExpertAllowed:false;
  packSetEvidenceSha256:string|'UNKNOWN';
  trainingExecutionAllowed:false;
  prototypeAssemblyAllowed:false;
  standaloneExecutionAllowed:false;
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

export class HsmeAdapterMoeExpertPackSetV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExpertPackSetV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeExpertDeltaManifestV1(
  raw:unknown,
):HsmeAdapterMoeExpertDeltaManifestV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'expertId',
    'specialistHypothesis',
    'adapterKind',
    'experimentPlanSha256',
    'denseBaselineDecisionSha256',
    'denseBaselineContentSha256',
    'targetModuleSetSha256',
    'adapterConfigSha256',
    'artifactUri',
    'artifactRevision',
    'contentSha256',
    'artifactBytes',
    'trainableParameters',
    'exportToolchainSha256',
    'trainingReceiptSha256',
    'license',
    'licenseEvidenceSha256',
    'requiresSharedBaseline',
    'containsFullBackboneWeights',
    'standaloneExecutionAllowed',
    'trainingExecutionAllowed',
    'prototypeAssemblyAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'manifest');

  if(record.schemaVersion!==HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA){
    fail('hsme_adapter_moe_expert_manifest_schema','manifest schema unsupported');
  }
  if(record.requiresSharedBaseline!==true){
    fail(
      'hsme_adapter_moe_expert_manifest_shared_baseline',
      'requiresSharedBaseline must be true',
    );
  }
  if(record.containsFullBackboneWeights!==false){
    fail(
      'hsme_adapter_moe_expert_manifest_full_backbone',
      'containsFullBackboneWeights must be false',
    );
  }
  if(record.standaloneExecutionAllowed!==false){
    fail(
      'hsme_adapter_moe_expert_manifest_standalone',
      'standaloneExecutionAllowed must be false',
    );
  }
  assertNoAuthority(record,'manifest');

  const artifactRevision=boundedString(
    record.artifactRevision,
    'manifest.artifactRevision',
    64,
  );
  if(!IMMUTABLE_REVISION.test(artifactRevision)){
    fail(
      'hsme_adapter_moe_expert_manifest_revision',
      'artifactRevision must be immutable 40- or 64-hex',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
    expertId:identifier(record.expertId,'manifest.expertId',120),
    specialistHypothesis:identifier(
      record.specialistHypothesis,
      'manifest.specialistHypothesis',
      80,
    ),
    adapterKind:enumValue(
      record.adapterKind,
      ADAPTER_KINDS,
      'manifest.adapterKind',
    ),
    experimentPlanSha256:sha256(
      record.experimentPlanSha256,
      'manifest.experimentPlanSha256',
    ),
    denseBaselineDecisionSha256:sha256(
      record.denseBaselineDecisionSha256,
      'manifest.denseBaselineDecisionSha256',
    ),
    denseBaselineContentSha256:sha256(
      record.denseBaselineContentSha256,
      'manifest.denseBaselineContentSha256',
    ),
    targetModuleSetSha256:sha256(
      record.targetModuleSetSha256,
      'manifest.targetModuleSetSha256',
    ),
    adapterConfigSha256:sha256(
      record.adapterConfigSha256,
      'manifest.adapterConfigSha256',
    ),
    artifactUri:boundedString(record.artifactUri,'manifest.artifactUri',500),
    artifactRevision,
    contentSha256:sha256(record.contentSha256,'manifest.contentSha256'),
    artifactBytes:safeInteger(
      record.artifactBytes,
      'manifest.artifactBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    trainableParameters:safeInteger(
      record.trainableParameters,
      'manifest.trainableParameters',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    exportToolchainSha256:sha256(
      record.exportToolchainSha256,
      'manifest.exportToolchainSha256',
    ),
    trainingReceiptSha256:sha256(
      record.trainingReceiptSha256,
      'manifest.trainingReceiptSha256',
    ),
    license:boundedString(record.license,'manifest.license',180),
    licenseEvidenceSha256:sha256(
      record.licenseEvidenceSha256,
      'manifest.licenseEvidenceSha256',
    ),
    requiresSharedBaseline:true,
    containsFullBackboneWeights:false,
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoeExpertDeltaManifestV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const manifest=normalizeHsmeAdapterMoeExpertDeltaManifestV1(raw);
  return digest(
    HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_DIGEST_DOMAIN,
    manifest,
    hash,
  );
}

export async function freezeHsmeAdapterMoeExpertPackSetV1(
  plan:HsmeAdapterMoeExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeAdapterMoeExperimentPlanOriginVerifierV1,
  bindings:readonly HsmeAdapterMoeExpertManifestBindingV1[],
  manifestOrigin:HsmeAdapterMoeExpertManifestOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertPackSetV1>{
  if(
    plan.state!=='ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTER_MOE_EXPERT_PACK_SET_FROZEN_PLAN_REQUIRED']);
  }
  if(!validFrozenPlanBoundary(plan)){
    return invalid(['ADAPTER_MOE_EXPERT_PACK_SET_PLAN_BOUNDARY_INVALID']);
  }

  let experimentPlanSha256:string;
  try{
    experimentPlanSha256=
      await hsmeAdapterMoeExperimentPlanV1Digest(plan,hash);
  }catch{
    return invalid(['ADAPTER_MOE_EXPERT_PACK_SET_PLAN_REHASH_INVALID']);
  }
  const planValues=valuesFromPlan(plan,experimentPlanSha256);
  if(
    !HEX64.test(expectedPlanSha256)
    ||experimentPlanSha256!==expectedPlanSha256
    ||experimentPlanSha256!==plan.planEvidenceSha256
  ){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_PLAN_REHASH_MISMATCH'],
      planValues,
    );
  }
  if(!await verify(
    ()=>planOrigin.verifyExperimentPlan(plan,experimentPlanSha256),
  )){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_PLAN_ORIGIN_UNVERIFIED'],
      planValues,
    );
  }

  if(!Array.isArray(bindings)||bindings.length<1){
    return blocked(
      ['ADAPTER_MOE_EXPERT_PACK_SET_EXPERT_MANIFEST_REQUIRED'],
      planValues,
    );
  }
  if(bindings.length>plan.maxExpertCount){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_EXPERT_COUNT_EXCEEDED'],
      planValues,
    );
  }

  const entries:HsmeAdapterMoeExpertPackEntryV1[]=[];
  for(let index=0;index<bindings.length;index+=1){
    const binding=bindings[index];
    if(
      !binding
      ||typeof binding!=='object'
      ||Array.isArray(binding)
      ||!Object.hasOwn(binding,'rawManifest')
      ||!Object.hasOwn(binding,'expectedManifestSha256')
      ||Object.keys(binding).length!==2
    ){
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_BINDING_INVALID'],
        planValues,
      );
    }

    let manifest:HsmeAdapterMoeExpertDeltaManifestV1;
    let manifestSha256:string;
    try{
      manifest=normalizeHsmeAdapterMoeExpertDeltaManifestV1(
        binding.rawManifest,
      );
      manifestSha256=
        await hsmeAdapterMoeExpertDeltaManifestV1Digest(manifest,hash);
    }catch{
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_INVALID'],
        planValues,
      );
    }

    if(
      !HEX64.test(binding.expectedManifestSha256)
      ||manifestSha256!==binding.expectedManifestSha256
    ){
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_DIGEST_MISMATCH'],
        planValues,
      );
    }
    if(!await verify(
      ()=>manifestOrigin.verifyExpertManifest(manifest,manifestSha256),
    )){
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_ORIGIN_UNVERIFIED'],
        planValues,
      );
    }

    if(
      manifest.experimentPlanSha256!==experimentPlanSha256
      ||manifest.denseBaselineDecisionSha256!==
        plan.denseBaselineDecisionSha256
      ||manifest.denseBaselineContentSha256!==
        plan.denseBaselineContentSha256
    ){
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_BASELINE_BINDING_MISMATCH'],
        planValues,
      );
    }
    if(!plan.specialistHypotheses.includes(manifest.specialistHypothesis)){
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_SPECIALIST_OUTSIDE_FROZEN_ROSTER'],
        planValues,
      );
    }
    if(
      manifest.artifactBytes>plan.maxExpertArtifactBytes
      ||manifest.artifactBytes>=plan.denseBaselinePackageBytes
    ){
      return invalid(
        ['ADAPTER_MOE_EXPERT_PACK_SET_EXPERT_BYTES_EXCEEDED'],
        planValues,
      );
    }

    entries.push(deepFreeze({manifestSha256,manifest}));
  }

  entries.sort((left,right)=>
    lexical(left.manifest.expertId,right.manifest.expertId)
  );

  const expertIds=entries.map(entry=>entry.manifest.expertId);
  if(new Set(expertIds).size!==expertIds.length){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_DUPLICATE_EXPERT_ID'],
      planValues,
    );
  }
  const contentDigests=entries.map(entry=>entry.manifest.contentSha256);
  if(new Set(contentDigests).size!==contentDigests.length){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_DUPLICATE_CONTENT'],
      planValues,
    );
  }
  const manifestDigests=entries.map(entry=>entry.manifestSha256);
  if(new Set(manifestDigests).size!==manifestDigests.length){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_DUPLICATE_MANIFEST'],
      planValues,
    );
  }

  let totalExpertArtifactBytes=0;
  let totalTrainableParameters=0;
  for(const entry of entries){
    totalExpertArtifactBytes=checkedAdd(
      totalExpertArtifactBytes,
      entry.manifest.artifactBytes,
      'totalExpertArtifactBytes',
    );
    totalTrainableParameters=checkedAdd(
      totalTrainableParameters,
      entry.manifest.trainableParameters,
      'totalTrainableParameters',
    );
  }
  if(totalExpertArtifactBytes>plan.maxTotalExpertArtifactBytes){
    return invalid(
      ['ADAPTER_MOE_EXPERT_PACK_SET_TOTAL_BYTES_EXCEEDED'],
      planValues,
    );
  }

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERT_PACK_SET_READY_NOT_ASSEMBLED' as const,
    blockers:Object.freeze([] as string[]),
    experimentPlanSha256,
    experimentId:plan.experimentId,
    denseBaselineDecisionSha256:plan.denseBaselineDecisionSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    denseBaselinePackageBytes:plan.denseBaselinePackageBytes,
    experts:Object.freeze(entries),
    expertCount:entries.length,
    totalExpertArtifactBytes,
    totalTrainableParameters,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false as const,
    ...authorityBoundary(),
  };
  const packSetEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERT_PACK_SET_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,packSetEvidenceSha256});
}

export async function hsmeAdapterMoeExpertPackSetV1Digest(
  packSet:HsmeAdapterMoeExpertPackSetV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    packSet.state!=='ADAPTER_MOE_EXPERT_PACK_SET_READY_NOT_ASSEMBLED'
    ||packSet.packSetEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_adapter_moe_expert_pack_set_digest_state',
      'only READY_NOT_ASSEMBLED pack sets are digestible',
    );
  }
  const {packSetEvidenceSha256:_ignored,...payload}=packSet;
  return digest(
    HSME_ADAPTER_MOE_EXPERT_PACK_SET_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function validFrozenPlanBoundary(
  plan:HsmeAdapterMoeExperimentPlanV1,
):plan is HsmeAdapterMoeExperimentPlanV1&{
  experimentId:string;
  denseBaselineDecisionSha256:string;
  denseBaselineContentSha256:string;
  denseBaselinePackageBytes:number;
  maxExpertCount:number;
  maxExpertArtifactBytes:number;
  maxTotalExpertArtifactBytes:number;
}{
  return plan.schemaVersion===HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA
    &&plan.blockers.length===0
    &&plan.experimentId!=='UNKNOWN'
    &&plan.denseBaselineDecisionSha256!=='UNKNOWN'
    &&plan.denseBaselineContentSha256!=='UNKNOWN'
    &&typeof plan.denseBaselinePackageBytes==='number'
    &&Number.isSafeInteger(plan.denseBaselinePackageBytes)
    &&plan.denseBaselinePackageBytes>0
    &&typeof plan.maxExpertCount==='number'
    &&Number.isSafeInteger(plan.maxExpertCount)
    &&plan.maxExpertCount>=1
    &&typeof plan.maxExpertArtifactBytes==='number'
    &&Number.isSafeInteger(plan.maxExpertArtifactBytes)
    &&plan.maxExpertArtifactBytes>=1
    &&typeof plan.maxTotalExpertArtifactBytes==='number'
    &&Number.isSafeInteger(plan.maxTotalExpertArtifactBytes)
    &&plan.maxTotalExpertArtifactBytes>=plan.maxExpertArtifactBytes
    &&plan.sharedPathRequired===true
    &&plan.fullBackboneExpertAllowed===false
    &&plan.trainingExecutionAllowed===false
    &&plan.prototypeAssemblyAllowed===false
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
  HsmeAdapterMoeExpertPackSetV1,
  'experimentPlanSha256'
  |'experimentId'
  |'denseBaselineDecisionSha256'
  |'denseBaselineContentSha256'
  |'denseBaselinePackageBytes'
>>;

function valuesFromPlan(
  plan:HsmeAdapterMoeExperimentPlanV1,
  experimentPlanSha256:string,
):PartialOutput{
  return {
    experimentPlanSha256,
    experimentId:plan.experimentId,
    denseBaselineDecisionSha256:plan.denseBaselineDecisionSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    denseBaselinePackageBytes:plan.denseBaselinePackageBytes,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertPackSetV1{
  return terminal(
    'ADAPTER_MOE_EXPERT_PACK_SET_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertPackSetV1{
  return terminal(
    'ADAPTER_MOE_EXPERT_PACK_SET_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'ADAPTER_MOE_EXPERT_PACK_SET_INVALID'
    |'ADAPTER_MOE_EXPERT_PACK_SET_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoeExpertPackSetV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    experimentId:values.experimentId??'UNKNOWN',
    denseBaselineDecisionSha256:
      values.denseBaselineDecisionSha256??'UNKNOWN',
    denseBaselineContentSha256:
      values.denseBaselineContentSha256??'UNKNOWN',
    denseBaselinePackageBytes:values.denseBaselinePackageBytes??'UNKNOWN',
    experts:Object.freeze([]),
    expertCount:0,
    totalExpertArtifactBytes:0,
    totalTrainableParameters:0,
    sharedPathRequired:false,
    fullBackboneExpertAllowed:false,
    packSetEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function assertNoAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_adapter_moe_expert_manifest_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
    standaloneExecutionAllowed:false as const,
    trainingExecutionAllowed:false as const,
    prototypeAssemblyAllowed:false as const,
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_expert_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_expert_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_adapter_moe_expert_schema',
      path+' contains unknown or missing fields',
    );
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_adapter_moe_expert_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_expert_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_adapter_moe_expert_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_expert_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_expert_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_adapter_moe_expert_value',
      path+' must be a safe integer in range',
    );
  }
  return raw as number;
}

function checkedAdd(left:number,right:number,path:string):number{
  const value=left+right;
  if(!Number.isSafeInteger(value)||value<0){
    fail(
      'hsme_adapter_moe_expert_value',
      path+' overflowed safe integer range',
    );
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
    fail(
      'hsme_adapter_moe_expert_hash_port',
      'hash port must return lowercase SHA-256',
    );
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
  throw new HsmeAdapterMoeExpertPackSetV1Error(code,message);
}

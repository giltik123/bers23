import {
  HSME_ADAPTER_MOE_EXPERT_ADAPTER_KINDS_V1,
  type HsmeAdapterMoeExperimentPlanOriginVerifierV1,
  type HsmeAdapterMoeExpertAdapterKindV1,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
  type HsmeAdapterMoeExperimentPlanV1,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-training-spec:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-training-preflight:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeAdapterMoeExpertTrainingResourceCeilingsV1=Readonly<{
  maxTrainingExamples:number;
  maxGpuSeconds:number;
  maxTrainingCostMicrousd:number;
  maxStagedArtifactBytes:number;
  maxTrainableParameters:number;
}>;

export type HsmeAdapterMoeExpertTrainingSpecV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1_SCHEMA;
  expertId:string;
  specialistHypothesis:string;
  adapterKind:HsmeAdapterMoeExpertAdapterKindV1;
  experimentPlanSha256:string;
  denseBaselineDecisionSha256:string;
  denseBaselineContentSha256:string;
  targetModuleSetSha256:string;
  adapterConfigSha256:string;
  trainingCorpusRootSha256:string;
  reproductionContractSha256:string;
  immutableEnvironmentSha256:string;
  trainingToolchainSha256:string;
  trainerEntrypointSha256:string;
  license:string;
  licenseEvidenceSha256:string;
  resourceCeilings:HsmeAdapterMoeExpertTrainingResourceCeilingsV1;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  trainingExecutionAllowed:false;
  workspaceMaterializationAllowed:false;
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

export interface HsmeAdapterMoeExpertTrainingSpecOriginVerifierV1{
  verifyTrainingSpec(
    spec:HsmeAdapterMoeExpertTrainingSpecV1,
    expectedSpecSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1{
  verifyTrainingPreflight(
    preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
    expectedPreflightSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertTrainingPreflightV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID'
    |'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_BLOCKED'
    |'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED';
  blockers:readonly string[];
  experimentPlanSha256:string|'UNKNOWN';
  trainingSpecSha256:string|'UNKNOWN';
  experimentId:string|'UNKNOWN';
  expertId:string|'UNKNOWN';
  specialistHypothesis:string|'UNKNOWN';
  adapterKind:HsmeAdapterMoeExpertAdapterKindV1|'UNKNOWN';
  denseBaselineDecisionSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  denseBaselinePackageBytes:number|'UNKNOWN';
  targetModuleSetSha256:string|'UNKNOWN';
  adapterConfigSha256:string|'UNKNOWN';
  trainingCorpusRootSha256:string|'UNKNOWN';
  reproductionContractSha256:string|'UNKNOWN';
  immutableEnvironmentSha256:string|'UNKNOWN';
  trainingToolchainSha256:string|'UNKNOWN';
  trainerEntrypointSha256:string|'UNKNOWN';
  license:string|'UNKNOWN';
  licenseEvidenceSha256:string|'UNKNOWN';
  resourceCeilings:HsmeAdapterMoeExpertTrainingResourceCeilingsV1|null;
  networkPolicy:'SEALED_INPUTS_ONLY'|'UNKNOWN';
  cacheModelInputPolicy:
    |'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
    |'UNKNOWN';
  preflightEvidenceSha256:string|'UNKNOWN';
  trainingExecutionAllowed:false;
  workspaceMaterializationAllowed:false;
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

export class HsmeAdapterMoeExpertTrainingPreflightV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExpertTrainingPreflightV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeExpertTrainingSpecV1(
  raw:unknown,
):HsmeAdapterMoeExpertTrainingSpecV1{
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
    'trainingCorpusRootSha256',
    'reproductionContractSha256',
    'immutableEnvironmentSha256',
    'trainingToolchainSha256',
    'trainerEntrypointSha256',
    'license',
    'licenseEvidenceSha256',
    'resourceCeilings',
    'networkPolicy',
    'cacheModelInputPolicy',
    'trainingExecutionAllowed',
    'workspaceMaterializationAllowed',
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
  ],'spec');

  if(record.schemaVersion!==HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1_SCHEMA){
    fail('hsme_adapter_moe_training_spec_schema','training spec schema unsupported');
  }
  if(record.networkPolicy!=='SEALED_INPUTS_ONLY'){
    fail(
      'hsme_adapter_moe_training_spec_network',
      'networkPolicy must be SEALED_INPUTS_ONLY',
    );
  }
  if(
    record.cacheModelInputPolicy!==
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
  ){
    fail(
      'hsme_adapter_moe_training_spec_cache',
      'cacheModelInputPolicy unsupported',
    );
  }
  assertNoAuthority(record,'spec');

  const ceilingsRecord=exactRecord(
    record.resourceCeilings,
    [
      'maxTrainingExamples',
      'maxGpuSeconds',
      'maxTrainingCostMicrousd',
      'maxStagedArtifactBytes',
      'maxTrainableParameters',
    ],
    'spec.resourceCeilings',
  );
  const resourceCeilings=deepFreeze({
    maxTrainingExamples:safeInteger(
      ceilingsRecord.maxTrainingExamples,
      'spec.resourceCeilings.maxTrainingExamples',
      1,
      100_000_000,
    ),
    maxGpuSeconds:safeInteger(
      ceilingsRecord.maxGpuSeconds,
      'spec.resourceCeilings.maxGpuSeconds',
      1,
      31_536_000,
    ),
    maxTrainingCostMicrousd:safeInteger(
      ceilingsRecord.maxTrainingCostMicrousd,
      'spec.resourceCeilings.maxTrainingCostMicrousd',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxStagedArtifactBytes:safeInteger(
      ceilingsRecord.maxStagedArtifactBytes,
      'spec.resourceCeilings.maxStagedArtifactBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxTrainableParameters:safeInteger(
      ceilingsRecord.maxTrainableParameters,
      'spec.resourceCeilings.maxTrainableParameters',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  });

  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1_SCHEMA,
    expertId:identifier(record.expertId,'spec.expertId',120),
    specialistHypothesis:identifier(
      record.specialistHypothesis,
      'spec.specialistHypothesis',
      80,
    ),
    adapterKind:enumValue(
      record.adapterKind,
      HSME_ADAPTER_MOE_EXPERT_ADAPTER_KINDS_V1,
      'spec.adapterKind',
    ),
    experimentPlanSha256:sha256(
      record.experimentPlanSha256,
      'spec.experimentPlanSha256',
    ),
    denseBaselineDecisionSha256:sha256(
      record.denseBaselineDecisionSha256,
      'spec.denseBaselineDecisionSha256',
    ),
    denseBaselineContentSha256:sha256(
      record.denseBaselineContentSha256,
      'spec.denseBaselineContentSha256',
    ),
    targetModuleSetSha256:sha256(
      record.targetModuleSetSha256,
      'spec.targetModuleSetSha256',
    ),
    adapterConfigSha256:sha256(
      record.adapterConfigSha256,
      'spec.adapterConfigSha256',
    ),
    trainingCorpusRootSha256:sha256(
      record.trainingCorpusRootSha256,
      'spec.trainingCorpusRootSha256',
    ),
    reproductionContractSha256:sha256(
      record.reproductionContractSha256,
      'spec.reproductionContractSha256',
    ),
    immutableEnvironmentSha256:sha256(
      record.immutableEnvironmentSha256,
      'spec.immutableEnvironmentSha256',
    ),
    trainingToolchainSha256:sha256(
      record.trainingToolchainSha256,
      'spec.trainingToolchainSha256',
    ),
    trainerEntrypointSha256:sha256(
      record.trainerEntrypointSha256,
      'spec.trainerEntrypointSha256',
    ),
    license:boundedString(record.license,'spec.license',180),
    licenseEvidenceSha256:sha256(
      record.licenseEvidenceSha256,
      'spec.licenseEvidenceSha256',
    ),
    resourceCeilings,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoeExpertTrainingSpecV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const spec=normalizeHsmeAdapterMoeExpertTrainingSpecV1(raw);
  return digest(
    HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_DIGEST_DOMAIN,
    spec,
    hash,
  );
}

export async function freezeHsmeAdapterMoeExpertTrainingPreflightV1(
  plan:HsmeAdapterMoeExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeAdapterMoeExperimentPlanOriginVerifierV1,
  rawSpec:unknown,
  expectedSpecSha256:string,
  specOrigin:HsmeAdapterMoeExpertTrainingSpecOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertTrainingPreflightV1>{
  if(
    plan.state!=='ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTER_MOE_EXPERT_TRAINING_FROZEN_PLAN_REQUIRED']);
  }
  if(!validFrozenPlanBoundary(plan)){
    return invalid(['ADAPTER_MOE_EXPERT_TRAINING_PLAN_BOUNDARY_INVALID']);
  }

  let experimentPlanSha256:string;
  try{
    experimentPlanSha256=
      await hsmeAdapterMoeExperimentPlanV1Digest(plan,hash);
  }catch{
    return invalid(['ADAPTER_MOE_EXPERT_TRAINING_PLAN_REHASH_INVALID']);
  }
  const planValues=valuesFromPlan(plan,experimentPlanSha256);
  if(
    !HEX64.test(expectedPlanSha256)
    ||experimentPlanSha256!==expectedPlanSha256
    ||experimentPlanSha256!==plan.planEvidenceSha256
  ){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_PLAN_REHASH_MISMATCH'],
      planValues,
    );
  }
  if(!await verify(
    ()=>planOrigin.verifyExperimentPlan(plan,experimentPlanSha256),
  )){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_PLAN_ORIGIN_UNVERIFIED'],
      planValues,
    );
  }

  let spec:HsmeAdapterMoeExpertTrainingSpecV1;
  let trainingSpecSha256:string;
  try{
    spec=normalizeHsmeAdapterMoeExpertTrainingSpecV1(rawSpec);
    trainingSpecSha256=
      await hsmeAdapterMoeExpertTrainingSpecV1Digest(spec,hash);
  }catch{
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_SPEC_INVALID'],
      planValues,
    );
  }
  const values={...planValues,...valuesFromSpec(spec,trainingSpecSha256)};
  if(
    !HEX64.test(expectedSpecSha256)
    ||trainingSpecSha256!==expectedSpecSha256
  ){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_SPEC_DIGEST_MISMATCH'],
      values,
    );
  }
  if(!await verify(
    ()=>specOrigin.verifyTrainingSpec(spec,trainingSpecSha256),
  )){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_SPEC_ORIGIN_UNVERIFIED'],
      values,
    );
  }

  if(
    spec.experimentPlanSha256!==experimentPlanSha256
    ||spec.denseBaselineDecisionSha256!==plan.denseBaselineDecisionSha256
    ||spec.denseBaselineContentSha256!==plan.denseBaselineContentSha256
  ){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_SPEC_BASELINE_BINDING_MISMATCH'],
      values,
    );
  }
  if(!plan.specialistHypotheses.includes(spec.specialistHypothesis)){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_SPECIALIST_OUTSIDE_FROZEN_ROSTER'],
      values,
    );
  }
  if(
    spec.resourceCeilings.maxStagedArtifactBytes>
      plan.maxExpertArtifactBytes
    ||spec.resourceCeilings.maxStagedArtifactBytes>=
      plan.denseBaselinePackageBytes
  ){
    return invalid(
      ['ADAPTER_MOE_EXPERT_TRAINING_ARTIFACT_BYTES_ESCALATION'],
      values,
    );
  }

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    experimentPlanSha256,
    trainingSpecSha256,
    experimentId:plan.experimentId,
    expertId:spec.expertId,
    specialistHypothesis:spec.specialistHypothesis,
    adapterKind:spec.adapterKind,
    denseBaselineDecisionSha256:plan.denseBaselineDecisionSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    denseBaselinePackageBytes:plan.denseBaselinePackageBytes,
    targetModuleSetSha256:spec.targetModuleSetSha256,
    adapterConfigSha256:spec.adapterConfigSha256,
    trainingCorpusRootSha256:spec.trainingCorpusRootSha256,
    reproductionContractSha256:spec.reproductionContractSha256,
    immutableEnvironmentSha256:spec.immutableEnvironmentSha256,
    trainingToolchainSha256:spec.trainingToolchainSha256,
    trainerEntrypointSha256:spec.trainerEntrypointSha256,
    license:spec.license,
    licenseEvidenceSha256:spec.licenseEvidenceSha256,
    resourceCeilings:spec.resourceCeilings,
    networkPolicy:'SEALED_INPUTS_ONLY' as const,
    cacheModelInputPolicy:
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS' as const,
    ...authorityBoundary(),
  };
  const preflightEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,preflightEvidenceSha256});
}

export async function hsmeAdapterMoeExpertTrainingPreflightV1Digest(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    preflight.state!==
      'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    ||preflight.preflightEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_adapter_moe_training_preflight_digest_state',
      'only READY_NOT_EXECUTED preflights are digestible',
    );
  }
  const {preflightEvidenceSha256:_ignored,...payload}=preflight;
  return digest(
    HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_DIGEST_DOMAIN,
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
  maxExpertArtifactBytes:number;
}{
  return plan.schemaVersion===HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA
    &&plan.blockers.length===0
    &&plan.experimentId!=='UNKNOWN'
    &&plan.denseBaselineDecisionSha256!=='UNKNOWN'
    &&plan.denseBaselineContentSha256!=='UNKNOWN'
    &&typeof plan.denseBaselinePackageBytes==='number'
    &&Number.isSafeInteger(plan.denseBaselinePackageBytes)
    &&plan.denseBaselinePackageBytes>0
    &&typeof plan.maxExpertArtifactBytes==='number'
    &&Number.isSafeInteger(plan.maxExpertArtifactBytes)
    &&plan.maxExpertArtifactBytes>0
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
  HsmeAdapterMoeExpertTrainingPreflightV1,
  'experimentPlanSha256'
  |'trainingSpecSha256'
  |'experimentId'
  |'expertId'
  |'specialistHypothesis'
  |'adapterKind'
  |'denseBaselineDecisionSha256'
  |'denseBaselineContentSha256'
  |'denseBaselinePackageBytes'
  |'targetModuleSetSha256'
  |'adapterConfigSha256'
  |'trainingCorpusRootSha256'
  |'reproductionContractSha256'
  |'immutableEnvironmentSha256'
  |'trainingToolchainSha256'
  |'trainerEntrypointSha256'
  |'license'
  |'licenseEvidenceSha256'
  |'resourceCeilings'
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

function valuesFromSpec(
  spec:HsmeAdapterMoeExpertTrainingSpecV1,
  trainingSpecSha256:string,
):PartialOutput{
  return {
    trainingSpecSha256,
    expertId:spec.expertId,
    specialistHypothesis:spec.specialistHypothesis,
    adapterKind:spec.adapterKind,
    targetModuleSetSha256:spec.targetModuleSetSha256,
    adapterConfigSha256:spec.adapterConfigSha256,
    trainingCorpusRootSha256:spec.trainingCorpusRootSha256,
    reproductionContractSha256:spec.reproductionContractSha256,
    immutableEnvironmentSha256:spec.immutableEnvironmentSha256,
    trainingToolchainSha256:spec.trainingToolchainSha256,
    trainerEntrypointSha256:spec.trainerEntrypointSha256,
    license:spec.license,
    licenseEvidenceSha256:spec.licenseEvidenceSha256,
    resourceCeilings:spec.resourceCeilings,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertTrainingPreflightV1{
  return terminal(
    'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertTrainingPreflightV1{
  return terminal(
    'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID'
    |'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoeExpertTrainingPreflightV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    trainingSpecSha256:values.trainingSpecSha256??'UNKNOWN',
    experimentId:values.experimentId??'UNKNOWN',
    expertId:values.expertId??'UNKNOWN',
    specialistHypothesis:values.specialistHypothesis??'UNKNOWN',
    adapterKind:values.adapterKind??'UNKNOWN',
    denseBaselineDecisionSha256:
      values.denseBaselineDecisionSha256??'UNKNOWN',
    denseBaselineContentSha256:
      values.denseBaselineContentSha256??'UNKNOWN',
    denseBaselinePackageBytes:values.denseBaselinePackageBytes??'UNKNOWN',
    targetModuleSetSha256:values.targetModuleSetSha256??'UNKNOWN',
    adapterConfigSha256:values.adapterConfigSha256??'UNKNOWN',
    trainingCorpusRootSha256:values.trainingCorpusRootSha256??'UNKNOWN',
    reproductionContractSha256:
      values.reproductionContractSha256??'UNKNOWN',
    immutableEnvironmentSha256:values.immutableEnvironmentSha256??'UNKNOWN',
    trainingToolchainSha256:values.trainingToolchainSha256??'UNKNOWN',
    trainerEntrypointSha256:values.trainerEntrypointSha256??'UNKNOWN',
    license:values.license??'UNKNOWN',
    licenseEvidenceSha256:values.licenseEvidenceSha256??'UNKNOWN',
    resourceCeilings:values.resourceCeilings??null,
    networkPolicy:'UNKNOWN',
    cacheModelInputPolicy:'UNKNOWN',
    preflightEvidenceSha256:'UNKNOWN',
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
        'hsme_adapter_moe_training_spec_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
    trainingExecutionAllowed:false as const,
    workspaceMaterializationAllowed:false as const,
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
    fail('hsme_adapter_moe_training_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_training_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_adapter_moe_training_schema',
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
    fail('hsme_adapter_moe_training_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_training_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_adapter_moe_training_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_training_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_training_value',path+' is invalid');
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
      'hsme_adapter_moe_training_value',
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
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_adapter_moe_training_hash_port',
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
  throw new HsmeAdapterMoeExpertTrainingPreflightV1Error(code,message);
}

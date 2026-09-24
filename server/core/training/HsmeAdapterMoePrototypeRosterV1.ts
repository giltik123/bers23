import {
  hsmeAdapterMoeExperimentPlanV1Digest,
  type HsmeAdapterMoeComparisonVariantV1,
  type HsmeAdapterMoeExperimentPlanV1,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  hsmeAdapterMoeExpertPackSetV1Digest,
  type HsmeAdapterMoeExpertPackSetV1,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import {
  hsmeAdapterMoeExpertRealRunEvidenceV1Digest,
  type HsmeAdapterMoeExpertRealRunEvidenceV1,
} from './HsmeAdapterMoeExpertRealRunEvidenceV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1' as const;
export const HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-prototype-assembly-attestation:v1\0' as const;
export const HSME_ADAPTER_MOE_PROTOTYPE_ENTRY_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-prototype-entry:v1\0' as const;
export const HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1' as const;
export const HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-prototype-roster:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

const PROTOTYPE_VARIANTS=Object.freeze([
  'SHARED_TOP1_ADAPTER',
  'SHARED_TOP2_ADAPTER',
  'DENSE_TO_SPARSE_SECONDARY',
] as const);
const ROUTER_KINDS=Object.freeze([
  'TASK_COARSE_STATIC',
  'BLOCK_COARSE_STATIC',
  'LEARNED_BOUNDED_ROUTER',
] as const);

export type HsmeAdapterMoePrototypeVariantV1=
  typeof PROTOTYPE_VARIANTS[number];
export type HsmeAdapterMoeRouterKindV1=typeof ROUTER_KINDS[number];

export type HsmeAdapterMoePrototypeAssemblyAttestationV1=Readonly<{
  schemaVersion:
    typeof HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1_SCHEMA;
  experimentPlanSha256:string;
  expertPackSetSha256:string;
  variant:HsmeAdapterMoePrototypeVariantV1;
  routerKind:HsmeAdapterMoeRouterKindV1;
  routerContentSha256:string;
  routerConfigSha256:string;
  routerBytes:number;
  routerUri:string;
  routerRevision:string;
  routerToolchainSha256:string;
  routerLicense:string;
  routerLicenseEvidenceSha256:string;
  expertIds:readonly string[];
  maxActiveExperts:1|2;
  sharedPathRequired:true;
  deterministicReplayRequired:true;
  fullBackboneExpertAllowed:false;
  reviewState:'R_AND_D_ASSEMBLY_REVIEWED';
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

export type HsmeAdapterMoeExpertRealEvidenceBindingV1=Readonly<{
  evidence:HsmeAdapterMoeExpertRealRunEvidenceV1;
  expectedEvidenceSha256:string;
}>;

export type HsmeAdapterMoePrototypeAssemblyBindingV1=Readonly<{
  rawAttestation:unknown;
  expectedAttestationSha256:string;
}>;

export interface HsmeAdapterMoePrototypePlanOriginVerifierV1{
  verifyExperimentPlan(
    plan:HsmeAdapterMoeExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdapterMoePrototypePackSetOriginVerifierV1{
  verifyExpertPackSet(
    packSet:HsmeAdapterMoeExpertPackSetV1,
    expectedPackSetSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdapterMoePrototypeRealEvidenceOriginVerifierV1{
  verifyRealExpertEvidence(
    evidence:HsmeAdapterMoeExpertRealRunEvidenceV1,
    expectedEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface HsmeAdapterMoePrototypeAssemblyAttestationOriginVerifierV1{
  verifyAssemblyAttestation(
    attestation:HsmeAdapterMoePrototypeAssemblyAttestationV1,
    expectedAttestationSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoePrototypeEntryV1=Readonly<{
  variant:HsmeAdapterMoePrototypeVariantV1;
  routerKind:HsmeAdapterMoeRouterKindV1;
  routerContentSha256:string;
  routerConfigSha256:string;
  routerBytes:number;
  routerUri:string;
  routerRevision:string;
  routerToolchainSha256:string;
  routerLicense:string;
  routerLicenseEvidenceSha256:string;
  expertIds:readonly string[];
  expertManifestSha256s:readonly string[];
  expertContentSha256s:readonly string[];
  maxActiveExperts:1|2;
  sharedPathRequired:true;
  deterministicReplayRequired:true;
  fullBackboneExpertAllowed:false;
  denseBaselinePackageBytes:number;
  totalExpertArtifactBytes:number;
  packageBytes:number;
  assemblyAttestationSha256:string;
  prototypeSha256:string;
}>;

export type HsmeAdapterMoePrototypeRosterV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA;
  state:
    |'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID'
    |'ADAPTER_MOE_PROTOTYPE_ROSTER_BLOCKED'
    |'ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED';
  blockers:readonly string[];
  experimentPlanSha256:string|'UNKNOWN';
  expertPackSetSha256:string|'UNKNOWN';
  denseBaselineDecisionSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  denseBaselinePackageBytes:number|'UNKNOWN';
  realEvidenceSha256s:readonly string[];
  prototypes:readonly HsmeAdapterMoePrototypeEntryV1[];
  rosterEvidenceSha256:string|'UNKNOWN';
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

export class HsmeAdapterMoePrototypeRosterV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoePrototypeRosterV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoePrototypeAssemblyAttestationV1(
  raw:unknown,
):HsmeAdapterMoePrototypeAssemblyAttestationV1{
  const record=exactRecord(raw,[
    'schemaVersion','experimentPlanSha256','expertPackSetSha256','variant',
    'routerKind','routerContentSha256','routerConfigSha256','routerBytes',
    'routerUri','routerRevision','routerToolchainSha256','routerLicense',
    'routerLicenseEvidenceSha256','expertIds','maxActiveExperts',
    'sharedPathRequired','deterministicReplayRequired',
    'fullBackboneExpertAllowed','reviewState','inferenceExecutionAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'attestation');
  if(
    record.schemaVersion!==
      HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1_SCHEMA
  ){
    fail('hsme_adapter_moe_prototype_attestation_schema','assembly attestation schema unsupported');
  }
  if(record.reviewState!=='R_AND_D_ASSEMBLY_REVIEWED'){
    fail('hsme_adapter_moe_prototype_attestation_review','assembly review state invalid');
  }
  if(
    record.sharedPathRequired!==true
    ||record.deterministicReplayRequired!==true
    ||record.fullBackboneExpertAllowed!==false
  ){
    fail('hsme_adapter_moe_prototype_attestation_boundary','assembly topology boundary invalid');
  }
  assertNoAuthority(record,'attestation');
  const routerRevision=boundedString(
    record.routerRevision,
    'attestation.routerRevision',
    64,
  );
  if(!IMMUTABLE_REVISION.test(routerRevision)){
    fail('hsme_adapter_moe_prototype_router_revision','routerRevision must be immutable 40- or 64-hex');
  }
  if(!Array.isArray(record.expertIds)||record.expertIds.length<1||record.expertIds.length>8){
    fail('hsme_adapter_moe_prototype_expert_ids','expertIds must contain 1..8 entries');
  }
  const expertIds=record.expertIds.map(
    (value,index)=>identifier(value,'attestation.expertIds['+index+']',120),
  ).sort(lexical);
  if(new Set(expertIds).size!==expertIds.length){
    fail('hsme_adapter_moe_prototype_expert_ids','expertIds must be unique');
  }
  const maxActiveExperts=record.maxActiveExperts;
  if(maxActiveExperts!==1&&maxActiveExperts!==2){
    fail('hsme_adapter_moe_prototype_topk','maxActiveExperts must be 1 or 2');
  }
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1_SCHEMA,
    experimentPlanSha256:sha256(
      record.experimentPlanSha256,
      'attestation.experimentPlanSha256',
    ),
    expertPackSetSha256:sha256(
      record.expertPackSetSha256,
      'attestation.expertPackSetSha256',
    ),
    variant:enumValue(record.variant,PROTOTYPE_VARIANTS,'attestation.variant'),
    routerKind:enumValue(record.routerKind,ROUTER_KINDS,'attestation.routerKind'),
    routerContentSha256:sha256(
      record.routerContentSha256,
      'attestation.routerContentSha256',
    ),
    routerConfigSha256:sha256(
      record.routerConfigSha256,
      'attestation.routerConfigSha256',
    ),
    routerBytes:safeInteger(
      record.routerBytes,
      'attestation.routerBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    routerUri:boundedString(record.routerUri,'attestation.routerUri',500),
    routerRevision,
    routerToolchainSha256:sha256(
      record.routerToolchainSha256,
      'attestation.routerToolchainSha256',
    ),
    routerLicense:boundedString(
      record.routerLicense,
      'attestation.routerLicense',
      180,
    ),
    routerLicenseEvidenceSha256:sha256(
      record.routerLicenseEvidenceSha256,
      'attestation.routerLicenseEvidenceSha256',
    ),
    expertIds:Object.freeze(expertIds),
    maxActiveExperts,
    sharedPathRequired:true,
    deterministicReplayRequired:true,
    fullBackboneExpertAllowed:false,
    reviewState:'R_AND_D_ASSEMBLY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoePrototypeAssemblyAttestationV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const attestation=normalizeHsmeAdapterMoePrototypeAssemblyAttestationV1(raw);
  return digest(
    HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_DIGEST_DOMAIN,
    attestation,
    hash,
  );
}

export async function assembleHsmeAdapterMoePrototypeRosterV1(
  plan:HsmeAdapterMoeExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeAdapterMoePrototypePlanOriginVerifierV1,
  packSet:HsmeAdapterMoeExpertPackSetV1,
  expectedPackSetSha256:string,
  packSetOrigin:HsmeAdapterMoePrototypePackSetOriginVerifierV1,
  realBindings:readonly HsmeAdapterMoeExpertRealEvidenceBindingV1[],
  realEvidenceOrigin:HsmeAdapterMoePrototypeRealEvidenceOriginVerifierV1,
  assemblyBindings:readonly HsmeAdapterMoePrototypeAssemblyBindingV1[],
  assemblyOrigin:HsmeAdapterMoePrototypeAssemblyAttestationOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoePrototypeRosterV1>{
  if(
    plan.state!=='ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTER_MOE_PROTOTYPE_FROZEN_PLAN_REQUIRED']);
  }
  if(
    packSet.state!=='ADAPTER_MOE_EXPERT_PACK_SET_READY_NOT_ASSEMBLED'
    ||packSet.packSetEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['ADAPTER_MOE_PROTOTYPE_READY_PACK_SET_REQUIRED']);
  }

  let experimentPlanSha256:string;
  let expertPackSetSha256:string;
  try{
    experimentPlanSha256=await hsmeAdapterMoeExperimentPlanV1Digest(plan,hash);
    expertPackSetSha256=await hsmeAdapterMoeExpertPackSetV1Digest(packSet,hash);
  }catch{
    return invalid(['ADAPTER_MOE_PROTOTYPE_INPUT_REHASH_INVALID']);
  }
  const common=commonValues(plan,packSet,experimentPlanSha256,expertPackSetSha256);
  if(
    !HEX64.test(expectedPlanSha256)
    ||experimentPlanSha256!==expectedPlanSha256
    ||experimentPlanSha256!==plan.planEvidenceSha256
  ){
    return invalid(['ADAPTER_MOE_PROTOTYPE_PLAN_REHASH_MISMATCH'],common);
  }
  if(
    !HEX64.test(expectedPackSetSha256)
    ||expertPackSetSha256!==expectedPackSetSha256
    ||expertPackSetSha256!==packSet.packSetEvidenceSha256
  ){
    return invalid(['ADAPTER_MOE_PROTOTYPE_PACK_SET_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyExperimentPlan(plan,experimentPlanSha256))){
    return invalid(['ADAPTER_MOE_PROTOTYPE_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(
    ()=>packSetOrigin.verifyExpertPackSet(packSet,expertPackSetSha256),
  )){
    return invalid(['ADAPTER_MOE_PROTOTYPE_PACK_SET_ORIGIN_UNVERIFIED'],common);
  }
  if(!packSetBindsPlan(plan,packSet,experimentPlanSha256)){
    return invalid(['ADAPTER_MOE_PROTOTYPE_PACK_SET_BINDING_MISMATCH'],common);
  }

  const realEvidenceSha256s=await verifyRealEvidenceCoverage(
    plan,
    packSet,
    realBindings,
    realEvidenceOrigin,
    hash,
  );
  if(realEvidenceSha256s===null){
    return invalid(['ADAPTER_MOE_PROTOTYPE_REAL_EVIDENCE_COVERAGE_INVALID'],common);
  }

  if(!Array.isArray(assemblyBindings)||assemblyBindings.length<2||assemblyBindings.length>3){
    return invalid(
      ['ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_COUNT_INVALID'],
      {...common,realEvidenceSha256s},
    );
  }

  const prototypes:HsmeAdapterMoePrototypeEntryV1[]=[];
  const seenVariants=new Set<string>();
  for(const binding of assemblyBindings){
    let attestation:HsmeAdapterMoePrototypeAssemblyAttestationV1;
    let assemblyAttestationSha256:string;
    try{
      attestation=normalizeHsmeAdapterMoePrototypeAssemblyAttestationV1(
        binding.rawAttestation,
      );
      assemblyAttestationSha256=
        await hsmeAdapterMoePrototypeAssemblyAttestationV1Digest(
          attestation,
          hash,
        );
    }catch{
      return invalid(
        ['ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_INVALID'],
        {...common,realEvidenceSha256s},
      );
    }
    if(
      !HEX64.test(binding.expectedAttestationSha256)
      ||assemblyAttestationSha256!==binding.expectedAttestationSha256
    ){
      return invalid(
        ['ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_REHASH_MISMATCH'],
        {...common,realEvidenceSha256s},
      );
    }
    if(!await verify(
      ()=>assemblyOrigin.verifyAssemblyAttestation(
        attestation,
        assemblyAttestationSha256,
      ),
    )){
      return invalid(
        ['ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_ORIGIN_UNVERIFIED'],
        {...common,realEvidenceSha256s},
      );
    }
    if(seenVariants.has(attestation.variant)){
      return invalid(
        ['ADAPTER_MOE_PROTOTYPE_DUPLICATE_VARIANT'],
        {...common,realEvidenceSha256s},
      );
    }
    seenVariants.add(attestation.variant);

    const entry=await derivePrototypeEntry(
      plan,
      packSet,
      experimentPlanSha256,
      expertPackSetSha256,
      attestation,
      assemblyAttestationSha256,
      hash,
    );
    if(entry===null){
      return invalid(
        ['ADAPTER_MOE_PROTOTYPE_ASSEMBLY_BINDING_INVALID'],
        {...common,realEvidenceSha256s},
      );
    }
    prototypes.push(entry);
  }

  if(
    !seenVariants.has('SHARED_TOP1_ADAPTER')
    ||!seenVariants.has('SHARED_TOP2_ADAPTER')
  ){
    return invalid(
      ['ADAPTER_MOE_PROTOTYPE_MANDATORY_VARIANTS_MISSING'],
      {...common,realEvidenceSha256s},
    );
  }
  prototypes.sort((left,right)=>
    PROTOTYPE_VARIANTS.indexOf(left.variant)-
    PROTOTYPE_VARIANTS.indexOf(right.variant)
  );

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA,
    state:'ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    experimentPlanSha256,
    expertPackSetSha256,
    denseBaselineDecisionSha256:packSet.denseBaselineDecisionSha256,
    denseBaselineContentSha256:packSet.denseBaselineContentSha256,
    denseBaselinePackageBytes:packSet.denseBaselinePackageBytes,
    realEvidenceSha256s:Object.freeze([...realEvidenceSha256s].sort(lexical)),
    prototypes:Object.freeze(prototypes),
    ...authorityBoundary(),
  };
  const rosterEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,rosterEvidenceSha256});
}

export async function hsmeAdapterMoePrototypeRosterV1Digest(
  roster:HsmeAdapterMoePrototypeRosterV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    roster.state!=='ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED'
    ||roster.rosterEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_adapter_moe_prototype_roster_digest_state','only READY_NOT_EXECUTED roster is digestible');
  }
  const {rosterEvidenceSha256:_ignored,...payload}=roster;
  return digest(HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_DIGEST_DOMAIN,payload,hash);
}

async function verifyRealEvidenceCoverage(
  plan:HsmeAdapterMoeExperimentPlanV1,
  packSet:HsmeAdapterMoeExpertPackSetV1,
  bindings:readonly HsmeAdapterMoeExpertRealEvidenceBindingV1[],
  origin:HsmeAdapterMoePrototypeRealEvidenceOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<readonly string[]|null>{
  if(
    !Array.isArray(bindings)
    ||bindings.length!==packSet.experts.length
  ){
    return null;
  }
  const seen=new Set<string>();
  const digests:string[]=[];
  for(const binding of bindings){
    const evidence=binding.evidence;
    if(
      evidence.state!=='ADAPTER_MOE_EXPERT_REAL_RUN_READY_NOT_PACKED'
      ||evidence.realProtectedExecution!==true
      ||evidence.manifest===null
      ||evidence.manifestSha256==='UNKNOWN'
      ||evidence.evidenceSha256.length!==64
      ||evidence.experimentPlanSha256!==plan.planEvidenceSha256
    ){
      return null;
    }
    let evidenceSha256:string;
    try{
      evidenceSha256=
        await hsmeAdapterMoeExpertRealRunEvidenceV1Digest(evidence,hash);
    }catch{
      return null;
    }
    if(
      !HEX64.test(binding.expectedEvidenceSha256)
      ||evidenceSha256!==binding.expectedEvidenceSha256
      ||evidenceSha256!==evidence.evidenceSha256
      ||!await verify(()=>origin.verifyRealExpertEvidence(evidence,evidenceSha256))
    ){
      return null;
    }
    const matching=packSet.experts.find(entry=>
      entry.manifest.expertId===evidence.expertId
    );
    if(
      matching===undefined
      ||matching.manifestSha256!==evidence.manifestSha256
      ||matching.manifest.contentSha256!==evidence.manifest.contentSha256
      ||matching.manifest.expertId!==evidence.manifest.expertId
      ||seen.has(evidence.manifestSha256)
    ){
      return null;
    }
    seen.add(evidence.manifestSha256);
    digests.push(evidenceSha256);
  }
  if(packSet.experts.some(entry=>!seen.has(entry.manifestSha256))){
    return null;
  }
  return Object.freeze(digests.sort(lexical));
}

async function derivePrototypeEntry(
  plan:HsmeAdapterMoeExperimentPlanV1,
  packSet:HsmeAdapterMoeExpertPackSetV1,
  planSha:string,
  packSetSha:string,
  attestation:HsmeAdapterMoePrototypeAssemblyAttestationV1,
  attestationSha:string,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoePrototypeEntryV1|null>{
  if(
    attestation.experimentPlanSha256!==planSha
    ||attestation.expertPackSetSha256!==packSetSha
    ||!plan.comparisonVariants.includes(
      attestation.variant as HsmeAdapterMoeComparisonVariantV1,
    )
  ){
    return null;
  }
  const requiredTopK=
    attestation.variant==='SHARED_TOP1_ADAPTER'
      ?1
      :attestation.variant==='SHARED_TOP2_ADAPTER'
        ?2
        :attestation.maxActiveExperts;
  if(
    attestation.maxActiveExperts!==requiredTopK
    ||typeof plan.maxActiveSpecialistsPerDecision!=='number'
    ||attestation.maxActiveExperts>plan.maxActiveSpecialistsPerDecision
  ){
    return null;
  }
  const canonicalExperts=[...packSet.experts]
    .sort((left,right)=>lexical(left.manifest.expertId,right.manifest.expertId));
  const expertIds=canonicalExperts.map(entry=>entry.manifest.expertId);
  if(JSON.stringify(expertIds)!==JSON.stringify(attestation.expertIds)){
    return null;
  }
  if(
    typeof packSet.denseBaselinePackageBytes!=='number'
    ||!Number.isSafeInteger(packSet.denseBaselinePackageBytes)
  ){
    return null;
  }
  const packageBytes=checkedAdd(
    checkedAdd(
      packSet.denseBaselinePackageBytes,
      packSet.totalExpertArtifactBytes,
      'prototype.packageBytes',
    ),
    attestation.routerBytes,
    'prototype.packageBytes',
  );
  const payload={
    variant:attestation.variant,
    routerKind:attestation.routerKind,
    routerContentSha256:attestation.routerContentSha256,
    routerConfigSha256:attestation.routerConfigSha256,
    routerBytes:attestation.routerBytes,
    routerUri:attestation.routerUri,
    routerRevision:attestation.routerRevision,
    routerToolchainSha256:attestation.routerToolchainSha256,
    routerLicense:attestation.routerLicense,
    routerLicenseEvidenceSha256:attestation.routerLicenseEvidenceSha256,
    expertIds:Object.freeze(expertIds),
    expertManifestSha256s:Object.freeze(
      canonicalExperts.map(entry=>entry.manifestSha256),
    ),
    expertContentSha256s:Object.freeze(
      canonicalExperts.map(entry=>entry.manifest.contentSha256),
    ),
    maxActiveExperts:attestation.maxActiveExperts,
    sharedPathRequired:true as const,
    deterministicReplayRequired:true as const,
    fullBackboneExpertAllowed:false as const,
    denseBaselinePackageBytes:packSet.denseBaselinePackageBytes,
    totalExpertArtifactBytes:packSet.totalExpertArtifactBytes,
    packageBytes,
    assemblyAttestationSha256:attestationSha,
  };
  const prototypeSha256=await digest(
    HSME_ADAPTER_MOE_PROTOTYPE_ENTRY_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,prototypeSha256});
}

function packSetBindsPlan(
  plan:HsmeAdapterMoeExperimentPlanV1,
  packSet:HsmeAdapterMoeExpertPackSetV1,
  planSha:string,
):boolean{
  return packSet.experimentPlanSha256===planSha
    &&packSet.denseBaselineDecisionSha256===plan.denseBaselineDecisionSha256
    &&packSet.denseBaselineContentSha256===plan.denseBaselineContentSha256
    &&packSet.denseBaselinePackageBytes===plan.denseBaselinePackageBytes
    &&packSet.sharedPathRequired===true
    &&packSet.fullBackboneExpertAllowed===false;
}

type PartialOutput=Partial<Pick<
  HsmeAdapterMoePrototypeRosterV1,
  'experimentPlanSha256'|'expertPackSetSha256'
  |'denseBaselineDecisionSha256'|'denseBaselineContentSha256'
  |'denseBaselinePackageBytes'|'realEvidenceSha256s'
>>;

function commonValues(
  plan:HsmeAdapterMoeExperimentPlanV1,
  packSet:HsmeAdapterMoeExpertPackSetV1,
  planSha:string,
  packSetSha:string,
):PartialOutput{
  return {
    experimentPlanSha256:planSha,
    expertPackSetSha256:packSetSha,
    denseBaselineDecisionSha256:packSet.denseBaselineDecisionSha256,
    denseBaselineContentSha256:packSet.denseBaselineContentSha256,
    denseBaselinePackageBytes:packSet.denseBaselinePackageBytes,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoePrototypeRosterV1{
  return terminal('ADAPTER_MOE_PROTOTYPE_ROSTER_BLOCKED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoePrototypeRosterV1{
  return terminal('ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID',blockers,values);
}

function terminal(
  state:
    |'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID'
    |'ADAPTER_MOE_PROTOTYPE_ROSTER_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoePrototypeRosterV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_PROTOTYPE_ROSTER_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    expertPackSetSha256:values.expertPackSetSha256??'UNKNOWN',
    denseBaselineDecisionSha256:
      values.denseBaselineDecisionSha256??'UNKNOWN',
    denseBaselineContentSha256:
      values.denseBaselineContentSha256??'UNKNOWN',
    denseBaselinePackageBytes:values.denseBaselinePackageBytes??'UNKNOWN',
    realEvidenceSha256s:values.realEvidenceSha256s??Object.freeze([]),
    prototypes:Object.freeze([]),
    rosterEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail('hsme_adapter_moe_prototype_authority',path+'.'+field+' must remain false');
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_prototype_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_prototype_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_prototype_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_adapter_moe_prototype_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_prototype_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_prototype_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_prototype_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_prototype_value',path+' is invalid');
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
    fail('hsme_adapter_moe_prototype_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function checkedAdd(left:number,right:number,path:string):number{
  const value=left+right;
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_adapter_moe_prototype_value',path+' overflowed safe integer range');
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
    fail('hsme_adapter_moe_prototype_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeAdapterMoePrototypeRosterV1Error(code,message);
}

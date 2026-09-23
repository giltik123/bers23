import {
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactSourceV1,
} from './HsmeTeacherArtifactManifestV1';
import {
  HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN,
  HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA,
  HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN,
  type HsmeTeacherQualityBakeoffAssemblyV1,
} from './HsmeTeacherQualityBakeoffAssemblyV1';
import {
  HSME_TEACHER_ROSTER_REFRESH_DIGEST_DOMAIN,
  HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA,
  normalizeAssembledHsmeTeacherQualityBakeoffV1,
  type HsmeTeacherDecisionRosterRefreshV1,
} from './HsmeTeacherDecisionRosterRefreshV1';
import {
  hsmeTeacherLicenseReviewDigestV1,
  hsmeTeacherToolchainDigestV1,
  normalizeHsmeTeacherLicenseReviewV1,
  normalizeHsmeTeacherToolchainV1,
  type HsmeTeacherLicenseReviewV1,
  type HsmeTeacherToolchainV1,
} from './HsmeTeacherTrustEvidenceV1';
import {
  hsmeTrainingProvenanceDigestV1,
  normalizeHsmeTeacherDecisionV1,
  type HsmeTrainingHashPortV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA =
  'BERS_HSME_TEACHER_ADMISSION_ELIGIBILITY_V1' as const;
export const HSME_TEACHER_ADMISSION_ELIGIBILITY_DIGEST_DOMAIN =
  'bers:hsme:teacher-admission-eligibility:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const WEIGHT_ROLES=new Set(['DENOISER_WEIGHT','TEXT_ENCODER_WEIGHT','VAE_WEIGHT']);

export interface HsmeTeacherAdmissionEligibilityOriginVerifierV1{
  verifyRosterRefresh(
    proof:HsmeTeacherDecisionRosterRefreshV1,
    proofSha256:string,
  ):Promise<boolean>;
  verifyQualityAssembly(
    assembly:HsmeTeacherQualityBakeoffAssemblyV1,
    assemblySha256:string,
  ):Promise<boolean>;
  verifyManifest(
    manifest:HsmeTeacherArtifactManifestV1,
    manifestSha256:string,
  ):Promise<boolean>;
  verifyLicenseReview(
    review:HsmeTeacherLicenseReviewV1,
    reviewSha256:string,
  ):Promise<boolean>;
  verifyToolchain(
    toolchain:HsmeTeacherToolchainV1,
    toolchainSha256:string,
  ):Promise<boolean>;
}

export type HsmeTeacherAdmissionEligibilityEntryV1=Readonly<{
  teacherCandidateId:string;
  eligible:boolean;
  blockers:readonly string[];
  manifestSha256:string;
  qualityGatePassed:boolean;
  capabilities:readonly string[];
  licenseReviewSha256:string|'UNKNOWN';
  toolchainSha256:string|'UNKNOWN';
  installedBytes:number;
  workingMemoryBytes:number|'UNKNOWN';
  workingMemoryKind:'MEASURED'|'ESTIMATED'|'UNKNOWN';
}>;

export type HsmeTeacherAdmissionEligibilityV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA;
  state:'ELIGIBILITY_INVALID'|'ELIGIBILITY_BLOCKED'|'ELIGIBILITY_READY';
  blockers:readonly string[];
  rosterRefreshSha256:string|'UNKNOWN';
  refreshedDecisionSha256:string|'UNKNOWN';
  qualityBakeoffAssemblySha256:string|'UNKNOWN';
  requiredCapabilities:readonly string[];
  entries:readonly HsmeTeacherAdmissionEligibilityEntryV1[];
  eligibleTeacherIds:readonly string[];
  eligibilityEvidenceSha256:string|'UNKNOWN';
  teacherSelectionAllowed:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function proveHsmeTeacherAdmissionEligibilityV1(
  rosterRefresh:HsmeTeacherDecisionRosterRefreshV1,
  qualityAssembly:HsmeTeacherQualityBakeoffAssemblyV1,
  rawManifests:readonly unknown[],
  rawLicenseReviews:readonly unknown[],
  rawToolchains:readonly unknown[],
  origin:HsmeTeacherAdmissionEligibilityOriginVerifierV1,
  hash:HsmeTrainingHashPortV1,
):Promise<HsmeTeacherAdmissionEligibilityV1>{
  const invalidBlockers:string[]=[];

  if(!rosterRefresh
    ||rosterRefresh.schemaVersion!==HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA
    ||rosterRefresh.state!=='ROSTER_REFRESH_READY'
    ||rosterRefresh.blockers.length!==0
    ||rosterRefresh.refreshedDecision===null){
    return invalid(['ELIGIBILITY_ROSTER_REFRESH_NOT_READY']);
  }
  if(rosterAuthorityWidened(rosterRefresh)){
    return invalid(['ELIGIBILITY_ROSTER_REFRESH_AUTHORITY_WIDENING']);
  }

  let refreshedDecision;
  let refreshedDecisionSha256:string|'UNKNOWN'='UNKNOWN';
  let rosterRefreshSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    refreshedDecision=normalizeHsmeTeacherDecisionV1(rosterRefresh.refreshedDecision);
    if(refreshedDecision.decisionStatus!=='REDESIGN_REQUIRED'
      ||refreshedDecision.selectedCandidateIds.length!==0){
      invalidBlockers.push('ELIGIBILITY_REFRESHED_DECISION_NOT_REDESIGN');
    }
    refreshedDecisionSha256=await hsmeTrainingProvenanceDigestV1(refreshedDecision,hash);
    if(refreshedDecisionSha256!==rosterRefresh.refreshedDecisionSha256){
      invalidBlockers.push('ELIGIBILITY_REFRESHED_DECISION_REHASH_MISMATCH');
    }
    rosterRefreshSha256=await digest(
      HSME_TEACHER_ROSTER_REFRESH_DIGEST_DOMAIN,
      rosterRefreshPayload(rosterRefresh),
      hash,
    );
    if(rosterRefreshSha256!==rosterRefresh.rosterRefreshSha256){
      invalidBlockers.push('ELIGIBILITY_ROSTER_REFRESH_REHASH_MISMATCH');
    }else if(!await verifyOrigin(
      ()=>origin.verifyRosterRefresh(rosterRefresh,rosterRefreshSha256 as string),
    )){
      invalidBlockers.push('ELIGIBILITY_ROSTER_REFRESH_ORIGIN_UNVERIFIED');
    }
  }catch{
    return invalid(['ELIGIBILITY_ROSTER_REFRESH_REHASH_INVALID']);
  }

  let normalizedQualityAssembly:HsmeTeacherQualityBakeoffAssemblyV1;
  let qualityBakeoffAssemblySha256:string|'UNKNOWN'='UNKNOWN';
  try{
    normalizedQualityAssembly=normalizeQualityAssembly(qualityAssembly);
  }catch{
    return invalid(['ELIGIBILITY_QUALITY_ASSEMBLY_INVALID'],{
      rosterRefreshSha256,
      refreshedDecisionSha256,
    });
  }
  try{
    const bakeoffSha256=await digest(
      HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN,
      normalizedQualityAssembly.bakeoff,
      hash,
    );
    if(bakeoffSha256!==normalizedQualityAssembly.bakeoffSha256){
      invalidBlockers.push('ELIGIBILITY_QUALITY_BAKEOFF_REHASH_MISMATCH');
    }
    qualityBakeoffAssemblySha256=await digest(
      HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN,
      qualityAssemblyPayload(normalizedQualityAssembly),
      hash,
    );
    if(qualityBakeoffAssemblySha256!==normalizedQualityAssembly.bakeoffAssemblySha256){
      invalidBlockers.push('ELIGIBILITY_QUALITY_ASSEMBLY_REHASH_MISMATCH');
    }else if(!await verifyOrigin(
      ()=>origin.verifyQualityAssembly(
        normalizedQualityAssembly,
        qualityBakeoffAssemblySha256 as string,
      ),
    )){
      invalidBlockers.push('ELIGIBILITY_QUALITY_ASSEMBLY_ORIGIN_UNVERIFIED');
    }
    if(qualityBakeoffAssemblySha256!==rosterRefresh.qualityBakeoffAssemblySha256){
      invalidBlockers.push('ELIGIBILITY_ROSTER_QUALITY_BINDING_MISMATCH');
    }
  }catch{
    return invalid(['ELIGIBILITY_QUALITY_ASSEMBLY_REHASH_INVALID'],{
      rosterRefreshSha256,
      refreshedDecisionSha256,
    });
  }

  const manifests=new Map<string,HsmeTeacherArtifactManifestV1>();
  const manifestSha=new Map<string,string>();
  if(!Array.isArray(rawManifests)
    ||rawManifests.length!==refreshedDecision.candidates.length){
    invalidBlockers.push('ELIGIBILITY_MANIFEST_SET_CARDINALITY_INVALID');
  }else{
    for(const raw of rawManifests){
      try{
        const manifest=normalizeHsmeTeacherArtifactManifestV1(raw);
        if(manifests.has(manifest.teacherCandidateId)){
          invalidBlockers.push('ELIGIBILITY_MANIFEST_DUPLICATE');
          continue;
        }
        if(manifest.artifacts.some(value=>value.role==='RUNTIME_CODE')){
          invalidBlockers.push('ELIGIBILITY_MANIFEST_RUNTIME_CODE_FORBIDDEN');
        }
        const sha=await hsmeTeacherArtifactManifestDigestV1(manifest,hash);
        if(!await verifyOrigin(()=>origin.verifyManifest(manifest,sha))){
          invalidBlockers.push('ELIGIBILITY_MANIFEST_ORIGIN_UNVERIFIED');
        }
        manifests.set(manifest.teacherCandidateId,manifest);
        manifestSha.set(manifest.teacherCandidateId,sha);
      }catch{
        invalidBlockers.push('ELIGIBILITY_MANIFEST_INVALID');
      }
    }
  }

  const licenseById=new Map<string,HsmeTeacherLicenseReviewV1>();
  const licenseShaById=new Map<string,string>();
  if(!Array.isArray(rawLicenseReviews)||rawLicenseReviews.length>12){
    invalidBlockers.push('ELIGIBILITY_LICENSE_REVIEW_SET_INVALID');
  }else{
    for(const raw of rawLicenseReviews){
      try{
        const review=normalizeHsmeTeacherLicenseReviewV1(raw);
        if(licenseById.has(review.teacherCandidateId)){
          invalidBlockers.push('ELIGIBILITY_LICENSE_REVIEW_DUPLICATE');
          continue;
        }
        if(!refreshedDecision.candidates.some(
          value=>value.candidateId===review.teacherCandidateId,
        )){
          invalidBlockers.push('ELIGIBILITY_LICENSE_REVIEW_EXTRA_CANDIDATE');
          continue;
        }
        const sha=await hsmeTeacherLicenseReviewDigestV1(review,hash);
        if(!await verifyOrigin(()=>origin.verifyLicenseReview(review,sha))){
          invalidBlockers.push('ELIGIBILITY_LICENSE_REVIEW_ORIGIN_UNVERIFIED');
        }
        licenseById.set(review.teacherCandidateId,review);
        licenseShaById.set(review.teacherCandidateId,sha);
      }catch{
        invalidBlockers.push('ELIGIBILITY_LICENSE_REVIEW_INVALID');
      }
    }
  }

  const toolchainById=new Map<string,HsmeTeacherToolchainV1>();
  const toolchainShaById=new Map<string,string>();
  if(!Array.isArray(rawToolchains)||rawToolchains.length>12){
    invalidBlockers.push('ELIGIBILITY_TOOLCHAIN_SET_INVALID');
  }else{
    for(const raw of rawToolchains){
      try{
        const toolchain=normalizeHsmeTeacherToolchainV1(raw);
        if(toolchainById.has(toolchain.teacherCandidateId)){
          invalidBlockers.push('ELIGIBILITY_TOOLCHAIN_DUPLICATE');
          continue;
        }
        if(!refreshedDecision.candidates.some(
          value=>value.candidateId===toolchain.teacherCandidateId,
        )){
          invalidBlockers.push('ELIGIBILITY_TOOLCHAIN_EXTRA_CANDIDATE');
          continue;
        }
        const sha=await hsmeTeacherToolchainDigestV1(toolchain,hash);
        if(!await verifyOrigin(()=>origin.verifyToolchain(toolchain,sha))){
          invalidBlockers.push('ELIGIBILITY_TOOLCHAIN_ORIGIN_UNVERIFIED');
        }
        toolchainById.set(toolchain.teacherCandidateId,toolchain);
        toolchainShaById.set(toolchain.teacherCandidateId,sha);
      }catch{
        invalidBlockers.push('ELIGIBILITY_TOOLCHAIN_INVALID');
      }
    }
  }

  const decisionIds=refreshedDecision.candidates
    .map(value=>value.candidateId).sort(lexical);
  const manifestIds=[...manifests.keys()].sort(lexical);
  const qualityIds=normalizedQualityAssembly.bakeoff.candidateResults
    .map(value=>value.teacherCandidateId).sort(lexical);
  if(!sameStrings(decisionIds,manifestIds)){
    invalidBlockers.push('ELIGIBILITY_MANIFEST_SET_MISMATCH');
  }
  if(!sameStrings(decisionIds,qualityIds)){
    invalidBlockers.push('ELIGIBILITY_QUALITY_SET_MISMATCH');
  }
  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,{
      rosterRefreshSha256,
      refreshedDecisionSha256,
      qualityBakeoffAssemblySha256,
      requiredCapabilities:normalizedQualityAssembly.bakeoff.requiredCapabilities,
    });
  }

  const entries:HsmeTeacherAdmissionEligibilityEntryV1[]=[];
  for(const candidate of refreshedDecision.candidates){
    const blockers:string[]=[];
    const manifest=manifests.get(candidate.candidateId)!;
    const manifestDigest=manifestSha.get(candidate.candidateId)!;
    const qualityResult=normalizedQualityAssembly.bakeoff.candidateResults.find(
      value=>value.teacherCandidateId===candidate.candidateId,
    )!;

    if(manifest.primarySource.sourceRoot!==candidate.modelId
      ||manifest.primarySource.immutableRevision!==candidate.immutableRevision
      ||manifestDigest!==candidate.contentSha256){
      blockers.push('CANDIDATE_IDENTITY_MANIFEST_MISMATCH');
    }
    const weightBytes=sumSafe(
      manifest.artifacts
        .filter(value=>WEIGHT_ROLES.has(value.role))
        .map(value=>value.bytes),
    );
    const installedBytes=sumSafe(
      manifest.artifacts
        .filter(value=>value.runtimeRequired)
        .map(value=>value.bytes),
    );
    if(candidate.checkpointBytes!==weightBytes){
      blockers.push('CANDIDATE_CHECKPOINT_BYTES_MISMATCH');
    }
    if(candidate.installedBytes!==installedBytes){
      blockers.push('CANDIDATE_INSTALLED_BYTES_MISMATCH');
    }
    if(qualityResult.immutableRevision!==candidate.immutableRevision
      ||qualityResult.modelContentSha256!==candidate.contentSha256){
      blockers.push('CANDIDATE_QUALITY_IDENTITY_MISMATCH');
    }
    if(!qualityResult.qualityGatePassed){
      blockers.push('CANDIDATE_QUALITY_GATE_FAILED');
    }

    const review=licenseById.get(candidate.candidateId);
    const reviewSha=licenseShaById.get(candidate.candidateId)??'UNKNOWN';
    if(!review){
      blockers.push('CANDIDATE_LICENSE_REVIEW_MISSING');
    }else{
      if(review.artifactManifestDigest!==manifestDigest){
        blockers.push('CANDIDATE_LICENSE_MANIFEST_MISMATCH');
      }
      if(review.aggregateLicenseId!==candidate.licenseId){
        blockers.push('CANDIDATE_LICENSE_ID_MISMATCH');
      }
      if(review.commercialUseConclusion!=='COMMERCIAL_ADMISSIBLE'){
        blockers.push('CANDIDATE_COMMERCIAL_RIGHTS_NOT_ADMITTED');
      }
      if(review.distillationOutputUse!=='DISTILLATION_ALLOWED'){
        blockers.push('CANDIDATE_DISTILLATION_OUTPUT_RIGHTS_NOT_ADMITTED');
      }
      if(!completeRuntimeLicenseCoverage(manifest,review)){
        blockers.push('CANDIDATE_RUNTIME_LICENSE_COVERAGE_INCOMPLETE');
      }
    }

    const toolchain=toolchainById.get(candidate.candidateId);
    const toolchainSha=toolchainShaById.get(candidate.candidateId)??'UNKNOWN';
    let workingMemoryBytes:number|'UNKNOWN'='UNKNOWN';
    let workingMemoryKind:'MEASURED'|'ESTIMATED'|'UNKNOWN'='UNKNOWN';
    if(!toolchain){
      blockers.push('CANDIDATE_TOOLCHAIN_MISSING');
    }else{
      if(toolchain.artifactManifestDigest!==manifestDigest){
        blockers.push('CANDIDATE_TOOLCHAIN_MANIFEST_MISMATCH');
      }
      if(toolchain.resourceEvidence.installedBytes!==installedBytes){
        blockers.push('CANDIDATE_TOOLCHAIN_INSTALLED_BYTES_MISMATCH');
      }
      if(toolchain.resourceEvidence.workingMemoryBytes<1){
        blockers.push('CANDIDATE_WORKING_MEMORY_UNRESOLVED');
      }else{
        workingMemoryBytes=toolchain.resourceEvidence.workingMemoryBytes;
        workingMemoryKind=toolchain.resourceEvidence.workingMemoryKind;
      }
    }

    entries.push(Object.freeze({
      teacherCandidateId:candidate.candidateId,
      eligible:blockers.length===0,
      blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
      manifestSha256:manifestDigest,
      qualityGatePassed:qualityResult.qualityGatePassed,
      capabilities:Object.freeze([...qualityResult.capabilities].sort(lexical)),
      licenseReviewSha256:reviewSha,
      toolchainSha256:toolchainSha,
      installedBytes,
      workingMemoryBytes,
      workingMemoryKind,
    }));
  }

  entries.sort((a,b)=>lexical(a.teacherCandidateId,b.teacherCandidateId));
  const eligibleTeacherIds=Object.freeze(
    entries.filter(value=>value.eligible)
      .map(value=>value.teacherCandidateId)
      .sort(lexical),
  );
  const requiredCapabilities=Object.freeze(
    [...normalizedQualityAssembly.bakeoff.requiredCapabilities].sort(lexical),
  );

  let eligibilityEvidenceSha256:string;
  try{
    eligibilityEvidenceSha256=await digest(
      HSME_TEACHER_ADMISSION_ELIGIBILITY_DIGEST_DOMAIN,
      {
        schemaVersion:HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA,
        rosterRefreshSha256,
        refreshedDecisionSha256,
        qualityBakeoffAssemblySha256,
        requiredCapabilities,
        entries,
        eligibleTeacherIds,
        teacherSelectionAllowed:false,
        teacherAdmissionAllowed:false,
        trainingStartAllowed:false,
        productionAuthorityGranted:false,
        winnerSelectionAllowed:false,
      },
      hash,
    );
  }catch{
    return invalid(['ELIGIBILITY_EVIDENCE_HASH_INVALID'],{
      rosterRefreshSha256,
      refreshedDecisionSha256,
      qualityBakeoffAssemblySha256,
      requiredCapabilities,
    });
  }

  return Object.freeze({
    schemaVersion:HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA,
    state:eligibleTeacherIds.length>0?'ELIGIBILITY_READY':'ELIGIBILITY_BLOCKED',
    blockers:Object.freeze([]),
    rosterRefreshSha256,
    refreshedDecisionSha256,
    qualityBakeoffAssemblySha256,
    requiredCapabilities,
    entries:Object.freeze(entries),
    eligibleTeacherIds,
    eligibilityEvidenceSha256,
    ...authorityBoundary(),
  });
}

function completeRuntimeLicenseCoverage(
  manifest:HsmeTeacherArtifactManifestV1,
  review:HsmeTeacherLicenseReviewV1,
):boolean{
  const runtime=manifest.artifacts.filter(value=>value.runtimeRequired);
  const runtimeById=new Map(runtime.map(value=>[value.logicalId,value] as const));
  const covered=new Set<string>();
  for(const dependency of review.dependencyReviews){
    if(dependency.conclusion!=='ADMITTED')return false;
    for(const logicalId of dependency.artifactLogicalIds){
      const artifact=runtimeById.get(logicalId);
      if(!artifact)return false;
      if(sourceKey(artifact.source)!==sourceKey(dependency.source))return false;
      if(covered.has(logicalId))return false;
      covered.add(logicalId);
    }
  }
  return covered.size===runtime.length;
}

function sourceKey(source:HsmeTeacherArtifactSourceV1):string{
  return source.provider+'\0'+source.sourceRoot+'\0'+source.immutableRevision;
}

function normalizeQualityAssembly(
  raw:HsmeTeacherQualityBakeoffAssemblyV1,
):HsmeTeacherQualityBakeoffAssemblyV1{
  if(!raw||typeof raw!=='object'
    ||raw.schemaVersion!==HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA){
    throw new Error('quality assembly schema');
  }
  for(const field of [
    'efficiencyUsedForQualitySelection','selectedTeacherIdsAllowed',
    'teacherAdmissionAllowed','trainingStartAllowed','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','winnerSelectionAllowed','productionAuthorityGranted',
  ] as const){
    if(raw[field]!==false)throw new Error('quality assembly authority');
  }
  const bakeoff=normalizeAssembledHsmeTeacherQualityBakeoffV1(raw.bakeoff);
  return Object.freeze({...raw,bakeoff});
}

function rosterRefreshPayload(value:HsmeTeacherDecisionRosterRefreshV1){
  return {
    schemaVersion:HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA,
    sourceDecisionSha256:value.sourceDecisionSha256,
    qualityBakeoffAssemblySha256:value.qualityBakeoffAssemblySha256,
    rosterMetadataSha256:value.rosterMetadataSha256,
    refreshedDecisionSha256:value.refreshedDecisionSha256,
    teacherSelectionAllowed:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  };
}

function qualityAssemblyPayload(value:HsmeTeacherQualityBakeoffAssemblyV1){
  return {
    schemaVersion:HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA,
    benchmarkPolicySha256:value.benchmarkPolicySha256,
    fixtureSetSha256:value.fixtureSetSha256,
    candidateManifestRefs:value.candidateManifestRefs,
    bakeoffSha256:value.bakeoffSha256,
    efficiencyUsedForQualitySelection:false,
    selectedTeacherIdsAllowed:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  };
}

function rosterAuthorityWidened(value:HsmeTeacherDecisionRosterRefreshV1):boolean{
  return value.teacherSelectionAllowed!==false
    ||value.teacherAdmissionAllowed!==false
    ||value.trainingStartAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.durableModelFleetPromotionAllowed!==false;
}

async function verifyOrigin(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result))throw new Error('invalid hash');
  return result;
}

function sumSafe(values:readonly number[]):number{
  let total=0;
  for(const value of values){
    if(!Number.isSafeInteger(value)||value<1)throw new Error('invalid bytes');
    total+=value;
    if(!Number.isSafeInteger(total))throw new Error('byte overflow');
  }
  if(total<1)throw new Error('empty bytes');
  return total;
}

function sameStrings(a:readonly string[],b:readonly string[]):boolean{
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function authorityBoundary(){
  return Object.freeze({
    teacherSelectionAllowed:false as const,
    teacherAdmissionAllowed:false as const,
    trainingStartAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function invalid(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeTeacherAdmissionEligibilityV1,
    'rosterRefreshSha256'|'refreshedDecisionSha256'|
    'qualityBakeoffAssemblySha256'|'requiredCapabilities'
  >>={},
):HsmeTeacherAdmissionEligibilityV1{
  return Object.freeze({
    schemaVersion:HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA,
    state:'ELIGIBILITY_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    rosterRefreshSha256:values.rosterRefreshSha256??'UNKNOWN',
    refreshedDecisionSha256:values.refreshedDecisionSha256??'UNKNOWN',
    qualityBakeoffAssemblySha256:values.qualityBakeoffAssemblySha256??'UNKNOWN',
    requiredCapabilities:Object.freeze([...(values.requiredCapabilities??[])]),
    entries:Object.freeze([]),
    eligibleTeacherIds:Object.freeze([]),
    eligibilityEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

import {
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactManifestV1,
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
  HSME_TEACHER_ADMISSION_ELIGIBILITY_DIGEST_DOMAIN,
  HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA,
  type HsmeTeacherAdmissionEligibilityV1,
} from './HsmeTeacherAdmissionEligibilityV1';
import {
  HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA,
  proveHsmeTeacherAdmissionGateV1,
  type HsmeTeacherAdmissionGateEvidenceV1,
} from './HsmeTeacherAdmissionGateV1';
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
  type HsmeTeacherDecisionV1,
  type HsmeTrainingHashPortV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA =
  'BERS_HSME_TEACHER_ADMISSION_FINALIZATION_V1' as const;
export const HSME_TEACHER_ADMISSION_GATE_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:teacher-admission-gate-evidence:v1\0' as const;
export const HSME_TEACHER_ADMISSION_FINALIZATION_DIGEST_DOMAIN =
  'bers:hsme:teacher-admission-finalization:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;

export interface HsmeTeacherAdmissionFinalizationOriginVerifierV1{
  verifyEligibility(
    eligibility:HsmeTeacherAdmissionEligibilityV1,
    eligibilitySha256:string,
  ):Promise<boolean>;
}

export type HsmeTeacherAdmissionFinalizationV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA;
  state:'FINALIZATION_INVALID'|'FINALIZATION_BLOCKED'|'TEACHER_SET_ADMITTED_READY';
  blockers:readonly string[];
  eligibilityEvidenceSha256:string|'UNKNOWN';
  rosterRefreshSha256:string|'UNKNOWN';
  qualityBakeoffAssemblySha256:string|'UNKNOWN';
  selectionRationaleSha256:string|'UNKNOWN';
  selectedTeacherIds:readonly string[];
  finalDecisionSha256:string|'UNKNOWN';
  admissionGateEvidenceSha256:string|'UNKNOWN';
  finalizationEvidenceSha256:string|'UNKNOWN';
  finalDecision:HsmeTeacherDecisionV1|null;
  admissionGateEvidence:HsmeTeacherAdmissionGateEvidenceV1|null;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function finalizeHsmeTeacherAdmissionV1(
  rosterRefresh:HsmeTeacherDecisionRosterRefreshV1,
  eligibility:HsmeTeacherAdmissionEligibilityV1,
  qualityAssembly:HsmeTeacherQualityBakeoffAssemblyV1,
  rawManifests:readonly unknown[],
  rawLicenseReviews:readonly unknown[],
  rawToolchains:readonly unknown[],
  selectedTeacherIds:readonly string[],
  selectionRationaleSha256:string,
  origin:HsmeTeacherAdmissionFinalizationOriginVerifierV1,
  hash:HsmeTrainingHashPortV1,
):Promise<HsmeTeacherAdmissionFinalizationV1>{
  const invalidBlockers:string[]=[];

  if(!eligibility
    ||eligibility.schemaVersion!==HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA){
    return invalid(['FINALIZATION_ELIGIBILITY_SCHEMA_INVALID']);
  }
  if(eligibilityAuthorityWidened(eligibility)){
    return invalid(['FINALIZATION_ELIGIBILITY_AUTHORITY_WIDENING']);
  }

  let eligibilityEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    eligibilityEvidenceSha256=await digest(
      HSME_TEACHER_ADMISSION_ELIGIBILITY_DIGEST_DOMAIN,
      eligibilityPayload(eligibility),
      hash,
    );
    if(eligibilityEvidenceSha256!==eligibility.eligibilityEvidenceSha256){
      invalidBlockers.push('FINALIZATION_ELIGIBILITY_REHASH_MISMATCH');
    }else if(!await verifyOrigin(
      ()=>origin.verifyEligibility(eligibility,eligibilityEvidenceSha256 as string),
    )){
      invalidBlockers.push('FINALIZATION_ELIGIBILITY_ORIGIN_UNVERIFIED');
    }
  }catch{
    return invalid(['FINALIZATION_ELIGIBILITY_REHASH_INVALID']);
  }

  if(!rosterRefresh
    ||rosterRefresh.schemaVersion!==HSME_TEACHER_ROSTER_REFRESH_V1_SCHEMA
    ||rosterRefresh.state!=='ROSTER_REFRESH_READY'
    ||rosterRefresh.refreshedDecision===null
    ||rosterRefresh.blockers.length!==0){
    invalidBlockers.push('FINALIZATION_ROSTER_REFRESH_NOT_READY');
  }
  let rosterRefreshSha256:string|'UNKNOWN'='UNKNOWN';
  let refreshedDecision:HsmeTeacherDecisionV1|null=null;
  if(invalidBlockers.length===0){
    try{
      refreshedDecision=normalizeHsmeTeacherDecisionV1(rosterRefresh.refreshedDecision);
      const decisionSha=await hsmeTrainingProvenanceDigestV1(refreshedDecision,hash);
      if(decisionSha!==rosterRefresh.refreshedDecisionSha256
        ||decisionSha!==eligibility.refreshedDecisionSha256){
        invalidBlockers.push('FINALIZATION_REFRESHED_DECISION_BINDING_MISMATCH');
      }
      rosterRefreshSha256=await digest(
        HSME_TEACHER_ROSTER_REFRESH_DIGEST_DOMAIN,
        rosterRefreshPayload(rosterRefresh),
        hash,
      );
      if(rosterRefreshSha256!==rosterRefresh.rosterRefreshSha256
        ||rosterRefreshSha256!==eligibility.rosterRefreshSha256){
        invalidBlockers.push('FINALIZATION_ROSTER_REFRESH_BINDING_MISMATCH');
      }
    }catch{
      invalidBlockers.push('FINALIZATION_ROSTER_REFRESH_REHASH_INVALID');
    }
  }

  let normalizedQualityAssembly:HsmeTeacherQualityBakeoffAssemblyV1|null=null;
  let qualityBakeoffAssemblySha256:string|'UNKNOWN'='UNKNOWN';
  try{
    normalizedQualityAssembly=normalizeQualityAssembly(qualityAssembly);
    const bakeoffSha256=await digest(
      HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN,
      normalizedQualityAssembly.bakeoff,
      hash,
    );
    if(bakeoffSha256!==normalizedQualityAssembly.bakeoffSha256){
      invalidBlockers.push('FINALIZATION_QUALITY_BAKEOFF_REHASH_MISMATCH');
    }
    qualityBakeoffAssemblySha256=await digest(
      HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN,
      qualityAssemblyPayload(normalizedQualityAssembly),
      hash,
    );
    if(qualityBakeoffAssemblySha256!==normalizedQualityAssembly.bakeoffAssemblySha256
      ||qualityBakeoffAssemblySha256!==eligibility.qualityBakeoffAssemblySha256
      ||qualityBakeoffAssemblySha256!==rosterRefresh.qualityBakeoffAssemblySha256){
      invalidBlockers.push('FINALIZATION_QUALITY_ASSEMBLY_BINDING_MISMATCH');
    }
  }catch{
    invalidBlockers.push('FINALIZATION_QUALITY_ASSEMBLY_INVALID');
  }

  if(!HEX64.test(selectionRationaleSha256)){
    invalidBlockers.push('FINALIZATION_SELECTION_RATIONALE_HASH_INVALID');
  }

  const normalizedSelected=normalizeSelectedIds(selectedTeacherIds,invalidBlockers);

  const manifests=new Map<string,HsmeTeacherArtifactManifestV1>();
  const manifestShaById=new Map<string,string>();
  if(!Array.isArray(rawManifests)||rawManifests.length<3||rawManifests.length>12){
    invalidBlockers.push('FINALIZATION_MANIFEST_SET_INVALID');
  }else{
    for(const raw of rawManifests){
      try{
        const manifest=normalizeHsmeTeacherArtifactManifestV1(raw);
        if(manifests.has(manifest.teacherCandidateId)){
          invalidBlockers.push('FINALIZATION_MANIFEST_DUPLICATE');
          continue;
        }
        const sha=await hsmeTeacherArtifactManifestDigestV1(manifest,hash);
        manifests.set(manifest.teacherCandidateId,manifest);
        manifestShaById.set(manifest.teacherCandidateId,sha);
      }catch{
        invalidBlockers.push('FINALIZATION_MANIFEST_INVALID');
      }
    }
  }

  const licenseById=new Map<string,HsmeTeacherLicenseReviewV1>();
  const licenseShaById=new Map<string,string>();
  if(!Array.isArray(rawLicenseReviews)||rawLicenseReviews.length>12){
    invalidBlockers.push('FINALIZATION_LICENSE_SET_INVALID');
  }else{
    for(const raw of rawLicenseReviews){
      try{
        const review=normalizeHsmeTeacherLicenseReviewV1(raw);
        if(licenseById.has(review.teacherCandidateId)){
          invalidBlockers.push('FINALIZATION_LICENSE_DUPLICATE');
          continue;
        }
        const sha=await hsmeTeacherLicenseReviewDigestV1(review,hash);
        licenseById.set(review.teacherCandidateId,review);
        licenseShaById.set(review.teacherCandidateId,sha);
      }catch{
        invalidBlockers.push('FINALIZATION_LICENSE_INVALID');
      }
    }
  }

  const toolchainById=new Map<string,HsmeTeacherToolchainV1>();
  const toolchainShaById=new Map<string,string>();
  if(!Array.isArray(rawToolchains)||rawToolchains.length>12){
    invalidBlockers.push('FINALIZATION_TOOLCHAIN_SET_INVALID');
  }else{
    for(const raw of rawToolchains){
      try{
        const toolchain=normalizeHsmeTeacherToolchainV1(raw);
        if(toolchainById.has(toolchain.teacherCandidateId)){
          invalidBlockers.push('FINALIZATION_TOOLCHAIN_DUPLICATE');
          continue;
        }
        const sha=await hsmeTeacherToolchainDigestV1(toolchain,hash);
        toolchainById.set(toolchain.teacherCandidateId,toolchain);
        toolchainShaById.set(toolchain.teacherCandidateId,sha);
      }catch{
        invalidBlockers.push('FINALIZATION_TOOLCHAIN_INVALID');
      }
    }
  }

  if(refreshedDecision){
    for(const id of licenseById.keys()){
      if(!refreshedDecision.candidates.some(value=>value.candidateId===id)){
        invalidBlockers.push('FINALIZATION_LICENSE_EXTRA_CANDIDATE');
      }
    }
    for(const id of toolchainById.keys()){
      if(!refreshedDecision.candidates.some(value=>value.candidateId===id)){
        invalidBlockers.push('FINALIZATION_TOOLCHAIN_EXTRA_CANDIDATE');
      }
    }
  }

  if(refreshedDecision&&normalizedQualityAssembly){
    const decisionIds=refreshedDecision.candidates.map(value=>value.candidateId).sort(lexical);
    const manifestIds=[...manifests.keys()].sort(lexical);
    const qualityIds=normalizedQualityAssembly.bakeoff.candidateResults
      .map(value=>value.teacherCandidateId).sort(lexical);
    if(!sameStrings(decisionIds,manifestIds)){
      invalidBlockers.push('FINALIZATION_MANIFEST_SET_MISMATCH');
    }
    if(!sameStrings(decisionIds,qualityIds)){
      invalidBlockers.push('FINALIZATION_QUALITY_SET_MISMATCH');
    }
  }

  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256:HEX64.test(selectionRationaleSha256)
        ?selectionRationaleSha256
        :'UNKNOWN',
      selectedTeacherIds:normalizedSelected,
    });
  }

  if(eligibility.state!=='ELIGIBILITY_READY'
    ||eligibility.eligibleTeacherIds.length<1){
    return blocked(['FINALIZATION_NO_ELIGIBLE_TEACHERS'],{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }
  if(normalizedSelected.length<1){
    return blocked(['FINALIZATION_SELECTION_REQUIRED'],{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }

  const blockers:string[]=[];
  const evidenceDrift:string[]=[];
  for(const id of normalizedSelected){
    if(!eligibility.eligibleTeacherIds.includes(id)){
      blockers.push('FINALIZATION_SELECTED_TEACHER_NOT_ELIGIBLE');
    }
  }

  const selectedResults=normalizedQualityAssembly!.bakeoff.candidateResults.filter(
    value=>normalizedSelected.includes(value.teacherCandidateId),
  );
  const covered=new Set<string>();
  for(const result of selectedResults){
    if(!result.qualityGatePassed){
      blockers.push('FINALIZATION_SELECTED_QUALITY_GATE_FAILED');
    }
    for(const capability of result.capabilities)covered.add(capability);
  }
  for(const capability of eligibility.requiredCapabilities){
    if(!covered.has(capability)){
      blockers.push('FINALIZATION_REQUIRED_CAPABILITY_UNCOVERED');
    }
  }

  for(const id of normalizedSelected){
    const entry=eligibility.entries.find(value=>value.teacherCandidateId===id);
    const manifest=manifests.get(id);
    const review=licenseById.get(id);
    const toolchain=toolchainById.get(id);
    if(!entry||!entry.eligible){
      blockers.push('FINALIZATION_SELECTED_ELIGIBILITY_ENTRY_INVALID');
      continue;
    }
    if(!manifest||!review||!toolchain){
      evidenceDrift.push('FINALIZATION_SELECTED_EVIDENCE_MISSING');
      continue;
    }
    const manifestSha=manifestShaById.get(id)!;
    const reviewSha=licenseShaById.get(id)!;
    const toolchainSha=toolchainShaById.get(id)!;
    if(entry.manifestSha256!==manifestSha){
      evidenceDrift.push('FINALIZATION_SELECTED_MANIFEST_DIGEST_DRIFT');
    }
    if(entry.licenseReviewSha256!==reviewSha){
      evidenceDrift.push('FINALIZATION_SELECTED_LICENSE_DIGEST_DRIFT');
    }
    if(entry.toolchainSha256!==toolchainSha){
      evidenceDrift.push('FINALIZATION_SELECTED_TOOLCHAIN_DIGEST_DRIFT');
    }
    if(entry.workingMemoryBytes!==toolchain.resourceEvidence.workingMemoryBytes
      ||entry.installedBytes!==toolchain.resourceEvidence.installedBytes){
      evidenceDrift.push('FINALIZATION_SELECTED_RESOURCE_EVIDENCE_DRIFT');
    }
  }

  if(evidenceDrift.length>0){
    return invalid(evidenceDrift,{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }

  if(blockers.length>0){
    return blocked(blockers,{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }

  const finalCandidates=refreshedDecision!.candidates.map(candidate=>{
    if(!normalizedSelected.includes(candidate.candidateId))return candidate;
    const review=licenseById.get(candidate.candidateId)!;
    const toolchain=toolchainById.get(candidate.candidateId)!;
    const licenseSha=licenseShaById.get(candidate.candidateId)!;
    const toolchainSha=toolchainShaById.get(candidate.candidateId)!;
    return {
      ...candidate,
      licenseId:review.aggregateLicenseId,
      licenseConclusion:review.commercialUseConclusion,
      distillationOutputUse:review.distillationOutputUse,
      licenseEvidenceSha256:licenseSha,
      toolchainEvidenceSha256:toolchainSha,
      installedBytes:toolchain.resourceEvidence.installedBytes,
      workingMemoryBytes:toolchain.resourceEvidence.workingMemoryBytes,
    };
  });

  let finalDecision:HsmeTeacherDecisionV1;
  try{
    finalDecision=normalizeHsmeTeacherDecisionV1({
      schemaVersion:refreshedDecision!.schemaVersion,
      decisionStatus:'TEACHER_SET_ADMITTED',
      candidates:finalCandidates,
      selectedCandidateIds:normalizedSelected,
      rationale:[
        'Teacher set admitted only after evidence-bound quality, rights, toolchain and resource eligibility.',
        'Selection rationale evidence SHA-256: '+selectionRationaleSha256,
        'QUALITY_FLOOR_BEFORE_EFFICIENCY remains mandatory; admission does not authorize a training run.',
      ],
    });
  }catch{
    return invalid(['FINALIZATION_CANONICAL_DECISION_INVALID'],{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }

  const selectedManifests=normalizedSelected.map(id=>manifests.get(id)!);
  const selectedReviews=normalizedSelected.map(id=>licenseById.get(id)!);
  const selectedToolchains=normalizedSelected.map(id=>toolchainById.get(id)!);

  let admissionGateEvidence:HsmeTeacherAdmissionGateEvidenceV1;
  try{
    admissionGateEvidence=await proveHsmeTeacherAdmissionGateV1(
      finalDecision,
      primaryQualityBakeoffInput(normalizedQualityAssembly!.bakeoff),
      selectedManifests,
      selectedReviews,
      selectedToolchains,
      hash,
    );
  }catch{
    return invalid(['FINALIZATION_CANONICAL_ADMISSION_GATE_FAILED'],{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }

  let finalDecisionSha256:string;
  let admissionGateEvidenceSha256:string;
  let finalizationEvidenceSha256:string;
  try{
    finalDecisionSha256=await hsmeTrainingProvenanceDigestV1(finalDecision,hash);
    admissionGateEvidenceSha256=await digest(
      HSME_TEACHER_ADMISSION_GATE_EVIDENCE_DIGEST_DOMAIN,
      admissionGateEvidence,
      hash,
    );
    finalizationEvidenceSha256=await digest(
      HSME_TEACHER_ADMISSION_FINALIZATION_DIGEST_DOMAIN,
      {
        schemaVersion:HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA,
        eligibilityEvidenceSha256,
        rosterRefreshSha256,
        qualityBakeoffAssemblySha256,
        selectionRationaleSha256,
        selectedTeacherIds:normalizedSelected,
        finalDecisionSha256,
        admissionGateEvidenceSha256,
        trainingStartAllowed:false,
        productionAuthorityGranted:false,
        winnerSelectionAllowed:false,
      },
      hash,
    );
  }catch{
    return invalid(['FINALIZATION_OUTPUT_HASH_INVALID'],{
      eligibilityEvidenceSha256,
      rosterRefreshSha256,
      qualityBakeoffAssemblySha256,
      selectionRationaleSha256,
      selectedTeacherIds:normalizedSelected,
    });
  }

  return Object.freeze({
    schemaVersion:HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA,
    state:'TEACHER_SET_ADMITTED_READY',
    blockers:Object.freeze([]),
    eligibilityEvidenceSha256,
    rosterRefreshSha256,
    qualityBakeoffAssemblySha256,
    selectionRationaleSha256,
    selectedTeacherIds:Object.freeze([...normalizedSelected]),
    finalDecisionSha256,
    admissionGateEvidenceSha256,
    finalizationEvidenceSha256,
    finalDecision,
    admissionGateEvidence,
    ...authorityBoundary(),
  });
}

function eligibilityPayload(value:HsmeTeacherAdmissionEligibilityV1){
  return {
    schemaVersion:HSME_TEACHER_ADMISSION_ELIGIBILITY_V1_SCHEMA,
    rosterRefreshSha256:value.rosterRefreshSha256,
    refreshedDecisionSha256:value.refreshedDecisionSha256,
    qualityBakeoffAssemblySha256:value.qualityBakeoffAssemblySha256,
    requiredCapabilities:value.requiredCapabilities,
    entries:value.entries,
    eligibleTeacherIds:value.eligibleTeacherIds,
    teacherSelectionAllowed:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
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

function primaryQualityBakeoffInput(raw:unknown):unknown{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
    throw new Error('quality bakeoff record invalid');
  }
  const record=raw as Record<string,unknown>;
  if(!Array.isArray(record.candidateResults)){
    throw new Error('quality bakeoff candidateResults invalid');
  }
  const candidateResults=record.candidateResults.map((rawCandidate,index)=>{
    if(rawCandidate===null||typeof rawCandidate!=='object'||Array.isArray(rawCandidate)){
      throw new Error('quality candidate invalid '+index);
    }
    const candidate=rawCandidate as Record<string,unknown>;
    const {
      qualityGatePassed:_derivedQualityGatePassed,
      ...candidatePrimary
    }=candidate;
    if(!Array.isArray(candidate.automatedChecks)){
      throw new Error('quality automatedChecks invalid '+index);
    }
    const automatedChecks=candidate.automatedChecks.map((rawCheck,checkIndex)=>{
      if(rawCheck===null||typeof rawCheck!=='object'||Array.isArray(rawCheck)){
        throw new Error('quality automated check invalid '+index+':'+checkIndex);
      }
      const {
        passed:_derivedPassed,
        ...checkPrimary
      }=rawCheck as Record<string,unknown>;
      return checkPrimary;
    });
    return {...candidatePrimary,automatedChecks};
  });
  return {...record,candidateResults};
}

function normalizeQualityAssembly(
  raw:HsmeTeacherQualityBakeoffAssemblyV1,
):HsmeTeacherQualityBakeoffAssemblyV1{
  if(!raw||typeof raw!=='object'
    ||raw.schemaVersion!==HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA){
    throw new Error('quality assembly schema');
  }
  const bakeoff=normalizeAssembledHsmeTeacherQualityBakeoffV1(raw.bakeoff);
  return Object.freeze({...raw,bakeoff});
}

function normalizeSelectedIds(
  values:readonly string[],
  blockers:string[],
):readonly string[]{
  if(!Array.isArray(values)||values.length>4){
    blockers.push('FINALIZATION_SELECTED_SET_INVALID');
    return Object.freeze([]);
  }
  const normalized:string[]=[];
  for(const value of values){
    if(typeof value!=='string'||value.length<1||value.length>120||!IDENTIFIER.test(value)){
      blockers.push('FINALIZATION_SELECTED_ID_INVALID');
      continue;
    }
    normalized.push(value);
  }
  if(new Set(normalized).size!==normalized.length){
    blockers.push('FINALIZATION_SELECTED_ID_DUPLICATE');
  }
  return Object.freeze([...new Set(normalized)].sort(lexical));
}

function eligibilityAuthorityWidened(value:HsmeTeacherAdmissionEligibilityV1):boolean{
  return value.teacherSelectionAllowed!==false
    ||value.teacherAdmissionAllowed!==false
    ||value.trainingStartAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.winnerSelectionAllowed!==false;
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

function sameStrings(a:readonly string[],b:readonly string[]):boolean{
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function authorityBoundary(){
  return Object.freeze({
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
    HsmeTeacherAdmissionFinalizationV1,
    'eligibilityEvidenceSha256'|'rosterRefreshSha256'|
    'qualityBakeoffAssemblySha256'|'selectionRationaleSha256'|
    'selectedTeacherIds'
  >>={},
):HsmeTeacherAdmissionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA,
    state:'FINALIZATION_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    eligibilityEvidenceSha256:values.eligibilityEvidenceSha256??'UNKNOWN',
    rosterRefreshSha256:values.rosterRefreshSha256??'UNKNOWN',
    qualityBakeoffAssemblySha256:values.qualityBakeoffAssemblySha256??'UNKNOWN',
    selectionRationaleSha256:values.selectionRationaleSha256??'UNKNOWN',
    selectedTeacherIds:Object.freeze([...(values.selectedTeacherIds??[])]),
    finalDecisionSha256:'UNKNOWN',
    admissionGateEvidenceSha256:'UNKNOWN',
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision:null,
    admissionGateEvidence:null,
    ...authorityBoundary(),
  });
}

function blocked(
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeTeacherAdmissionFinalizationV1,
    'eligibilityEvidenceSha256'|'rosterRefreshSha256'|
    'qualityBakeoffAssemblySha256'|'selectionRationaleSha256'|
    'selectedTeacherIds'
  >>={},
):HsmeTeacherAdmissionFinalizationV1{
  return Object.freeze({
    schemaVersion:HSME_TEACHER_ADMISSION_FINALIZATION_V1_SCHEMA,
    state:'FINALIZATION_BLOCKED',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    eligibilityEvidenceSha256:values.eligibilityEvidenceSha256??'UNKNOWN',
    rosterRefreshSha256:values.rosterRefreshSha256??'UNKNOWN',
    qualityBakeoffAssemblySha256:values.qualityBakeoffAssemblySha256??'UNKNOWN',
    selectionRationaleSha256:values.selectionRationaleSha256??'UNKNOWN',
    selectedTeacherIds:Object.freeze([...(values.selectedTeacherIds??[])]),
    finalDecisionSha256:'UNKNOWN',
    admissionGateEvidenceSha256:'UNKNOWN',
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision:null,
    admissionGateEvidence:null,
    ...authorityBoundary(),
  });
}

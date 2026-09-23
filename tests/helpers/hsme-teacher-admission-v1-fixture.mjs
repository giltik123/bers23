import {createHash} from 'node:crypto';

import {
  HSME_TRAINING_PROVENANCE_V1_SCHEMA,
} from '../../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
  hsmeTeacherArtifactManifestDigestV1,
} from '../../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts';
import {
  HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
  HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA,
  HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
  HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA,
  assembleHsmeTeacherQualityBakeoffV1,
  hsmeTeacherQualityBenchmarkPolicyV1Digest,
} from '../../src/platform/creative/local-ai/hsme/HsmeTeacherQualityBakeoffAssemblyV1.ts';
import {
  HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA,
  refreshHsmeTeacherDecisionRosterV1,
} from '../../src/platform/creative/local-ai/hsme/HsmeTeacherDecisionRosterRefreshV1.ts';
import {
  HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
  HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
} from '../../src/platform/creative/local-ai/hsme/HsmeTeacherTrustEvidenceV1.ts';

export const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
export const H=value=>createHash('sha256').update(value).digest('hex');
export const R=char=>char.repeat(40);

export function makeManifest(candidateId,sourceRoot,revisionChar,scale=1){
  const source={provider:'HUGGING_FACE',sourceRoot,immutableRevision:R(revisionChar)};
  return {
    schemaVersion:HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
    teacherCandidateId:candidateId,
    primarySource:source,
    artifacts:[
      {
        logicalId:'denoiser',
        source,
        relativePath:'transformer/model.safetensors',
        role:'DENOISER_WEIGHT',
        contentSha256:H(candidateId+'-denoiser'),
        bytes:1000*scale,
        runtimeRequired:true,
      },
      {
        logicalId:'text-encoder',
        source,
        relativePath:'text_encoder/model.safetensors',
        role:'TEXT_ENCODER_WEIGHT',
        contentSha256:H(candidateId+'-text'),
        bytes:500*scale,
        runtimeRequired:true,
      },
      {
        logicalId:'vae',
        source,
        relativePath:'vae/model.safetensors',
        role:'VAE_WEIGHT',
        contentSha256:H(candidateId+'-vae'),
        bytes:250*scale,
        runtimeRequired:true,
      },
      {
        logicalId:'model-config',
        source,
        relativePath:'model_index.json',
        role:'MODEL_CONFIG',
        contentSha256:H(candidateId+'-config'),
        bytes:25,
        runtimeRequired:true,
      },
    ],
  };
}

export function makeManifests(){
  return [
    makeManifest(
      'qwen-image-2512-quality-teacher',
      'Qwen/Qwen-Image-2512',
      '1',
      3,
    ),
    makeManifest(
      'qwen-image-edit-2511-quality-teacher',
      'Qwen/Qwen-Image-Edit-2511',
      '2',
      3,
    ),
    makeManifest(
      'flux2-klein-4b-comparator-teacher',
      'black-forest-labs/FLUX.2-klein-4B',
      '3',
      1,
    ),
  ];
}

export function makeLegacySourceDecision(){
  return {
    schemaVersion:HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus:'REDESIGN_REQUIRED',
    candidates:[
      {
        candidateId:'flux1-schnell-teacher-reference',
        modelId:'black-forest-labs/FLUX.1-schnell',
        architectureFamily:'RECTIFIED_FLOW_TRANSFORMER',
        licenseId:'Apache-2.0',
        licenseConclusion:'COMMERCIAL_ADMISSIBLE',
        distillationOutputUse:'REVIEW_REQUIRED',
        installedBytes:23_800_000_000,
        workingMemoryBytes:'UNKNOWN',
        qualityDomain:['legacy-reference'],
        knownWeaknesses:['stale roster entry'],
      },
      {
        candidateId:'qwen-image-teacher-reference',
        modelId:'Qwen/Qwen-Image',
        architectureFamily:'FLOW_MATCHING_DIT',
        licenseId:'Apache-2.0',
        licenseConclusion:'COMMERCIAL_ADMISSIBLE',
        distillationOutputUse:'REVIEW_REQUIRED',
        installedBytes:57_700_000_000,
        workingMemoryBytes:'UNKNOWN',
        qualityDomain:['legacy-reference'],
        knownWeaknesses:['stale roster entry'],
      },
      {
        candidateId:'sana-sprint-0.6b-teacher-reference',
        modelId:'Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers',
        architectureFamily:'LINEAR_DIT',
        licenseId:'Apache-2.0 plus Gemma terms',
        licenseConclusion:'REVIEW_REQUIRED',
        distillationOutputUse:'REVIEW_REQUIRED',
        installedBytes:'UNKNOWN',
        workingMemoryBytes:'UNKNOWN',
        qualityDomain:['legacy-reference'],
        knownWeaknesses:['stale roster entry'],
      },
    ],
    selectedCandidateIds:[],
    rationale:['legacy shortlist remains redesign-required until evidence refresh'],
  };
}

export function makeQualityPolicy(){
  return {
    schemaVersion:HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
    policy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    benchmarkPolicyId:'teacher-bakeoff-v1',
    fixtureSetSha256:H('fixture-set'),
    requiredCapabilities:[
      'TEXT_TO_IMAGE',
      'IMAGE_EDITING',
      'MULTI_REFERENCE_EDITING',
    ],
    automatedRequirements:[
      {
        metricId:'t2i-semantic',
        capability:'TEXT_TO_IMAGE',
        direction:'HIGHER_IS_BETTER',
        thresholdMicrounits:800_000,
      },
      {
        metricId:'edit-preservation',
        capability:'IMAGE_EDITING',
        direction:'HIGHER_IS_BETTER',
        thresholdMicrounits:800_000,
      },
      {
        metricId:'multi-reference-consistency',
        capability:'MULTI_REFERENCE_EDITING',
        direction:'HIGHER_IS_BETTER',
        thresholdMicrounits:800_000,
      },
    ],
    humanRequirements:[
      {
        dimensionId:'t2i-human',
        capability:'TEXT_TO_IMAGE',
        rubricSha256:H('rubric-t2i'),
      },
      {
        dimensionId:'edit-human',
        capability:'IMAGE_EDITING',
        rubricSha256:H('rubric-edit'),
      },
      {
        dimensionId:'multi-human',
        capability:'MULTI_REFERENCE_EDITING',
        rubricSha256:H('rubric-multi'),
      },
    ],
    efficiencyUsedForQualitySelection:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  };
}

export function makeQualityOrigin(all=true){
  return {
    async verifyTargetOutput(){return all;},
    async verifyAutomatedMeasurement(){return all;},
    async verifyBlindedHumanReview(){return all;},
  };
}

export async function buildQualityAssembly({
  manifests=makeManifests(),
  failedCandidates=[],
}={}){
  const policy=makeQualityPolicy();
  const policySha=await hsmeTeacherQualityBenchmarkPolicyV1Digest(policy,hashPort);
  const manifestDigests=new Map();
  for(const value of manifests){
    manifestDigests.set(
      value.teacherCandidateId,
      await hsmeTeacherArtifactManifestDigestV1(value,hashPort),
    );
  }
  const specs=[
    {
      id:'qwen-image-2512-quality-teacher',
      revision:R('1'),
      caps:['TEXT_TO_IMAGE'],
    },
    {
      id:'qwen-image-edit-2511-quality-teacher',
      revision:R('2'),
      caps:['IMAGE_EDITING','MULTI_REFERENCE_EDITING'],
    },
    {
      id:'flux2-klein-4b-comparator-teacher',
      revision:R('3'),
      caps:['TEXT_TO_IMAGE','IMAGE_EDITING','MULTI_REFERENCE_EDITING'],
    },
  ];
  const outputs=specs.map(spec=>({
    schemaVersion:HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA,
    teacherCandidateId:spec.id,
    immutableRevision:spec.revision,
    modelContentSha256:manifestDigests.get(spec.id),
    benchmarkPolicySha256:policySha,
    fixtureSetSha256:policy.fixtureSetSha256,
    toolchainEvidenceSha256:H(spec.id+'-toolchain'),
    executionEvidenceSha256:H(spec.id+'-execution'),
    capabilityOutputs:spec.caps.map(capability=>({
      capability,
      outputSetSha256:H(spec.id+'|'+capability+'|output'),
    })),
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  }));
  const automated=[];
  const human=[];
  for(const output of outputs){
    for(const ref of output.capabilityOutputs){
      const req=policy.automatedRequirements.find(
        value=>value.capability===ref.capability,
      );
      const hreq=policy.humanRequirements.find(
        value=>value.capability===ref.capability,
      );
      automated.push({
        schemaVersion:HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
        teacherCandidateId:output.teacherCandidateId,
        capability:ref.capability,
        metricId:req.metricId,
        benchmarkPolicySha256:policySha,
        outputSetSha256:ref.outputSetSha256,
        observedMicrounits:failedCandidates.includes(output.teacherCandidateId)
          ?700_000
          :900_000,
        measurementEvidenceSha256:H(
          output.teacherCandidateId+'|'+ref.capability+'|metric',
        ),
        providerAuthorityGranted:false,
        billingAuthorityGranted:false,
        teacherAdmissionAllowed:false,
        trainingStartAllowed:false,
        productionAuthorityGranted:false,
      });
      human.push({
        schemaVersion:HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA,
        teacherCandidateId:output.teacherCandidateId,
        capability:ref.capability,
        dimensionId:hreq.dimensionId,
        benchmarkPolicySha256:policySha,
        outputSetSha256:ref.outputSetSha256,
        panelSha256:H(output.teacherCandidateId+'|'+ref.capability+'|panel'),
        reviewEvidenceSha256:H(output.teacherCandidateId+'|'+ref.capability+'|review'),
        decision:'PASS',
        candidateIdentityIncluded:false,
        latencyIncluded:false,
        sizeIncluded:false,
        costIncluded:false,
        providerAuthorityGranted:false,
        billingAuthorityGranted:false,
        teacherAdmissionAllowed:false,
        trainingStartAllowed:false,
        productionAuthorityGranted:false,
      });
    }
  }
  return assembleHsmeTeacherQualityBakeoffV1(
    policy,
    manifests,
    outputs,
    automated,
    human,
    makeQualityOrigin(),
    hashPort,
  );
}

export function makeRosterMetadata(){
  return {
    schemaVersion:HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA,
    rosterId:'hsme-2b1-quality-first-shortlist-v2',
    candidates:[
      {
        teacherCandidateId:'qwen-image-2512-quality-teacher',
        architectureFamily:'FLOW_MATCHING_DIT',
        declaredLicenseId:'Apache-2.0',
        knownWeaknesses:[
          'teacher-scale offline footprint',
          'distillation-output rights unresolved',
        ],
      },
      {
        teacherCandidateId:'qwen-image-edit-2511-quality-teacher',
        architectureFamily:'FLOW_MATCHING_DIT',
        declaredLicenseId:'Apache-2.0',
        knownWeaknesses:[
          'teacher-scale offline footprint',
          'distillation-output rights unresolved',
        ],
      },
      {
        teacherCandidateId:'flux2-klein-4b-comparator-teacher',
        architectureFamily:'RECTIFIED_FLOW_TRANSFORMER',
        declaredLicenseId:'Apache-2.0',
        knownWeaknesses:['synthetic-data rights require separate review'],
      },
    ],
    selectionDeferred:true,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  };
}

export function makeRosterOrigin(all=true){
  return {
    async verifyQualityAssembly(){return all;},
    async verifyManifest(){return all;},
    async verifyRosterMetadata(){return all;},
  };
}

export async function buildRosterRefresh({
  qualityAssembly,
  manifests=makeManifests(),
}={}){
  const assembly=qualityAssembly??await buildQualityAssembly({manifests});
  return refreshHsmeTeacherDecisionRosterV1(
    makeLegacySourceDecision(),
    assembly,
    manifests,
    makeRosterMetadata(),
    makeRosterOrigin(),
    hashPort,
  );
}

export async function makeLicenseReview(
  manifest,
  {
    commercialUseConclusion='COMMERCIAL_ADMISSIBLE',
    distillationOutputUse='DISTILLATION_ALLOWED',
    dependencyConclusion='ADMITTED',
    omitLogicalIds=[],
  }={},
){
  const manifestDigest=await hsmeTeacherArtifactManifestDigestV1(manifest,hashPort);
  return {
    schemaVersion:HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
    teacherCandidateId:manifest.teacherCandidateId,
    artifactManifestDigest:manifestDigest,
    aggregateLicenseId:'Apache-2.0',
    dependencyReviews:[
      {
        source:manifest.primarySource,
        artifactLogicalIds:manifest.artifacts
          .filter(value=>value.runtimeRequired)
          .map(value=>value.logicalId)
          .filter(value=>!omitLogicalIds.includes(value)),
        licenseId:'Apache-2.0',
        licenseEvidenceSha256:H(manifest.teacherCandidateId+'-license-evidence'),
        obligationsEvidenceSha256:H(manifest.teacherCandidateId+'-obligations'),
        conclusion:dependencyConclusion,
      },
    ],
    commercialUseConclusion,
    distillationOutputUse,
    reviewPolicySha256:H('teacher-rights-policy'),
    rationale:['synthetic fixture explicit rights review'],
  };
}

export async function makeToolchain(
  manifest,
  {
    workingMemoryBytes=4_000,
    workingMemoryKind='MEASURED',
  }={},
){
  const manifestDigest=await hsmeTeacherArtifactManifestDigestV1(manifest,hashPort);
  const installedBytes=manifest.artifacts
    .filter(value=>value.runtimeRequired)
    .reduce((sum,value)=>sum+value.bytes,0);
  return {
    schemaVersion:HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
    teacherCandidateId:manifest.teacherCandidateId,
    artifactManifestDigest:manifestDigest,
    runtimeSource:{
      provider:'GITHUB',
      sourceRoot:'giltik123/bers23',
      immutableRevision:R('a'),
    },
    containerImageSha256:H(manifest.teacherCandidateId+'-container'),
    packageLockSha256:H(manifest.teacherCandidateId+'-package-lock'),
    frameworkLockSha256:H(manifest.teacherCandidateId+'-framework-lock'),
    targetProgramSha256:H(manifest.teacherCandidateId+'-target-program'),
    invocationSchemaSha256:H(manifest.teacherCandidateId+'-invocation'),
    determinismPolicySha256:H(manifest.teacherCandidateId+'-determinism'),
    resourceEvidence:{
      installedBytes,
      workingMemoryBytes,
      workingMemoryKind,
      hardwareProfileSha256:H(manifest.teacherCandidateId+'-hardware'),
      methodSha256:H(manifest.teacherCandidateId+'-memory-method'),
      evidenceSha256:H(manifest.teacherCandidateId+'-memory-evidence'),
    },
    remoteCodePolicy:'NO_MODEL_REPOSITORY_RUNTIME_CODE',
  };
}

export function makeEligibilityOrigin(overrides={}){
  return {
    async verifyRosterRefresh(){return overrides.roster??true;},
    async verifyQualityAssembly(){return overrides.quality??true;},
    async verifyManifest(){return overrides.manifest??true;},
    async verifyLicenseReview(){return overrides.license??true;},
    async verifyToolchain(){return overrides.toolchain??true;},
  };
}

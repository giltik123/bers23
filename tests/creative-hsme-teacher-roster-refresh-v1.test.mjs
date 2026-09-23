import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_TRAINING_PROVENANCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts';
import {
  HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
  HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA,
  HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
  HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA,
  assembleHsmeTeacherQualityBakeoffV1,
  hsmeTeacherQualityBenchmarkPolicyV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherQualityBakeoffAssemblyV1.ts';
import {
  HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA,
  refreshHsmeTeacherDecisionRosterV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherDecisionRosterRefreshV1.ts';

const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const R=char=>char.repeat(40);

function manifest(candidateId,sourceRoot,revisionChar,scale=1){
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

const manifests=[
  manifest('qwen-image-2512-quality-teacher','Qwen/Qwen-Image-2512','1',3),
  manifest('qwen-image-edit-2511-quality-teacher','Qwen/Qwen-Image-Edit-2511','2',3),
  manifest('flux2-klein-4b-comparator-teacher','black-forest-labs/FLUX.2-klein-4B','3',1),
];

function sourceDecision(){
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

function policy(){
  return {
    schemaVersion:HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
    policy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    benchmarkPolicyId:'teacher-bakeoff-v1',
    fixtureSetSha256:H('fixture-set'),
    requiredCapabilities:['TEXT_TO_IMAGE','IMAGE_EDITING','MULTI_REFERENCE_EDITING'],
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

function qualityOrigin(){
  return {
    async verifyTargetOutput(){return true;},
    async verifyAutomatedMeasurement(){return true;},
    async verifyBlindedHumanReview(){return true;},
  };
}

async function qualityAssembly(){
  const p=policy();
  const policySha=await hsmeTeacherQualityBenchmarkPolicyV1Digest(p,hashPort);
  const manifestDigests=new Map();
  const {hsmeTeacherArtifactManifestDigestV1}=await import(
    '../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts'
  );
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
    fixtureSetSha256:p.fixtureSetSha256,
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
      const req=p.automatedRequirements.find(value=>value.capability===ref.capability);
      const hreq=p.humanRequirements.find(value=>value.capability===ref.capability);
      automated.push({
        schemaVersion:HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
        teacherCandidateId:output.teacherCandidateId,
        capability:ref.capability,
        metricId:req.metricId,
        benchmarkPolicySha256:policySha,
        outputSetSha256:ref.outputSetSha256,
        observedMicrounits:900_000,
        measurementEvidenceSha256:H(output.teacherCandidateId+'|'+ref.capability+'|metric'),
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
    p,manifests,outputs,automated,human,qualityOrigin(),hashPort,
  );
}

function metadata(){
  return {
    schemaVersion:HSME_TEACHER_ROSTER_METADATA_V1_SCHEMA,
    rosterId:'hsme-2b1-quality-first-shortlist-v2',
    candidates:[
      {
        teacherCandidateId:'qwen-image-2512-quality-teacher',
        architectureFamily:'FLOW_MATCHING_DIT',
        declaredLicenseId:'Apache-2.0',
        knownWeaknesses:['teacher-scale offline footprint','distillation-output rights unresolved'],
      },
      {
        teacherCandidateId:'qwen-image-edit-2511-quality-teacher',
        architectureFamily:'FLOW_MATCHING_DIT',
        declaredLicenseId:'Apache-2.0',
        knownWeaknesses:['teacher-scale offline footprint','distillation-output rights unresolved'],
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

function rosterOrigin({quality=true,manifest=true,metadata=true}={}){
  return {
    async verifyQualityAssembly(){return quality;},
    async verifyManifest(){return manifest;},
    async verifyRosterMetadata(){return metadata;},
  };
}

test('stale redesign roster refreshes to evidence-bound shortlist without admitting teachers',async()=>{
  const assembly=await qualityAssembly();
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),assembly,manifests,metadata(),rosterOrigin(),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_READY');
  assert.deepEqual(result.blockers,[]);
  assert.match(result.sourceDecisionSha256,/^[0-9a-f]{64}$/);
  assert.match(result.qualityBakeoffAssemblySha256,/^[0-9a-f]{64}$/);
  assert.match(result.rosterMetadataSha256,/^[0-9a-f]{64}$/);
  assert.match(result.refreshedDecisionSha256,/^[0-9a-f]{64}$/);
  assert.match(result.rosterRefreshSha256,/^[0-9a-f]{64}$/);

  const decision=result.refreshedDecision;
  assert.equal(decision.decisionStatus,'REDESIGN_REQUIRED');
  assert.deepEqual(decision.selectedCandidateIds,[]);
  assert.deepEqual(
    decision.candidates.map(value=>value.candidateId),
    [
      'flux2-klein-4b-comparator-teacher',
      'qwen-image-2512-quality-teacher',
      'qwen-image-edit-2511-quality-teacher',
    ],
  );
  for(const candidate of decision.candidates){
    const sourceManifest=manifests.find(value=>value.teacherCandidateId===candidate.candidateId);
    assert.equal(candidate.modelId,sourceManifest.primarySource.sourceRoot);
    assert.equal(candidate.immutableRevision,sourceManifest.primarySource.immutableRevision);
    assert.match(candidate.contentSha256,/^[0-9a-f]{64}$/);
    assert.ok(candidate.checkpointBytes>0);
    assert.ok(candidate.installedBytes>=candidate.checkpointBytes);
    assert.equal(candidate.licenseConclusion,'REVIEW_REQUIRED');
    assert.equal(candidate.distillationOutputUse,'REVIEW_REQUIRED');
    assert.equal(candidate.workingMemoryBytes,'UNKNOWN');
    assert.equal('licenseEvidenceSha256' in candidate,false);
    assert.equal('toolchainEvidenceSha256' in candidate,false);
  }
  assert.equal(result.teacherSelectionAllowed,false);
  assert.equal(result.teacherAdmissionAllowed,false);
  assert.equal(result.trainingStartAllowed,false);
  assert.equal(result.productionAuthorityGranted,false);
  assert.equal(result.providerAuthorityGranted,false);
  assert.equal(result.billingAuthorityGranted,false);
  assert.equal(result.projectArtifactMutationAllowed,false);
  assert.equal(result.aeeExecutionAuthorityGranted,false);
  assert.equal(result.durableModelFleetPromotionAllowed,false);
});

test('quality assembly origin failure blocks roster refresh',async()=>{
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),await qualityAssembly(),manifests,metadata(),
    rosterOrigin({quality:false}),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(result.blockers.includes('ROSTER_QUALITY_ASSEMBLY_ORIGIN_UNVERIFIED'));
});

test('manifest origin failure blocks roster refresh',async()=>{
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),await qualityAssembly(),manifests,metadata(),
    rosterOrigin({manifest:false}),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(result.blockers.includes('ROSTER_MANIFEST_ORIGIN_UNVERIFIED'));
});

test('metadata candidate set must equal the quality/manifests candidate set',async()=>{
  const m=metadata();
  m.candidates=m.candidates.slice(0,2);
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),await qualityAssembly(),manifests,m,rosterOrigin(),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(
    result.blockers.includes('ROSTER_METADATA_INVALID')
    ||result.blockers.includes('ROSTER_METADATA_SET_MISMATCH'),
  );
});

test('quality assembly digest tampering fails independently of origin verifier',async()=>{
  const assembly=structuredClone(await qualityAssembly());
  assembly.bakeoffAssemblySha256=H('tampered-assembly');
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),assembly,manifests,metadata(),rosterOrigin(),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(result.blockers.includes('ROSTER_QUALITY_ASSEMBLY_REHASH_MISMATCH'));
});

test('manifest identity drift against quality assembly fails closed',async()=>{
  const assembly=await qualityAssembly();
  const bad=structuredClone(manifests);
  bad[0].artifacts[0].contentSha256=H('drifted-weight');
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),assembly,bad,metadata(),rosterOrigin(),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(result.blockers.includes('ROSTER_MANIFEST_QUALITY_BINDING_MISMATCH'));
});

test('runtime-code artifact cannot enter refreshed roster evidence',async()=>{
  const assembly=await qualityAssembly();
  const bad=structuredClone(manifests);
  bad[0].artifacts.push({
    logicalId:'runtime-code',
    source:bad[0].primarySource,
    relativePath:'custom_pipeline.py',
    role:'RUNTIME_CODE',
    contentSha256:H('runtime-code'),
    bytes:10,
    runtimeRequired:true,
  });
  const result=await refreshHsmeTeacherDecisionRosterV1(
    sourceDecision(),assembly,bad,metadata(),rosterOrigin(),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(
    result.blockers.includes('ROSTER_MANIFEST_RUNTIME_CODE_FORBIDDEN')
    ||result.blockers.includes('ROSTER_MANIFEST_QUALITY_BINDING_MISMATCH'),
  );
});

test('source decision must still be unresolved redesign with no selected ids',async()=>{
  const source=sourceDecision();
  source.selectedCandidateIds=['qwen-image-teacher-reference'];
  const result=await refreshHsmeTeacherDecisionRosterV1(
    source,await qualityAssembly(),manifests,metadata(),rosterOrigin(),hashPort,
  );
  assert.equal(result.state,'ROSTER_REFRESH_INVALID');
  assert.ok(
    result.blockers.includes('ROSTER_SOURCE_DECISION_INVALID')
    ||result.blockers.includes('ROSTER_SOURCE_DECISION_NOT_REDESIGN'),
  );
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
  hsmeTeacherArtifactManifestDigestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts';
import {
  HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
  HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA,
  HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
  HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA,
  assembleHsmeTeacherQualityBakeoffV1,
  hsmeTeacherQualityBenchmarkPolicyV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherQualityBakeoffAssemblyV1.ts';

const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const R=char=>char.repeat(40);

function manifest(candidateId,sourceRoot,revisionChar){
  return {
    schemaVersion:HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
    teacherCandidateId:candidateId,
    primarySource:{
      provider:'HUGGING_FACE',
      sourceRoot,
      immutableRevision:R(revisionChar),
    },
    artifacts:[
      {
        logicalId:'denoiser',
        source:{
          provider:'HUGGING_FACE',
          sourceRoot,
          immutableRevision:R(revisionChar),
        },
        relativePath:'transformer/model.safetensors',
        role:'DENOISER_WEIGHT',
        contentSha256:H(candidateId+'-weight'),
        bytes:1000,
        runtimeRequired:true,
      },
      {
        logicalId:'model-config',
        source:{
          provider:'HUGGING_FACE',
          sourceRoot,
          immutableRevision:R(revisionChar),
        },
        relativePath:'model_index.json',
        role:'MODEL_CONFIG',
        contentSha256:H(candidateId+'-config'),
        bytes:100,
        runtimeRequired:true,
      },
    ],
  };
}

const manifests=[
  manifest('qwen-image-2512-quality-teacher','Qwen/Qwen-Image-2512','1'),
  manifest('qwen-image-edit-2511-quality-teacher','Qwen/Qwen-Image-Edit-2511','2'),
  manifest('flux2-klein-4b-comparator-teacher','black-forest-labs/FLUX.2-klein-4B','3'),
];

function policy(){
  return {
    schemaVersion:HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
    policy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    benchmarkPolicyId:'hsme-teacher-quality-bakeoff-v1',
    fixtureSetSha256:H('fixture-set-v1'),
    requiredCapabilities:['TEXT_TO_IMAGE','IMAGE_EDITING','MULTI_REFERENCE_EDITING'],
    automatedRequirements:[
      {
        metricId:'t2i-semantic-adherence',
        capability:'TEXT_TO_IMAGE',
        direction:'HIGHER_IS_BETTER',
        thresholdMicrounits:800_000,
      },
      {
        metricId:'edit-preservation',
        capability:'IMAGE_EDITING',
        direction:'HIGHER_IS_BETTER',
        thresholdMicrounits:850_000,
      },
      {
        metricId:'multi-reference-consistency',
        capability:'MULTI_REFERENCE_EDITING',
        direction:'HIGHER_IS_BETTER',
        thresholdMicrounits:820_000,
      },
    ],
    humanRequirements:[
      {
        dimensionId:'t2i-human-realism',
        capability:'TEXT_TO_IMAGE',
        rubricSha256:H('rubric-t2i'),
      },
      {
        dimensionId:'edit-human-preservation',
        capability:'IMAGE_EDITING',
        rubricSha256:H('rubric-edit'),
      },
      {
        dimensionId:'multi-reference-human-consistency',
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

async function buildFixture(){
  const benchmarkPolicy=policy();
  const benchmarkPolicySha256=await hsmeTeacherQualityBenchmarkPolicyV1Digest(
    benchmarkPolicy,hashPort,
  );
  const manifestDigests=new Map();
  for(const value of manifests){
    manifestDigests.set(
      value.teacherCandidateId,
      await hsmeTeacherArtifactManifestDigestV1(value,hashPort),
    );
  }

  const outputSpecs=[
    {
      teacherCandidateId:'qwen-image-2512-quality-teacher',
      revision:R('1'),
      caps:['TEXT_TO_IMAGE'],
    },
    {
      teacherCandidateId:'qwen-image-edit-2511-quality-teacher',
      revision:R('2'),
      caps:['IMAGE_EDITING','MULTI_REFERENCE_EDITING'],
    },
    {
      teacherCandidateId:'flux2-klein-4b-comparator-teacher',
      revision:R('3'),
      caps:['TEXT_TO_IMAGE','IMAGE_EDITING','MULTI_REFERENCE_EDITING'],
    },
  ];
  const outputs=outputSpecs.map(spec=>({
    schemaVersion:HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA,
    teacherCandidateId:spec.teacherCandidateId,
    immutableRevision:spec.revision,
    modelContentSha256:manifestDigests.get(spec.teacherCandidateId),
    benchmarkPolicySha256,
    fixtureSetSha256:benchmarkPolicy.fixtureSetSha256,
    toolchainEvidenceSha256:H(spec.teacherCandidateId+'-toolchain'),
    executionEvidenceSha256:H(spec.teacherCandidateId+'-execution'),
    capabilityOutputs:spec.caps.map(capability=>({
      capability,
      outputSetSha256:H(spec.teacherCandidateId+'|'+capability+'|outputs'),
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
      const requirement=benchmarkPolicy.automatedRequirements.find(
        value=>value.capability===ref.capability,
      );
      const humanRequirement=benchmarkPolicy.humanRequirements.find(
        value=>value.capability===ref.capability,
      );
      let observed=900_000;
      if(
        output.teacherCandidateId==='flux2-klein-4b-comparator-teacher'
        &&ref.capability==='TEXT_TO_IMAGE'
      ) observed=700_000;
      automated.push({
        schemaVersion:HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
        teacherCandidateId:output.teacherCandidateId,
        capability:ref.capability,
        metricId:requirement.metricId,
        benchmarkPolicySha256,
        outputSetSha256:ref.outputSetSha256,
        observedMicrounits:observed,
        measurementEvidenceSha256:H(
          output.teacherCandidateId+'|'+ref.capability+'|measurement',
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
        dimensionId:humanRequirement.dimensionId,
        benchmarkPolicySha256,
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
  return {benchmarkPolicy,benchmarkPolicySha256,outputs,automated,human};
}

function origin({
  output=true,
  automated=true,
  human=true,
}={}){
  const calls={output:[],automated:[],human:[]};
  return {
    calls,
    async verifyTargetOutput(value,digest){
      calls.output.push({value,digest});
      return output;
    },
    async verifyAutomatedMeasurement(value,digest){
      calls.automated.push({value,digest});
      return automated;
    },
    async verifyBlindedHumanReview(value,digest){
      calls.human.push({value,digest});
      return human;
    },
  };
}

async function assemble(fixture,verifier=origin()){
  return assembleHsmeTeacherQualityBakeoffV1(
    fixture.benchmarkPolicy,
    manifests,
    fixture.outputs,
    fixture.automated,
    fixture.human,
    verifier,
    hashPort,
  );
}

test('trusted evidence assembles canonical bakeoff and existing gate derives quality pass/fail',async()=>{
  const fixture=await buildFixture();
  const verifier=origin();
  const result=await assemble(fixture,verifier);

  assert.equal(result.bakeoff.policy,'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(result.benchmarkPolicySha256,fixture.benchmarkPolicySha256);
  assert.equal(result.fixtureSetSha256,fixture.benchmarkPolicy.fixtureSetSha256);
  assert.equal(result.candidateManifestRefs.length,3);
  assert.match(result.bakeoffSha256,/^[0-9a-f]{64}$/);
  assert.match(result.bakeoffAssemblySha256,/^[0-9a-f]{64}$/);

  const byId=Object.fromEntries(
    result.bakeoff.candidateResults.map(value=>[value.teacherCandidateId,value]),
  );
  assert.equal(byId['qwen-image-2512-quality-teacher'].qualityGatePassed,true);
  assert.equal(byId['qwen-image-edit-2511-quality-teacher'].qualityGatePassed,true);
  assert.equal(byId['flux2-klein-4b-comparator-teacher'].qualityGatePassed,false);
  assert.equal(
    byId['flux2-klein-4b-comparator-teacher'].automatedChecks
      .find(value=>value.metricId==='t2i-semantic-adherence').thresholdMicrounits,
    800_000,
  );

  assert.equal(verifier.calls.output.length,3);
  assert.equal(verifier.calls.automated.length,6);
  assert.equal(verifier.calls.human.length,6);
  for(const call of [
    ...verifier.calls.output,
    ...verifier.calls.automated,
    ...verifier.calls.human,
  ]) assert.match(call.digest,/^[0-9a-f]{64}$/);

  for(const field of [
    'efficiencyUsedForQualitySelection','selectedTeacherIdsAllowed',
    'teacherAdmissionAllowed','trainingStartAllowed','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed','productionAuthorityGranted',
  ]) assert.equal(result[field],false,field);
});

test('measurement cannot override policy threshold or direction',async()=>{
  const fixture=await buildFixture();
  fixture.automated[0].thresholdMicrounits=1;
  await assert.rejects(
    ()=>assemble(fixture),
    error=>error?.code==='quality_field_unknown',
  );

  const fixture2=await buildFixture();
  fixture2.automated[0].direction='LOWER_IS_BETTER';
  await assert.rejects(
    ()=>assemble(fixture2),
    error=>error?.code==='quality_field_unknown',
  );
});

test('human review cannot override authoritative rubric digest',async()=>{
  const fixture=await buildFixture();
  fixture.human[0].rubricSha256=H('caller-rubric');
  await assert.rejects(
    ()=>assemble(fixture),
    error=>error?.code==='quality_field_unknown',
  );
});

test('missing and extra automated evidence fail closed',async()=>{
  const missing=await buildFixture();
  missing.automated.pop();
  await assert.rejects(
    ()=>assemble(missing),
    error=>error?.code==='quality_automated_measurement_missing',
  );

  const extra=await buildFixture();
  extra.automated.push({
    ...extra.automated[0],
    metricId:'caller-invented-metric',
    measurementEvidenceSha256:H('extra-metric'),
  });
  await assert.rejects(
    ()=>assemble(extra),
    error=>error?.code==='quality_automated_requirement_unknown',
  );
});

test('missing and extra human evidence fail closed',async()=>{
  const missing=await buildFixture();
  missing.human.pop();
  await assert.rejects(
    ()=>assemble(missing),
    error=>error?.code==='quality_human_review_missing',
  );

  const extra=await buildFixture();
  extra.human.push({
    ...extra.human[0],
    dimensionId:'caller-invented-dimension',
    reviewEvidenceSha256:H('extra-review'),
  });
  await assert.rejects(
    ()=>assemble(extra),
    error=>error?.code==='quality_human_requirement_unknown',
  );
});

test('blinded human evidence rejects candidate identity and efficiency leaks',async()=>{
  for(const field of [
    'candidateIdentityIncluded','latencyIncluded','sizeIncluded','costIncluded',
  ]){
    const fixture=await buildFixture();
    fixture.human[0][field]=true;
    await assert.rejects(
      ()=>assemble(fixture),
      error=>error?.code==='quality_authority_widening',
      field,
    );
  }
});

test('target output must bind exact acquired manifest content and revision',async()=>{
  const contentDrift=await buildFixture();
  contentDrift.outputs[0].modelContentSha256=H('different-manifest');
  await assert.rejects(
    ()=>assemble(contentDrift),
    error=>error?.code==='quality_output_content_drift',
  );

  const revisionDrift=await buildFixture();
  revisionDrift.outputs[0].immutableRevision=R('9');
  await assert.rejects(
    ()=>assemble(revisionDrift),
    error=>error?.code==='quality_output_revision_drift',
  );
});

test('policy and output-set drift are rejected at each evidence boundary',async()=>{
  const fixture=await buildFixture();
  fixture.automated[0].benchmarkPolicySha256=H('other-policy');
  await assert.rejects(
    ()=>assemble(fixture),
    error=>error?.code==='quality_automated_policy_drift',
  );

  const fixture2=await buildFixture();
  fixture2.human[0].outputSetSha256=H('other-output-set');
  await assert.rejects(
    ()=>assemble(fixture2),
    error=>error?.code==='quality_human_output_drift',
  );
});

test('failed evidence origin verification cannot be replaced by self-consistent hashes',async()=>{
  for(const [kind,verifier] of [
    ['output',origin({output:false})],
    ['automated',origin({automated:false})],
    ['human',origin({human:false})],
  ]){
    const fixture=await buildFixture();
    await assert.rejects(
      ()=>assemble(fixture,verifier),
      error=>String(error?.code||'').includes(
        kind==='output'
          ?'quality_output_origin_unverified'
          :kind==='automated'
            ?'quality_automated_origin_unverified'
            :'quality_human_origin_unverified'
      ),
      kind,
    );
  }
});

test('assembly digest and normalized bakeoff are order-independent',async()=>{
  const fixture=await buildFixture();
  const first=await assemble(fixture);

  const reordered={
    ...fixture,
    outputs:[...fixture.outputs].reverse(),
    automated:[...fixture.automated].reverse(),
    human:[...fixture.human].reverse(),
  };
  const second=await assembleHsmeTeacherQualityBakeoffV1(
    reordered.benchmarkPolicy,
    [...manifests].reverse(),
    reordered.outputs,
    reordered.automated,
    reordered.human,
    origin(),
    hashPort,
  );

  assert.equal(second.bakeoffAssemblySha256,first.bakeoffAssemblySha256);
  assert.deepEqual(second.bakeoff,first.bakeoff);
  assert.deepEqual(second.candidateManifestRefs,first.candidateManifestRefs);
});

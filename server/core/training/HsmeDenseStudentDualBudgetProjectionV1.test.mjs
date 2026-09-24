import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
  HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1,
  HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1,
  HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1,
  hsmeDenseStudentRepresentationEvidenceV1Digest,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
  hsmeDenseStudentStepMatrixEvidenceV1Digest,
} from './HsmeDenseStudentStepMatrixV1.ts';
import {
  HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
  hsmeDenseBaselineDualBudgetTemplateV1Digest,
  projectHsmeDenseStudentDualBudgetV1,
} from './HsmeDenseStudentDualBudgetProjectionV1.ts';
import {
  HSME_PACK_V1_SCHEMA,
  hsmePackDescriptorV1Digest,
  normalizeHsmePackDescriptorV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmePackV1.ts';
import {
  normalizeHsmeDenseDualBudgetEvidenceV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineDualBudgetEvidenceV1.ts';

const hashPort={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
const H=value=>createHash('sha256').update(value).digest('hex');
const TEMPLATE=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-dual-budget.json',
  'utf8',
));
const REP_BYTES=536_870_912;

function falseRepresentationAuthority(){
  return {
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function falseMatrixAuthority(){
  return {
    weightedAggregateScoreAllowed:false,
    efficiencyMayOverrideQualityFailure:false,
    scheduleSelectionAllowed:false,
    candidateSelectionAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

async function makePack(artifactSha,{extraRoot=false}={}){
  const modelId='hsme-rd-'+HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID;
  const version='rep-'+artifactSha.slice(0,16);
  return normalizeHsmePackDescriptorV1({
    schemaVersion:HSME_PACK_V1_SCHEMA,
    packId:modelId,
    packVersion:version,
    capabilities:['RND_DENSE_STUDENT_REPRESENTATION'],
    roots:[
      {
        role:'BASE',
        modelId,
        version,
        sha256:artifactSha,
      },
      ...(extraRoot?[{
        role:'AUXILIARY',
        modelId:modelId+'-aux',
        version:'aux-'+artifactSha.slice(0,16),
        sha256:H('aux|'+artifactSha),
      }]:[]),
    ],
    routing:{
      mode:'SHARED_ONLY',
      maxActiveExperts:0,
    },
    resources:{
      peakMemoryBytes:900_000_000,
      maxResidentBytes:700_000_000,
      maxPrefetchBytes:64_000_000,
    },
  });
}

async function makeRepresentation({extraRoot=false}={}){
  const artifactSha=H('dense-student-representation');
  const pack=await makePack(artifactSha,{extraRoot});
  const packDescriptorSha256=await hsmePackDescriptorV1Digest(pack,hashPort);
  const base={
    schemaVersion:HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
    state:'REPRESENTATION_READY_NOT_ADMITTED',
    blockers:[],
    receiptEvidenceSha256:H('receipt'),
    preflightEvidenceSha256:H('preflight'),
    launchSpecSha256:H('launch'),
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    architectureFamily:'COMPACT_DIT',
    activeParametersMillions:256,
    targetStepCount:8,
    repositoryCommitSha:'a'.repeat(40),
    immutableEnvironmentSha256:H('environment'),
    stagedCheckpointSha256:H('staged-checkpoint'),
    stagedCheckpointBytes:REP_BYTES,
    checkpointMetadataSha256:H('checkpoint-metadata'),
    teacherDecisionSha256:H('teacher-decision'),
    reproductionEvidenceSha256:H('reproduction'),
    corpusRootDigest:H('corpus'),
    recipeDigest:H('recipe'),
    inputCheckpointSha256:H('input-checkpoint'),
    resumeCheckpointSha256:'NONE',
    exportAttemptId:'export-attempt-1',
    exportSpec:{
      format:HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1,
      formatVersion:HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1,
      precision:HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1,
      architectureFamily:'COMPACT_DIT',
      checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
    },
    representationArtifactSha256:artifactSha,
    representationBytes:REP_BYTES,
    representationMetadataSha256:H('representation-metadata'),
    components:{
      modelConfigSha256:H('model-config'),
      tokenizerSha256:H('tokenizer'),
      textConditionerSha256:H('text-conditioner'),
      imageEncoderSha256:'NONE',
      vaeSha256:H('vae'),
      schedulerConfigSha256:H('scheduler'),
    },
    exportToolchainSha256:H('export-toolchain'),
    resourceEvidence:{
      peakMemoryBytes:900_000_000,
      maxResidentBytes:700_000_000,
      maxPrefetchBytes:64_000_000,
      resourceEvidenceSha256:H('representation-resource'),
    },
    exporterResultSha256:H('exporter-result'),
    packCandidateState:'PACK_CANDIDATE_READY_NOT_ADMITTED',
    packDescriptor:pack,
    packDescriptorSha256,
    ...falseRepresentationAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentRepresentationEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

function row(capability,stepCount,index){
  return Object.freeze({
    stepCount,
    capability,
    outputSetSha256:H('outputs|'+capability+'|'+stepCount),
    sampleCount:13,
    successCount:13,
    failureCount:0,
    criticalFailureCount:index===7?1:0,
    qualityDimensions:Object.freeze([{
      dimensionId:capability==='IMAGE_EDITING'
        ?'identity-preservation'
        :'semantic-adherence',
      lossMicrounits:10_000+stepCount*100,
      criticalFailureObserved:index===7,
      evidenceSha256:H('quality|'+capability+'|'+stepCount),
    }]),
    coldEndToEndLatencyMicros:8_000_000-stepCount*300_000,
    warmEndToEndLatencyMicros:7_000_000-stepCount*300_000,
    perStepLatencyMicros:900_000,
    peakRamBytes:620_000_000+stepCount*1_000_000,
    peakAcceleratorBytes:730_000_000+stepCount*2_000_000,
    activeRepresentationBytes:400_000_000+stepCount*3_000_000,
    residentRepresentationBytes:450_000_000,
    flashBytesMovedPerRun:20_000_000+stepCount*4_000_000,
    hardwareProfileSha256:H('hardware'),
    runtimeIdentity:'cuda-locked-runtime-v1',
    providerIdentity:'protected-local-benchmark',
    measurementMethodSha256:H('method'),
    measurementEvidenceSha256:H('measurement|'+capability+'|'+stepCount),
  });
}

async function makeMatrix(representation,{qualityEmpty=false}={}){
  const rows=[];
  let index=0;
  for(const capability of ['IMAGE_EDITING','TEXT_TO_IMAGE']){
    for(const stepCount of [2,4,6,8]){
      rows.push(row(capability,stepCount,index++));
    }
  }
  if(qualityEmpty){
    rows[0]=Object.freeze({...rows[0],qualityDimensions:Object.freeze([])});
  }
  const base={
    schemaVersion:HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
    state:'STEP_MATRIX_READY_NOT_SELECTED',
    blockers:[],
    representationEvidenceSha256:representation.evidenceSha256,
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    representationArtifactSha256:representation.representationArtifactSha256,
    representationBytes:representation.representationBytes,
    benchmarkBindingSha256:H('benchmark-binding'),
    benchmarkResultSha256:H('benchmark-result'),
    benchmarkAttemptId:'matrix-attempt-1',
    rows:Object.freeze(rows),
    ...falseMatrixAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentStepMatrixEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

async function fixture(options={}){
  const representation=await makeRepresentation(options);
  const matrix=await makeMatrix(representation,options);
  const template=structuredClone(TEMPLATE);
  const expectedTemplateSha256=
    await hsmeDenseBaselineDualBudgetTemplateV1Digest(template,hashPort);
  const templateOrigin={
    async verifyDualBudgetTemplate(value,expected){
      return expected===expectedTemplateSha256
        &&JSON.stringify(value)===
          JSON.stringify(normalizeHsmeDenseDualBudgetEvidenceV1(template));
    },
  };
  return {
    representation,
    matrix,
    template,
    expectedTemplateSha256,
    templateOrigin,
  };
}

async function project(input){
  return projectHsmeDenseStudentDualBudgetV1(
    input.representation,
    input.matrix,
    input.template,
    input.expectedTemplateSha256,
    input.templateOrigin,
    hashPort,
  );
}

test('exact READY evidence projects measured target row only',async()=>{
  const input=await fixture();
  const source=normalizeHsmeDenseDualBudgetEvidenceV1(input.template);
  const result=await project(input);
  const target=result.projectedCandidate;

  assert.equal(result.state,'DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN');
  assert.deepEqual(result.changedCandidateIds,[HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID]);
  assert.equal(target.installed.mandatoryInstalledBytes,REP_BYTES);
  assert.equal(target.installed.optionalInstalledBytes,0);
  assert.equal(target.installed.firstUseDownloadBytes,REP_BYTES);
  assert.equal(target.installed.knownInstalledLowerBoundBytes,REP_BYTES);
  assert.equal(target.installed.duplicateRepresentationBytes,'UNKNOWN');
  assert.equal(target.installed.cacheHighWaterBytes,'UNKNOWN');

  assert.equal(target.workingMemory.activeWeightsBytes,424_000_000);
  assert.equal(target.workingMemory.peakRamBytes,628_000_000);
  assert.equal(target.workingMemory.peakAcceleratorBytes,746_000_000);
  assert.equal(target.workingMemory.flashBytesMovedPerRun,52_000_000);
  assert.equal(target.qualityPerInstalledGbStatus,'MEASURED');
  assert.equal(target.mvmState,'NOT_EVALUATED');
  assert.equal(target.efficiencyDisposition,'R&D_ONLY');

  const sourceById=new Map(source.candidates.map(value=>[value.candidateId,value]));
  for(const candidate of result.projectedEvidence.candidates){
    if(candidate.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID)continue;
    assert.deepEqual(candidate,sourceById.get(candidate.candidateId));
  }
  assert.match(result.representationEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.stepMatrixEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.sourceTemplateSha256,/^[0-9a-f]{64}$/);
  assert.match(result.projectedEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.projectionEvidenceSha256,/^[0-9a-f]{64}$/);
});

test('same exact inputs produce byte-identical projection candidate',async()=>{
  const input=await fixture();
  const first=await project(input);
  const second=await project(input);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
});

test('template digest and origin are both required',async()=>{
  const input=await fixture();
  await assert.rejects(
    project({...input,expectedTemplateSha256:H('wrong-template')}),
    error=>error.code==='hsme_dense_projection_template_rehash',
  );
  await assert.rejects(
    project({
      ...input,
      templateOrigin:{async verifyDualBudgetTemplate(){return false;}},
    }),
    error=>error.code==='hsme_dense_projection_template_origin',
  );
});

test('representation or matrix digest drift fails closed',async()=>{
  const input=await fixture();
  await assert.rejects(
    project({
      ...input,
      representation:{
        ...input.representation,
        evidenceSha256:H('forged-representation'),
      },
    }),
    error=>error.code==='hsme_dense_projection_representation_rehash',
  );
  await assert.rejects(
    project({
      ...input,
      matrix:{
        ...input.matrix,
        evidenceSha256:H('forged-matrix'),
      },
    }),
    error=>error.code==='hsme_dense_projection_matrix_rehash',
  );
});

test('matrix must bind exact representation identity',async()=>{
  const input=await fixture();
  const rebound={
    ...input.matrix,
    representationArtifactSha256:H('different-artifact'),
  };
  rebound.evidenceSha256=await hsmeDenseStudentStepMatrixEvidenceV1Digest(
    rebound,
    hashPort,
  );
  await assert.rejects(
    project({...input,matrix:rebound}),
    error=>error.code==='hsme_dense_projection_source_binding',
  );
});

test('one-root self-contained pack law is required for installed-byte inference',async()=>{
  const input=await fixture({extraRoot:true});
  await assert.rejects(
    project(input),
    error=>error.code==='hsme_dense_projection_one_root_required',
  );
});

test('quality-per-installed status cannot become MEASURED with incomplete dimensions',async()=>{
  const input=await fixture({qualityEmpty:true});
  await assert.rejects(
    project(input),
    error=>error.code==='hsme_dense_projection_quality_incomplete',
  );
});

test('incomplete 2/4/6/8 roster fails closed',async()=>{
  const input=await fixture();
  const matrix={...input.matrix,rows:input.matrix.rows.slice(0,7)};
  await assert.rejects(
    project({...input,matrix}),
    error=>error.code==='hsme_dense_projection_matrix_state',
  );
});

test('projection refuses to overwrite independently measured target values',async()=>{
  const input=await fixture();
  const target=input.template.candidates.find(
    value=>value.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
  );
  target.installed.mandatoryInstalledBytes=123;
  input.expectedTemplateSha256=
    await hsmeDenseBaselineDualBudgetTemplateV1Digest(input.template,hashPort);
  input.templateOrigin={
    async verifyDualBudgetTemplate(){return true;},
  };
  await assert.rejects(
    project(input),
    error=>error.code==='hsme_dense_projection_target_measurement_overwrite',
  );
});

test('projection grants no baseline, schedule, candidate, fleet or production authority',async()=>{
  const result=await project(await fixture());
  for(const field of [
    'baselineSelectionAllowed',
    'scheduleSelectionAllowed',
    'candidateSelectionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    assert.equal(result[field],false,field);
  }
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA,
  hsmeDenseStudentQualityFirstDispositionV1Digest,
} from './HsmeDenseStudentQualityFirstDispositionV1.ts';
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
  hsmeDenseStudentSelectedDualBudgetProjectionV1Digest,
  proveHsmeDenseStudentSelectedDualBudgetProjectionV1,
} from './HsmeDenseStudentSelectedDualBudgetProjectionV1.ts';
import {
  HSME_PACK_V1_SCHEMA,
  hsmePackDescriptorV1Digest,
  normalizeHsmePackDescriptorV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmePackV1.ts';
import {
  normalizeHsmeDenseDualBudgetEvidenceV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineDualBudgetEvidenceV1.ts';

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');
const TEMPLATE=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-dual-budget.json',
  'utf8',
));
const REP_BYTES=536_870_912;
const BINDING=H('selected-projection-benchmark-binding');

function representationAuthority(){
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

function matrixAuthority(){
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

function dispositionAuthority(){
  return {
    weightedAggregateScoreAllowed:false,
    efficiencyMayOverrideQualityFailure:false,
    scheduleSelectionAllowed:false,
    trainingExecutionAllowed:false,
    candidateSelectionAllowed:false,
    baselineSelectionAllowed:false,
    canonicalDecisionPersistAllowed:false,
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

async function makePack(artifactSha){
  const modelId='hsme-rd-'+HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID;
  const version='rep-'+artifactSha.slice(0,16);
  return normalizeHsmePackDescriptorV1({
    schemaVersion:HSME_PACK_V1_SCHEMA,
    packId:modelId,
    packVersion:version,
    capabilities:['RND_DENSE_STUDENT_REPRESENTATION'],
    roots:[{
      role:'BASE',
      modelId,
      version,
      sha256:artifactSha,
    }],
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

async function makeRepresentation(){
  const artifactSha=H('selected-projection-representation');
  const pack=await makePack(artifactSha);
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
    exportAttemptId:'selected-projection-export-attempt',
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
    ...representationAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentRepresentationEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

function row(capability,stepCount){
  return Object.freeze({
    stepCount,
    capability,
    outputSetSha256:H('outputs|'+capability+'|'+stepCount),
    sampleCount:13,
    successCount:13,
    failureCount:0,
    criticalFailureCount:0,
    qualityDimensions:Object.freeze([{
      dimensionId:capability==='IMAGE_EDITING'
        ?'identity-preservation'
        :'semantic-adherence',
      lossMicrounits:10_000+stepCount*100,
      criticalFailureObserved:false,
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

async function makeMatrix(representation){
  const rows=[];
  for(const capability of ['IMAGE_EDITING','TEXT_TO_IMAGE']){
    for(const stepCount of [2,4,6,8])rows.push(row(capability,stepCount));
  }
  const base={
    schemaVersion:HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
    state:'STEP_MATRIX_READY_NOT_SELECTED',
    blockers:[],
    representationEvidenceSha256:representation.evidenceSha256,
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    representationArtifactSha256:representation.representationArtifactSha256,
    representationBytes:representation.representationBytes,
    benchmarkBindingSha256:BINDING,
    benchmarkResultSha256:H('benchmark-result'),
    benchmarkAttemptId:'selected-projection-matrix-attempt',
    rows:Object.freeze(rows),
    ...matrixAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentStepMatrixEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

async function makeDisposition(representation,matrix){
  const base={
    schemaVersion:HSME_DENSE_STUDENT_QUALITY_FIRST_DISPOSITION_V1_SCHEMA,
    state:'REAL_REPRESENTATION_SELECTED_READY_NOT_PROJECTED',
    blockers:[],
    campaignEvidenceSha256:H('campaign'),
    policyEvidenceSha256:H('policy'),
    benchmarkBindingSha256:BINDING,
    perStepQuality:[],
    qualityPassTrainingTargetStepCounts:[8],
    paretoVectors:[],
    paretoNondominatedTrainingTargetStepCounts:[8],
    selectedTrainingTargetStepCount:8,
    selectedRepresentationEvidenceSha256:representation.evidenceSha256,
    selectedRepresentationArtifactSha256:representation.representationArtifactSha256,
    selectedRepresentationBytes:representation.representationBytes,
    selectedStepMatrixEvidenceSha256:matrix.evidenceSha256,
    ...dispositionAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentQualityFirstDispositionV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

async function fixture(){
  const representation=await makeRepresentation();
  const matrix=await makeMatrix(representation);
  const disposition=await makeDisposition(representation,matrix);
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
    disposition,
    representation,
    matrix,
    template,
    expectedTemplateSha256,
    templateOrigin,
  };
}

function trustedOrigins(input){
  return {
    dispositionOrigin:{
      async verifyQualityFirstDisposition(value,expected){
        return value===input.disposition
          &&expected===input.disposition.evidenceSha256;
      },
    },
    representationOrigin:{
      async verifyRepresentationEvidence(value,expected){
        return value===input.representation
          &&expected===input.representation.evidenceSha256;
      },
    },
    matrixOrigin:{
      async verifyStepMatrixEvidence(value,expected){
        return value===input.matrix
          &&expected===input.matrix.evidenceSha256;
      },
    },
  };
}

async function bridge(input,originOverrides={}){
  const origins={...trustedOrigins(input),...originOverrides};
  return proveHsmeDenseStudentSelectedDualBudgetProjectionV1(
    input.disposition,
    input.disposition.evidenceSha256,
    origins.dispositionOrigin,
    input.representation,
    input.representation.evidenceSha256,
    origins.representationOrigin,
    input.matrix,
    input.matrix.evidenceSha256,
    origins.matrixOrigin,
    input.template,
    input.expectedTemplateSha256,
    input.templateOrigin,
    hashPort,
  );
}

test('selection-bound bridge is deep-equivalent to direct canonical projection',async()=>{
  const input=await fixture();
  const direct=await projectHsmeDenseStudentDualBudgetV1(
    input.representation,
    input.matrix,
    input.template,
    input.expectedTemplateSha256,
    input.templateOrigin,
    hashPort,
  );
  const result=await bridge(input);

  assert.equal(
    result.state,
    'SELECTED_DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN',
  );
  assert.deepEqual(result.projection,direct);
  assert.equal(
    result.qualityFirstDispositionSha256,
    input.disposition.evidenceSha256,
  );
  assert.equal(result.selectedTrainingTargetStepCount,8);
  assert.equal(
    result.dualBudgetProjectionSha256,
    direct.projectionEvidenceSha256,
  );
  assert.equal(
    result.projectedDualBudgetEvidenceSha256,
    direct.projectedEvidenceSha256,
  );
  assert.equal(result.projection.projectedCandidate.efficiencyDisposition,'R&D_ONLY');
  assert.equal(
    await hsmeDenseStudentSelectedDualBudgetProjectionV1Digest(result,hashPort),
    result.evidenceSha256,
  );
});

test('non-selected representation fails before canonical projection',async()=>{
  const input=await fixture();
  const forged={
    ...input.representation,
    targetStepCount:4,
  };
  forged.evidenceSha256=await hsmeDenseStudentRepresentationEvidenceV1Digest(
    forged,
    hashPort,
  );
  const result=await proveHsmeDenseStudentSelectedDualBudgetProjectionV1(
    input.disposition,
    input.disposition.evidenceSha256,
    trustedOrigins(input).dispositionOrigin,
    forged,
    forged.evidenceSha256,
    {async verifyRepresentationEvidence(){return true;}},
    input.matrix,
    input.matrix.evidenceSha256,
    trustedOrigins(input).matrixOrigin,
    input.template,
    input.expectedTemplateSha256,
    input.templateOrigin,
    hashPort,
  );
  assert.equal(result.state,'SELECTED_DUAL_BUDGET_PROJECTION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_PROJECTION_REPRESENTATION_REHASH_MISMATCH'],
  );
  assert.equal(result.projection,null);
});

test('unverified disposition origin fails before representation or projection use',async()=>{
  const input=await fixture();
  let representationCalls=0;
  const result=await bridge(input,{
    dispositionOrigin:{
      async verifyQualityFirstDisposition(){return false;},
    },
    representationOrigin:{
      async verifyRepresentationEvidence(){
        representationCalls+=1;
        return true;
      },
    },
  });
  assert.equal(result.state,'SELECTED_DUAL_BUDGET_PROJECTION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_PROJECTION_DISPOSITION_ORIGIN_UNVERIFIED'],
  );
  assert.equal(representationCalls,0);
  assert.equal(result.projection,null);
});

test('unverified exact representation or matrix origin fails closed',async()=>{
  let input=await fixture();
  let result=await bridge(input,{
    representationOrigin:{
      async verifyRepresentationEvidence(){return false;},
    },
  });
  assert.equal(result.state,'SELECTED_DUAL_BUDGET_PROJECTION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_PROJECTION_REPRESENTATION_ORIGIN_UNVERIFIED'],
  );

  input=await fixture();
  result=await bridge(input,{
    matrixOrigin:{
      async verifyStepMatrixEvidence(){return false;},
    },
  });
  assert.equal(result.state,'SELECTED_DUAL_BUDGET_PROJECTION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_PROJECTION_MATRIX_ORIGIN_UNVERIFIED'],
  );
});

test('non-selected disposition is BLOCKED and cannot project',async()=>{
  const input=await fixture();
  const ambiguous={
    ...input.disposition,
    state:'REAL_REPRESENTATION_DISPOSITION_AMBIGUOUS',
    selectedTrainingTargetStepCount:undefined,
    selectedRepresentationEvidenceSha256:undefined,
    selectedRepresentationArtifactSha256:undefined,
    selectedRepresentationBytes:undefined,
    selectedStepMatrixEvidenceSha256:undefined,
    evidenceSha256:H('ambiguous-placeholder'),
  };
  const result=await proveHsmeDenseStudentSelectedDualBudgetProjectionV1(
    ambiguous,
    H('not-reached'),
    {async verifyQualityFirstDisposition(){return false;}},
    input.representation,
    input.representation.evidenceSha256,
    trustedOrigins(input).representationOrigin,
    input.matrix,
    input.matrix.evidenceSha256,
    trustedOrigins(input).matrixOrigin,
    input.template,
    input.expectedTemplateSha256,
    input.templateOrigin,
    hashPort,
  );
  assert.equal(result.state,'SELECTED_DUAL_BUDGET_PROJECTION_BLOCKED');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_PROJECTION_SELECTED_DISPOSITION_REQUIRED'],
  );
});

test('same exact selected inputs produce byte-identical bridge evidence',async()=>{
  const input=await fixture();
  const first=await bridge(input);
  const second=await bridge(input);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
});

test('bridge grants no selection, execution, persistence, fleet or production authority',async()=>{
  const result=await bridge(await fixture());
  for(const field of [
    'scheduleSelectionAllowed',
    'trainingExecutionAllowed',
    'candidateSelectionAllowed',
    'baselineSelectionAllowed',
    'canonicalDecisionPersistAllowed',
    'checkpointPromotionAllowed',
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

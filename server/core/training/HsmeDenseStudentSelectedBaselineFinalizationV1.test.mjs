import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';
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
  HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA,
  finalizeHsmeDenseBaselineV1,
  hsmeDenseBaselinePinAttestationV1Digest,
  normalizeHsmeDenseBaselinePinAttestationV1,
} from './HsmeDenseBaselineFinalizationV1.ts';
import {
  HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
  hsmeDenseStudentSelectedDualBudgetProjectionV1Digest,
} from './HsmeDenseStudentSelectedDualBudgetProjectionV1.ts';
import {
  hsmeDenseStudentSelectedBaselineFinalizationV1Digest,
  proveHsmeDenseStudentSelectedBaselineFinalizationV1,
} from './HsmeDenseStudentSelectedBaselineFinalizationV1.ts';
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

const SOURCE_RAW=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json',
  'utf8',
));
const SOURCE=normalizeHsmeDenseBaselineDecisionV1(SOURCE_RAW);
const TEMPLATE=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-dual-budget.json',
  'utf8',
));
const REP_BYTES=536_870_912;

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

function selectedProjectionAuthority(){
  return {
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

function attestationAuthority(){
  return {
    canonicalDecisionPersistAllowed:false,
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
    roots:[{role:'BASE',modelId,version,sha256:artifactSha}],
    routing:{mode:'SHARED_ONLY',maxActiveExperts:0},
    resources:{
      peakMemoryBytes:900_000_000,
      maxResidentBytes:700_000_000,
      maxPrefetchBytes:64_000_000,
    },
  });
}

async function makeRepresentation({
  textConditioner='NONE',
  activeParametersMillions=600,
  targetStepCount=8,
}={}){
  const artifactSha=H('selected-finalization-representation');
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
    activeParametersMillions,
    targetStepCount,
    repositoryCommitSha:'c'.repeat(40),
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
    exportAttemptId:'selected-finalization-export',
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
      textConditionerSha256:textConditioner,
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

function measurementRow(capability,stepCount,{critical=false,activeRepresentationBytes=650_000_000}={}){
  return Object.freeze({
    stepCount,
    capability,
    outputSetSha256:H('output|'+capability+'|'+stepCount),
    sampleCount:13,
    successCount:critical?12:13,
    failureCount:critical?1:0,
    criticalFailureCount:critical?1:0,
    qualityDimensions:Object.freeze([{
      dimensionId:capability==='IMAGE_EDITING'
        ?'identity-preservation'
        :'semantic-adherence',
      lossMicrounits:critical?200_000:10_000+stepCount*100,
      criticalFailureObserved:critical,
      evidenceSha256:H('quality|'+capability+'|'+stepCount),
    }]),
    coldEndToEndLatencyMicros:8_000_000-stepCount*300_000,
    warmEndToEndLatencyMicros:7_000_000-stepCount*300_000,
    perStepLatencyMicros:900_000,
    peakRamBytes:620_000_000+stepCount*1_000_000,
    peakAcceleratorBytes:730_000_000+stepCount*2_000_000,
    activeRepresentationBytes,
    residentRepresentationBytes:650_000_000,
    flashBytesMovedPerRun:20_000_000+stepCount*4_000_000,
    hardwareProfileSha256:H('hardware'),
    runtimeIdentity:'cuda-locked-runtime-v1',
    providerIdentity:'protected-local-benchmark',
    measurementMethodSha256:H('method'),
    measurementEvidenceSha256:H('measurement|'+capability+'|'+stepCount),
  });
}

async function makeMatrix(representation,{critical=false,activeRepresentationBytes=650_000_000}={}){
  const rows=[];
  for(const capability of ['IMAGE_EDITING','TEXT_TO_IMAGE']){
    for(const stepCount of [2,4,6,8]){
      rows.push(measurementRow(capability,stepCount,{
        critical:critical&&capability==='TEXT_TO_IMAGE'&&stepCount===8,
        activeRepresentationBytes,
      }));
    }
  }
  const base={
    schemaVersion:HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
    state:'STEP_MATRIX_READY_NOT_SELECTED',
    blockers:[],
    representationEvidenceSha256:representation.evidenceSha256,
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    representationArtifactSha256:representation.representationArtifactSha256,
    representationBytes:representation.representationBytes,
    benchmarkBindingSha256:H('selected-finalization-binding'),
    benchmarkResultSha256:H('benchmark-result'),
    benchmarkAttemptId:'selected-finalization-matrix',
    rows:Object.freeze(rows),
    ...matrixAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentStepMatrixEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

async function makeProjection(representation,matrix){
  const template=structuredClone(TEMPLATE);
  const expectedTemplateSha256=
    await hsmeDenseBaselineDualBudgetTemplateV1Digest(template,hashPort);
  return projectHsmeDenseStudentDualBudgetV1(
    representation,
    matrix,
    template,
    expectedTemplateSha256,
    {
      async verifyDualBudgetTemplate(value,expected){
        return expected===expectedTemplateSha256
          &&JSON.stringify(value)===
            JSON.stringify(normalizeHsmeDenseDualBudgetEvidenceV1(template));
      },
    },
    hashPort,
  );
}

async function makeSelectedProjection(representation,matrix,projection){
  const base={
    schemaVersion:HSME_DENSE_STUDENT_SELECTED_DUAL_BUDGET_PROJECTION_V1_SCHEMA,
    state:'SELECTED_DUAL_BUDGET_PROJECTION_READY_NOT_FROZEN',
    blockers:[],
    qualityFirstDispositionSha256:H('quality-first-disposition'),
    selectedTrainingTargetStepCount:representation.targetStepCount,
    representationEvidenceSha256:representation.evidenceSha256,
    representationArtifactSha256:representation.representationArtifactSha256,
    stepMatrixEvidenceSha256:matrix.evidenceSha256,
    dualBudgetProjectionSha256:projection.projectionEvidenceSha256,
    projectedDualBudgetEvidenceSha256:projection.projectedEvidenceSha256,
    projection,
    ...selectedProjectionAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentSelectedDualBudgetProjectionV1Digest(
    {...base,evidenceSha256:H('placeholder')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

async function makeAttestation(representation,{reviewState='COMMERCIAL_ADMISSIBLE'}={}){
  const raw={
    schemaVersion:HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA,
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    representationEvidenceSha256:representation.evidenceSha256,
    representationArtifactSha256:representation.representationArtifactSha256,
    packDescriptorSha256:representation.packDescriptorSha256,
    reviewState,
    sourceUri:'bers://dense-student/sha256/'+representation.representationArtifactSha256,
    license:'BERS-COMMERCIAL-DENSE-STUDENT-V1',
    licenseEvidenceSha256:H('license-review'),
    ...attestationAuthority(),
  };
  return normalizeHsmeDenseBaselinePinAttestationV1(raw);
}

async function fixture(options={}){
  const representation=await makeRepresentation(options);
  const matrix=await makeMatrix(representation,options);
  const projection=await makeProjection(representation,matrix);
  const selectedProjection=await makeSelectedProjection(
    representation,
    matrix,
    projection,
  );
  const sourceDecisionSha256=await hsmeDenseBaselineDecisionV1Digest(
    SOURCE,
    hashPort,
  );
  const attestation=await makeAttestation(representation,options);
  const attestationSha256=await hsmeDenseBaselinePinAttestationV1Digest(
    attestation,
    hashPort,
  );
  const finalizationOrigin={
    async verifySourceDecision(value,expected){
      return expected===sourceDecisionSha256
        &&JSON.stringify(value)===JSON.stringify(SOURCE);
    },
    async verifyPinAttestation(value,expected){
      return expected===attestationSha256
        &&JSON.stringify(value)===JSON.stringify(attestation);
    },
  };
  return {
    representation,
    matrix,
    projection,
    selectedProjection,
    sourceDecisionSha256,
    attestation,
    attestationSha256,
    finalizationOrigin,
  };
}

function trustedOrigins(input){
  return {
    selectedProjectionOrigin:{
      async verifySelectedDualBudgetProjection(value,expected){
        return value===input.selectedProjection
          &&expected===input.selectedProjection.evidenceSha256;
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

async function wrapper(input,{
  attestation=input.attestation,
  attestationSha256=input.attestationSha256,
  finalizationOrigin=input.finalizationOrigin,
  originOverrides={},
}={}){
  const origins={...trustedOrigins(input),...originOverrides};
  return proveHsmeDenseStudentSelectedBaselineFinalizationV1(
    input.selectedProjection,
    input.selectedProjection.evidenceSha256,
    origins.selectedProjectionOrigin,
    input.representation,
    input.representation.evidenceSha256,
    origins.representationOrigin,
    input.matrix,
    input.matrix.evidenceSha256,
    origins.matrixOrigin,
    SOURCE,
    input.sourceDecisionSha256,
    attestation,
    attestation===null?null:attestationSha256,
    finalizationOrigin,
    hashPort,
  );
}

async function direct(input,{
  attestation=input.attestation,
  attestationSha256=input.attestationSha256,
  finalizationOrigin=input.finalizationOrigin,
}={}){
  return finalizeHsmeDenseBaselineV1(
    SOURCE,
    input.sourceDecisionSha256,
    input.representation,
    input.matrix,
    input.projection,
    attestation,
    attestation===null?null:attestationSha256,
    finalizationOrigin,
    hashPort,
  );
}

test('commercial exact selected evidence is deep-equivalent to canonical finalization',async()=>{
  const input=await fixture();
  const expected=await direct(input);
  const result=await wrapper(input);
  assert.equal(
    result.state,
    'SELECTED_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED',
  );
  assert.deepEqual(result.finalization,expected);
  assert.equal(
    result.denseBaselineFinalizationSha256,
    expected.finalizationEvidenceSha256,
  );
  assert.equal(
    await hsmeDenseStudentSelectedBaselineFinalizationV1Digest(result,hashPort),
    result.evidenceSha256,
  );
  assert.equal(result.canonicalDecisionPersistAllowed,false);
});

test('missing pin attestation preserves canonical BLOCKED outcome',async()=>{
  const input=await fixture();
  const expected=await direct(input,{attestation:null,attestationSha256:null});
  const result=await wrapper(input,{attestation:null,attestationSha256:null});
  assert.equal(result.state,'SELECTED_BASELINE_FINALIZATION_BLOCKED');
  assert.deepEqual(result.finalization,expected);
  assert.equal(
    result.finalization.state,
    'DENSE_BASELINE_PIN_REVIEW_BLOCKED',
  );
});

test('license rejection preserves canonical REJECT outcome',async()=>{
  const input=await fixture({reviewState:'REJECTED'});
  const expected=await direct(input);
  const result=await wrapper(input);
  assert.equal(result.state,'SELECTED_BASELINE_REJECTED');
  assert.deepEqual(result.finalization,expected);
  assert.equal(result.finalization.disposition,'REJECT');
});

test('critical quality evidence preserves canonical REDESIGN outcome',async()=>{
  const input=await fixture({critical:true});
  const expected=await direct(input);
  const result=await wrapper(input);
  assert.equal(result.state,'SELECTED_BASELINE_REDESIGN_REQUIRED');
  assert.deepEqual(result.finalization,expected);
  assert.equal(result.finalization.disposition,'REDESIGN');
});

test('unverified selected-projection origin fails before canonical finalizer',async()=>{
  const input=await fixture();
  let sourceDecisionCalls=0;
  const result=await wrapper(input,{
    originOverrides:{
      selectedProjectionOrigin:{
        async verifySelectedDualBudgetProjection(){return false;},
      },
    },
    finalizationOrigin:{
      ...input.finalizationOrigin,
      async verifySourceDecision(){
        sourceDecisionCalls+=1;
        return true;
      },
    },
  });
  assert.equal(result.state,'SELECTED_BASELINE_FINALIZATION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_FINALIZATION_SELECTED_PROJECTION_ORIGIN_UNVERIFIED'],
  );
  assert.equal(sourceDecisionCalls,0);
  assert.equal(result.finalization,null);
});

test('unverified representation or matrix origin fails before finalizer',async()=>{
  let input=await fixture();
  let result=await wrapper(input,{
    originOverrides:{
      representationOrigin:{
        async verifyRepresentationEvidence(){return false;},
      },
    },
  });
  assert.equal(result.state,'SELECTED_BASELINE_FINALIZATION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_FINALIZATION_REPRESENTATION_ORIGIN_UNVERIFIED'],
  );

  input=await fixture();
  result=await wrapper(input,{
    originOverrides:{
      matrixOrigin:{
        async verifyStepMatrixEvidence(){return false;},
      },
    },
  });
  assert.equal(result.state,'SELECTED_BASELINE_FINALIZATION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['SELECTED_FINALIZATION_MATRIX_ORIGIN_UNVERIFIED'],
  );
});

test('same exact selected inputs produce byte-identical wrapper evidence',async()=>{
  const input=await fixture();
  const first=await wrapper(input);
  const second=await wrapper(input);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
});

test('wrapper grants no execution, persistence, fleet or production authority',async()=>{
  const result=await wrapper(await fixture());
  for(const field of [
    'trainingExecutionAllowed',
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

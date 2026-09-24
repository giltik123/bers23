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
  hsmeDenseBaselineProjectedDualBudgetEvidenceV1Digest,
  hsmeDenseStudentDualBudgetProjectionV1Digest,
  projectHsmeDenseStudentDualBudgetV1,
} from './HsmeDenseStudentDualBudgetProjectionV1.ts';
import {
  HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA,
  finalizeHsmeDenseBaselineV1,
  hsmeDenseBaselineFinalizationV1Digest,
  hsmeDenseBaselinePinAttestationV1Digest,
  normalizeHsmeDenseBaselinePinAttestationV1,
} from './HsmeDenseBaselineFinalizationV1.ts';
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

async function makeRepresentation({
  textConditioner='NONE',
  activeParametersMillions=600,
  targetStepCount=8,
}={}){
  const artifactSha=H('dense-finalization-representation');
  const pack=await makePack(artifactSha);
  const packDescriptorSha256=await hsmePackDescriptorV1Digest(pack,hashPort);
  const base={
    schemaVersion:HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
    state:'REPRESENTATION_READY_NOT_ADMITTED',
    blockers:[],
    receiptEvidenceSha256:H('finalization-receipt'),
    preflightEvidenceSha256:H('finalization-preflight'),
    launchSpecSha256:H('finalization-launch'),
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    architectureFamily:'COMPACT_DIT',
    activeParametersMillions,
    targetStepCount,
    repositoryCommitSha:'b'.repeat(40),
    immutableEnvironmentSha256:H('finalization-environment'),
    stagedCheckpointSha256:H('finalization-staged-checkpoint'),
    stagedCheckpointBytes:REP_BYTES,
    checkpointMetadataSha256:H('finalization-checkpoint-metadata'),
    teacherDecisionSha256:H('finalization-teacher'),
    reproductionEvidenceSha256:H('finalization-reproduction'),
    corpusRootDigest:H('finalization-corpus'),
    recipeDigest:H('finalization-recipe'),
    inputCheckpointSha256:H('finalization-input-checkpoint'),
    resumeCheckpointSha256:'NONE',
    exportAttemptId:'dense-finalization-export-1',
    exportSpec:{
      format:HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_V1,
      formatVersion:HSME_DENSE_STUDENT_REPRESENTATION_FORMAT_VERSION_V1,
      precision:HSME_DENSE_STUDENT_REPRESENTATION_PRECISION_V1,
      architectureFamily:'COMPACT_DIT',
      checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
    },
    representationArtifactSha256:artifactSha,
    representationBytes:REP_BYTES,
    representationMetadataSha256:H('finalization-representation-metadata'),
    components:{
      modelConfigSha256:H('finalization-model-config'),
      tokenizerSha256:H('finalization-tokenizer'),
      textConditionerSha256:textConditioner,
      imageEncoderSha256:'NONE',
      vaeSha256:H('finalization-vae'),
      schedulerConfigSha256:H('finalization-scheduler'),
    },
    exportToolchainSha256:H('finalization-export-toolchain'),
    resourceEvidence:{
      peakMemoryBytes:900_000_000,
      maxResidentBytes:700_000_000,
      maxPrefetchBytes:64_000_000,
      resourceEvidenceSha256:H('finalization-representation-resource'),
    },
    exporterResultSha256:H('finalization-export-result'),
    packCandidateState:'PACK_CANDIDATE_READY_NOT_ADMITTED',
    packDescriptor:pack,
    packDescriptorSha256,
    ...representationAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentRepresentationEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder-representation')},
    hashPort,
  );
  return Object.freeze({...base,evidenceSha256});
}

function measurementRow(capability,stepCount,{
  critical=false,
  activeRepresentationBytes=650_000_000,
}={}){
  return Object.freeze({
    stepCount,
    capability,
    outputSetSha256:H('finalization-output|'+capability+'|'+stepCount),
    sampleCount:13,
    successCount:13,
    failureCount:critical?1:0,
    criticalFailureCount:critical?1:0,
    qualityDimensions:Object.freeze([{
      dimensionId:capability==='IMAGE_EDITING'
        ?'identity-preservation'
        :'semantic-adherence',
      lossMicrounits:critical?200_000:10_000+stepCount*100,
      criticalFailureObserved:critical,
      evidenceSha256:H('finalization-quality|'+capability+'|'+stepCount),
    }]),
    coldEndToEndLatencyMicros:8_000_000-stepCount*300_000,
    warmEndToEndLatencyMicros:7_000_000-stepCount*300_000,
    perStepLatencyMicros:900_000,
    peakRamBytes:620_000_000+stepCount*1_000_000,
    peakAcceleratorBytes:730_000_000+stepCount*2_000_000,
    activeRepresentationBytes,
    residentRepresentationBytes:650_000_000,
    flashBytesMovedPerRun:20_000_000+stepCount*4_000_000,
    hardwareProfileSha256:H('finalization-hardware'),
    runtimeIdentity:'cuda-locked-runtime-v1',
    providerIdentity:'protected-local-benchmark',
    measurementMethodSha256:H('finalization-method'),
    measurementEvidenceSha256:H(
      'finalization-measurement|'+capability+'|'+stepCount,
    ),
  });
}

async function makeMatrix(representation,{
  critical=false,
  activeRepresentationBytes=650_000_000,
}={}){
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
    benchmarkBindingSha256:H('finalization-benchmark-binding'),
    benchmarkResultSha256:H('finalization-benchmark-result'),
    benchmarkAttemptId:'dense-finalization-matrix-1',
    rows:Object.freeze(rows),
    ...matrixAuthority(),
  };
  const evidenceSha256=await hsmeDenseStudentStepMatrixEvidenceV1Digest(
    {...base,evidenceSha256:H('placeholder-matrix')},
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

async function makeAttestation(representation,{reviewState='COMMERCIAL_ADMISSIBLE'}={}){
  const raw={
    schemaVersion:HSME_DENSE_BASELINE_PIN_ATTESTATION_V1_SCHEMA,
    candidateId:HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
    representationEvidenceSha256:representation.evidenceSha256,
    representationArtifactSha256:representation.representationArtifactSha256,
    packDescriptorSha256:representation.packDescriptorSha256,
    reviewState,
    sourceUri:
      'bers://dense-student/sha256/'+representation.representationArtifactSha256,
    license:'BERS-COMMERCIAL-DENSE-STUDENT-V1',
    licenseEvidenceSha256:H('finalization-license-review'),
    ...attestationAuthority(),
  };
  return normalizeHsmeDenseBaselinePinAttestationV1(raw);
}

async function fixture(options={}){
  const representation=await makeRepresentation(options);
  const matrix=await makeMatrix(representation,options);
  const projection=await makeProjection(representation,matrix);
  const sourceDecisionSha256=await hsmeDenseBaselineDecisionV1Digest(
    SOURCE,
    hashPort,
  );
  const attestation=await makeAttestation(representation,options);
  const attestationSha256=await hsmeDenseBaselinePinAttestationV1Digest(
    attestation,
    hashPort,
  );
  const origin={
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
    sourceDecisionSha256,
    attestation,
    attestationSha256,
    origin,
  };
}

async function finalize(input,{
  attestation=input.attestation,
  attestationSha256=input.attestationSha256,
  origin=input.origin,
  sourceDecisionSha256=input.sourceDecisionSha256,
}={}){
  return finalizeHsmeDenseBaselineV1(
    SOURCE,
    sourceDecisionSha256,
    input.representation,
    input.matrix,
    input.projection,
    attestation,
    attestation===null?null:attestationSha256,
    origin,
    hashPort,
  );
}

test('exact measured evidence plus verified commercial review produces valid non-persisted pin candidate',async()=>{
  const input=await fixture();
  const result=await finalize(input);

  assert.equal(
    result.state,
    'DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED',
  );
  assert.equal(result.disposition,'ADVANCE');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.canonicalDecisionPersistAllowed,false);
  assert.equal(result.decisionCandidate.decisionStatus,'BASELINE_PINNED');
  assert.equal(
    result.decisionCandidate.selectedCandidateId,
    HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID,
  );
  assert.equal(Object.hasOwn(result.decisionCandidate,'trainingTarget'),false);
  assert.equal(
    result.decisionCandidate.baselinePin.contentSha256,
    input.representation.representationArtifactSha256,
  );
  assert.equal(
    result.decisionCandidate.baselinePin.packageBytes,
    input.representation.representationBytes,
  );
  assert.equal(
    result.decisionCandidate.baselinePin.toolchainLockSha256,
    input.representation.exportToolchainSha256,
  );
  assert.equal(
    result.decisionCandidate.baselinePin.evaluationContractSha256,
    input.matrix.benchmarkBindingSha256,
  );
  assert.equal(
    result.decisionCandidate.baselinePin.qualityEvidenceSha256,
    input.matrix.evidenceSha256,
  );
  assert.equal(
    result.decisionCandidate.baselinePin.runtimeEvidenceSha256,
    input.projection.projectedEvidenceSha256,
  );
  assert.equal(
    result.decisionCandidate.baselinePin.hsmeBindingEvidenceSha256,
    input.representation.packDescriptorSha256,
  );
  assert.match(result.decisionCandidateSha256,/^[0-9a-f]{64}$/);
  assert.match(result.finalizationEvidenceSha256,/^[0-9a-f]{64}$/);

  const normalizedSource=normalizeHsmeDenseBaselineDecisionV1(SOURCE_RAW);
  for(const candidate of normalizedSource.candidates){
    if(candidate.candidateId===HSME_DENSE_STUDENT_TARGET_CANDIDATE_ID)continue;
    assert.deepEqual(
      result.decisionCandidate.candidates.find(
        value=>value.candidateId===candidate.candidateId,
      ),
      candidate,
    );
  }
});

test('projection digest helpers exactly reproduce canonical projection digests',async()=>{
  const input=await fixture();
  assert.equal(
    await hsmeDenseStudentDualBudgetProjectionV1Digest(
      input.projection,
      hashPort,
    ),
    input.projection.projectionEvidenceSha256,
  );
  assert.equal(
    await hsmeDenseBaselineProjectedDualBudgetEvidenceV1Digest(
      input.projection.projectedEvidence,
      hashPort,
    ),
    input.projection.projectedEvidenceSha256,
  );
});

test('no external commercial review remains PIN_REVIEW_BLOCKED',async()=>{
  const input=await fixture();
  const result=await finalize(input,{attestation:null,attestationSha256:null});
  assert.equal(result.state,'DENSE_BASELINE_PIN_REVIEW_BLOCKED');
  assert.equal(result.disposition,'BLOCKED');
  assert.deepEqual(
    result.blockers,
    ['DENSE_FINALIZATION_COMMERCIAL_LICENSE_REVIEW_REQUIRED'],
  );
  assert.equal(result.decisionCandidate,null);
});

test('commercial rejection produces REJECT without pin candidate',async()=>{
  const input=await fixture({reviewState:'REJECTED'});
  const result=await finalize(input);
  assert.equal(result.state,'DENSE_BASELINE_REJECTED');
  assert.equal(result.disposition,'REJECT');
  assert.deepEqual(result.blockers,['DENSE_FINALIZATION_LICENSE_REJECTED']);
  assert.equal(result.decisionCandidate,null);
});

test('critical quality failure produces REDESIGN before license pinning',async()=>{
  const input=await fixture({critical:true});
  const result=await finalize(input);
  assert.equal(result.state,'DENSE_BASELINE_REDESIGN_REQUIRED');
  assert.equal(result.disposition,'REDESIGN');
  assert.ok(result.blockers.some(
    value=>value.startsWith('DENSE_FINALIZATION_CRITICAL_FAILURE:'),
  ));
  assert.equal(result.decisionCandidate,null);
});

test('active-weight budget overrun produces REDESIGN',async()=>{
  const input=await fixture({activeRepresentationBytes:900_000_000});
  const result=await finalize(input);
  assert.equal(result.state,'DENSE_BASELINE_REDESIGN_REQUIRED');
  assert.ok(
    result.blockers.includes('DENSE_FINALIZATION_ACTIVE_WEIGHTS_BUDGET_EXCEEDED'),
  );
});

test('training target parameter envelope remains binding',async()=>{
  const input=await fixture({activeParametersMillions:499});
  const result=await finalize(input);
  assert.equal(result.state,'DENSE_BASELINE_REDESIGN_REQUIRED');
  assert.ok(
    result.blockers.includes('DENSE_FINALIZATION_ACTIVE_PARAMETER_TARGET_MISMATCH'),
  );
});

test('separate text conditioner blocks pinning until exact component bytes exist',async()=>{
  const input=await fixture({textConditioner:H('separate-text-conditioner')});
  const result=await finalize(input);
  assert.equal(result.state,'DENSE_BASELINE_PIN_REVIEW_BLOCKED');
  assert.deepEqual(
    result.blockers,
    ['DENSE_FINALIZATION_TEXT_CONDITIONER_BYTES_REQUIRED'],
  );
});

test('source decision origin or attestation origin failure is INVALID',async()=>{
  const input=await fixture();
  let result=await finalize(input,{
    origin:{
      ...input.origin,
      async verifySourceDecision(){return false;},
    },
  });
  assert.equal(result.state,'DENSE_BASELINE_FINALIZATION_INVALID');
  assert.ok(
    result.blockers.includes(
      'DENSE_FINALIZATION_SOURCE_DECISION_ORIGIN_UNVERIFIED',
    ),
  );

  result=await finalize(input,{
    origin:{
      ...input.origin,
      async verifyPinAttestation(){return false;},
    },
  });
  assert.equal(result.state,'DENSE_BASELINE_FINALIZATION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['DENSE_FINALIZATION_ATTESTATION_ORIGIN_UNVERIFIED'],
  );
});

test('attestation cannot drift from exact representation identity',async()=>{
  const input=await fixture();
  const forged={
    ...input.attestation,
    representationArtifactSha256:H('different-representation-artifact'),
    sourceUri:'bers://dense-student/sha256/'+H('different-representation-artifact'),
  };
  const forgedSha=await hsmeDenseBaselinePinAttestationV1Digest(
    forged,
    hashPort,
  );
  const result=await finalize(input,{
    attestation:forged,
    attestationSha256:forgedSha,
    origin:{
      ...input.origin,
      async verifyPinAttestation(value,expected){
        return expected===forgedSha
          &&JSON.stringify(value)===
            JSON.stringify(normalizeHsmeDenseBaselinePinAttestationV1(forged));
      },
    },
  });
  assert.equal(result.state,'DENSE_BASELINE_FINALIZATION_INVALID');
  assert.deepEqual(
    result.blockers,
    ['DENSE_FINALIZATION_ATTESTATION_BINDING_MISMATCH'],
  );
});

test('same exact evidence produces byte-identical finalization candidate',async()=>{
  const input=await fixture();
  const first=await finalize(input);
  const second=await finalize(input);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.equal(
    await hsmeDenseBaselineFinalizationV1Digest(first,hashPort),
    first.finalizationEvidenceSha256,
  );
});

test('finalization grants no persistence, fleet, provider or production authority',async()=>{
  const result=await finalize(await fixture());
  for(const field of [
    'canonicalDecisionPersistAllowed',
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

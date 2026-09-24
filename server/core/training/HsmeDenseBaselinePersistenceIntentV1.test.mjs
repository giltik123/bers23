import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
  HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1_SCHEMA,
  hsmeDenseBaselinePersistenceApprovalV1Digest,
  hsmeDenseBaselinePersistenceIntentV1Digest,
  proveHsmeDenseBaselinePersistenceIntentV1,
} from './HsmeDenseBaselinePersistenceIntentV1.ts';
import {
  hsmeDenseStudentSelectedBaselineFinalizationV1Digest,
} from './HsmeDenseStudentSelectedBaselineFinalizationV1.ts';
import {
  HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA,
  hsmeDenseBaselineFinalizationV1Digest,
} from './HsmeDenseBaselineFinalizationV1.ts';
import {
  HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
  serializeHsmeDenseBaselineDecisionV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

const trueSelectedOrigin={
  async verifySelectedBaselineFinalization(){return true;},
};
const trueSourceOrigin={
  async verifySourceDecision(){return true;},
};
const trueApprovalOrigin={
  async verifyPersistenceApproval(){return true;},
};
const falseSelectedOrigin={
  async verifySelectedBaselineFinalization(){return false;},
};

function h(ch){return ch.repeat(64);}
function authority(){
  return {
    canonicalDecisionPersistAllowed:false,
    fileMutationAllowed:false,
    trainingExecutionAllowed:false,
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
function selectedAuthority(){
  const value=authority();
  delete value.fileMutationAllowed;
  return {
    baselineSelectionAllowed:false,
    ...value,
  };
}
function finalizationAuthority(){
  const value=authority();
  delete value.fileMutationAllowed;
  delete value.trainingExecutionAllowed;
  delete value.checkpointPromotionAllowed;
  return value;
}

async function fixture(){
  const currentBytes=await readFile(new URL(
    '../../../src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json',
    import.meta.url,
  ));
  const source=normalizeHsmeDenseBaselineDecisionV1(
    JSON.parse(currentBytes.toString('utf8')),
  );
  const sourceSha=await hsmeDenseBaselineDecisionV1Digest(source,hash);
  const currentFileSha=await hash.sha256(currentBytes);

  const targetId=source.selectedCandidateId;
  const candidate=normalizeHsmeDenseBaselineDecisionV1({
    schemaVersion:HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
    decisionStatus:'BASELINE_PINNED',
    rationale:[
      ...source.rationale,
      'Synthetic persistence-intent fixture pins the measured dense student without granting write authority.',
    ],
    candidates:source.candidates.map(value=>
      value.candidateId===targetId
        ?{
          ...value,
          verdict:'SELECTED_BASELINE',
          metrics:{
            ...value.metrics,
            parametersMillions:600,
            fullPipelineBytes:700000000,
            textConditionerBytes:0,
            supportedStepCounts:[2,4,6,8],
          },
        }
        :value
    ),
    selectedCandidateId:targetId,
    baselinePin:{
      modelId:'bers-dense-core-v1',
      version:'synthetic-v1',
      sourceUri:'https://example.invalid/bers-dense-core-v1/'+h('1'),
      sourceRevision:h('1'),
      contentSha256:h('1'),
      packageBytes:700000000,
      license:'synthetic-commercial-fixture',
      licenseConclusion:'COMMERCIAL_ADMISSIBLE',
      licenseEvidenceSha256:h('2'),
      toolchainLockSha256:h('3'),
      architectureConfigSha256:h('4'),
      representationManifestSha256:h('5'),
      evaluationContractSha256:h('6'),
      qualityEvidenceSha256:h('7'),
      runtimeEvidenceSha256:h('8'),
      hsmeBindingEvidenceSha256:h('9'),
    },
  });
  const candidateSha=await hsmeDenseBaselineDecisionV1Digest(candidate,hash);

  const finalizationBase={
    schemaVersion:HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA,
    state:'DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED',
    disposition:'ADVANCE',
    blockers:[],
    sourceDecisionSha256:sourceSha,
    representationEvidenceSha256:h('a'),
    stepMatrixEvidenceSha256:h('b'),
    dualBudgetProjectionSha256:h('c'),
    projectedDualBudgetEvidenceSha256:h('d'),
    packDescriptorSha256:h('e'),
    pinAttestationSha256:h('f'),
    decisionCandidateSha256:candidateSha,
    decisionCandidate:candidate,
    finalizationEvidenceSha256:h('0'),
    ...finalizationAuthority(),
  };
  const finalizationSha=await hsmeDenseBaselineFinalizationV1Digest(
    finalizationBase,
    hash,
  );
  const finalization={
    ...finalizationBase,
    finalizationEvidenceSha256:finalizationSha,
  };

  const selectedBase={
    schemaVersion:'BERS_HSME_DENSE_STUDENT_SELECTED_BASELINE_FINALIZATION_V1',
    state:'SELECTED_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED',
    blockers:[],
    selectedDualBudgetProjectionSha256:h('1'),
    selectedTrainingTargetStepCount:4,
    representationEvidenceSha256:h('a'),
    stepMatrixEvidenceSha256:h('b'),
    dualBudgetProjectionSha256:h('c'),
    denseBaselineFinalizationSha256:finalizationSha,
    finalization,
    evidenceSha256:h('0'),
    ...selectedAuthority(),
  };
  const selectedSha=
    await hsmeDenseStudentSelectedBaselineFinalizationV1Digest(selectedBase,hash);
  const selected={...selectedBase,evidenceSha256:selectedSha};

  const nextCanonicalJson=serializeHsmeDenseBaselineDecisionV1(candidate);
  const nextFileSha=await hash.sha256(
    new TextEncoder().encode(nextCanonicalJson+'\n'),
  );
  const approval={
    schemaVersion:HSME_DENSE_BASELINE_PERSISTENCE_APPROVAL_V1_SCHEMA,
    selectedBaselineFinalizationSha256:selectedSha,
    sourceDecisionSha256:sourceSha,
    decisionCandidateSha256:candidateSha,
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentFileSha256:currentFileSha,
    expectedNextDecisionSha256:candidateSha,
    expectedNextFileSha256:nextFileSha,
    reviewState:'APPROVED',
    approvalId:'synthetic-approval-001',
    ...authority(),
  };
  const approvalSha=await hsmeDenseBaselinePersistenceApprovalV1Digest(
    approval,
    hash,
  );

  return {
    currentBytes,
    source,
    sourceSha,
    currentFileSha,
    candidate,
    candidateSha,
    selected,
    selectedSha,
    approval,
    approvalSha,
    nextCanonicalJson,
    nextFileSha,
  };
}

async function prove(f,overrides={}){
  return proveHsmeDenseBaselinePersistenceIntentV1(
    overrides.selected??f.selected,
    overrides.selectedSha??f.selectedSha,
    overrides.selectedOrigin??trueSelectedOrigin,
    overrides.source??f.source,
    overrides.sourceSha??f.sourceSha,
    overrides.sourceOrigin??trueSourceOrigin,
    overrides.currentBytes??f.currentBytes,
    overrides.currentFileSha??f.currentFileSha,
    overrides.approval??f.approval,
    overrides.approvalSha??f.approvalSha,
    overrides.approvalOrigin??trueApprovalOrigin,
    hash,
  );
}

test('exact reviewed before/after state yields deterministic READY_NOT_COMMITTED intent',async()=>{
  const f=await fixture();
  const first=await prove(f);
  const second=await prove(f);

  assert.equal(first.state,'PERSISTENCE_INTENT_READY_NOT_COMMITTED');
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.selectedBaselineFinalizationSha256,f.selectedSha);
  assert.equal(first.approvalEvidenceSha256,f.approvalSha);
  assert.equal(first.expectedCurrentDecisionSha256,f.sourceSha);
  assert.equal(first.expectedCurrentFileSha256,f.currentFileSha);
  assert.equal(first.nextDecisionSha256,f.candidateSha);
  assert.equal(first.nextFileSha256,f.nextFileSha);
  assert.equal(first.nextCanonicalJson,f.nextCanonicalJson);
  assert.equal(first.canonicalDecisionPersistAllowed,false);
  assert.equal(first.fileMutationAllowed,false);
  assert.equal(first.modelInstallAllowed,false);
  assert.equal(first.productionAuthorityGranted,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeDenseBaselinePersistenceIntentV1Digest(first,hash),
    first.persistenceIntentSha256,
  );
});

test('stale raw current-file SHA fails closed',async()=>{
  const f=await fixture();
  const result=await prove(f,{currentFileSha:h('0')});
  assert.equal(result.state,'PERSISTENCE_INTENT_INVALID');
  assert.ok(result.blockers.includes('PERSISTENCE_INTENT_CURRENT_FILE_SHA_MISMATCH'));
});

test('raw current file with different normalized semantics fails even when raw SHA is pinned',async()=>{
  const f=await fixture();
  const changed=normalizeHsmeDenseBaselineDecisionV1({
    ...f.source,
    rationale:[...f.source.rationale,'Synthetic semantic drift marker.'],
  });
  const bytes=new TextEncoder().encode(
    JSON.stringify(changed,null,2)+'\n',
  );
  const rawSha=await hash.sha256(bytes);
  const result=await prove(f,{currentBytes:bytes,currentFileSha:rawSha});
  assert.equal(result.state,'PERSISTENCE_INTENT_INVALID');
  assert.ok(result.blockers.includes('PERSISTENCE_INTENT_CURRENT_FILE_SEMANTIC_MISMATCH'));
});

test('externally pinned approval drift fails closed',async()=>{
  const f=await fixture();
  const approval={...f.approval,expectedNextFileSha256:h('0')};
  const approvalSha=await hsmeDenseBaselinePersistenceApprovalV1Digest(
    approval,
    hash,
  );
  const result=await prove(f,{approval,approvalSha});
  assert.equal(result.state,'PERSISTENCE_INTENT_INVALID');
  assert.ok(result.blockers.includes('PERSISTENCE_INTENT_APPROVAL_BINDING_MISMATCH'));
});

test('selected finalization exact-origin refusal fails before intent creation',async()=>{
  const f=await fixture();
  const result=await prove(f,{selectedOrigin:falseSelectedOrigin});
  assert.equal(result.state,'PERSISTENCE_INTENT_INVALID');
  assert.ok(result.blockers.includes('PERSISTENCE_INTENT_SELECTED_ORIGIN_UNVERIFIED'));
});

test('non-ready selected finalization stays BLOCKED and cannot mint persistence authority',async()=>{
  const f=await fixture();
  const selected={
    ...f.selected,
    state:'SELECTED_BASELINE_FINALIZATION_BLOCKED',
    blockers:['PIN_REVIEW_REQUIRED'],
  };
  const result=await prove(f,{selected});
  assert.equal(result.state,'PERSISTENCE_INTENT_BLOCKED');
  assert.equal(result.persistenceIntentSha256,'UNKNOWN');
  assert.equal(result.canonicalDecisionPersistAllowed,false);
  assert.equal(result.fileMutationAllowed,false);
});

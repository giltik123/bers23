import assert from 'node:assert/strict';
import test from 'node:test';

import {
  proveHsmeTeacherAdmissionEligibilityV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionEligibilityV1.ts';
import {
  HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionGateV1.ts';
import {
  finalizeHsmeTeacherAdmissionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionFinalizationV1.ts';
import {
  H,
  hashPort,
  makeManifests,
  buildQualityAssembly,
  buildRosterRefresh,
  makeLicenseReview,
  makeToolchain,
  makeEligibilityOrigin,
} from './helpers/hsme-teacher-admission-v1-fixture.mjs';

async function fixture(){
  const manifests=makeManifests();
  const qualityAssembly=await buildQualityAssembly({manifests});
  const rosterRefresh=await buildRosterRefresh({qualityAssembly,manifests});
  assert.equal(rosterRefresh.state,'ROSTER_REFRESH_READY');

  const selectedIds=[
    'qwen-image-2512-quality-teacher',
    'qwen-image-edit-2511-quality-teacher',
  ];
  const selectedManifests=selectedIds.map(
    id=>manifests.find(value=>value.teacherCandidateId===id),
  );
  const reviews=[];
  const toolchains=[];
  for(const manifest of selectedManifests){
    reviews.push(await makeLicenseReview(manifest));
    toolchains.push(await makeToolchain(manifest));
  }
  const eligibility=await proveHsmeTeacherAdmissionEligibilityV1(
    rosterRefresh,
    qualityAssembly,
    manifests,
    reviews,
    toolchains,
    makeEligibilityOrigin(),
    hashPort,
  );
  assert.equal(eligibility.state,'ELIGIBILITY_READY',JSON.stringify(eligibility));
  assert.deepEqual(eligibility.eligibleTeacherIds,selectedIds);
  return {
    manifests,
    qualityAssembly,
    rosterRefresh,
    reviews,
    toolchains,
    eligibility,
    selectedIds,
  };
}

function finalOrigin(ok=true){
  return {
    async verifyEligibility(){return ok;},
  };
}

test('eligible Qwen T2I + Edit composite covers all capabilities and passes canonical admission gate',async()=>{
  const f=await fixture();
  const selectionRationaleSha256=H('product-selection-rationale-v1');
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    f.selectedIds,
    selectionRationaleSha256,
    finalOrigin(),
    hashPort,
  );

  assert.equal(result.state,'TEACHER_SET_ADMITTED_READY');
  assert.deepEqual(result.blockers,[]);
  assert.deepEqual(result.selectedTeacherIds,f.selectedIds);
  assert.match(result.eligibilityEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.rosterRefreshSha256,/^[0-9a-f]{64}$/);
  assert.match(result.qualityBakeoffAssemblySha256,/^[0-9a-f]{64}$/);
  assert.equal(result.selectionRationaleSha256,selectionRationaleSha256);
  assert.match(result.finalDecisionSha256,/^[0-9a-f]{64}$/);
  assert.match(result.admissionGateEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.finalizationEvidenceSha256,/^[0-9a-f]{64}$/);

  assert.equal(result.finalDecision.decisionStatus,'TEACHER_SET_ADMITTED');
  assert.deepEqual(result.finalDecision.selectedCandidateIds,f.selectedIds);
  assert.equal(
    result.admissionGateEvidence.schemaVersion,
    HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA,
  );
  assert.deepEqual(
    result.admissionGateEvidence.selectedTeacherIds,
    f.selectedIds,
  );

  for(const id of f.selectedIds){
    const candidate=result.finalDecision.candidates.find(value=>value.candidateId===id);
    const entry=f.eligibility.entries.find(value=>value.teacherCandidateId===id);
    assert.equal(candidate.licenseConclusion,'COMMERCIAL_ADMISSIBLE');
    assert.equal(candidate.distillationOutputUse,'DISTILLATION_ALLOWED');
    assert.equal(candidate.licenseEvidenceSha256,entry.licenseReviewSha256);
    assert.equal(candidate.toolchainEvidenceSha256,entry.toolchainSha256);
    assert.equal(candidate.installedBytes,entry.installedBytes);
    assert.equal(candidate.workingMemoryBytes,entry.workingMemoryBytes);
  }

  const comparator=result.finalDecision.candidates.find(
    value=>value.candidateId==='flux2-klein-4b-comparator-teacher',
  );
  assert.equal(comparator.licenseConclusion,'REVIEW_REQUIRED');
  assert.equal(comparator.distillationOutputUse,'REVIEW_REQUIRED');
  assert.equal(comparator.workingMemoryBytes,'UNKNOWN');

  assert.equal(result.trainingStartAllowed,false);
  assert.equal(result.productionAuthorityGranted,false);
  assert.equal(result.providerAuthorityGranted,false);
  assert.equal(result.billingAuthorityGranted,false);
  assert.equal(result.projectArtifactMutationAllowed,false);
  assert.equal(result.aeeExecutionAuthorityGranted,false);
  assert.equal(result.durableModelFleetPromotionAllowed,false);
  assert.equal(result.winnerSelectionAllowed,false);
});

test('one eligible T2I-only teacher cannot be finalized with incomplete capability coverage',async()=>{
  const f=await fixture();
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    ['qwen-image-2512-quality-teacher'],
    H('single-selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_BLOCKED');
  assert.ok(
    result.blockers.includes('FINALIZATION_REQUIRED_CAPABILITY_UNCOVERED'),
  );
  assert.equal(result.finalDecision,null);
  assert.equal(result.trainingStartAllowed,false);
});

test('explicitly selecting a non-eligible comparator remains blocked',async()=>{
  const f=await fixture();
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    ['flux2-klein-4b-comparator-teacher'],
    H('ineligible-selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_BLOCKED');
  assert.ok(
    result.blockers.includes('FINALIZATION_SELECTED_TEACHER_NOT_ELIGIBLE'),
  );
  assert.equal(result.finalDecision,null);
});

test('no explicit selected set stays blocked and never auto-selects a winner',async()=>{
  const f=await fixture();
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    [],
    H('no-selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_BLOCKED');
  assert.ok(result.blockers.includes('FINALIZATION_SELECTION_REQUIRED'));
  assert.deepEqual(result.selectedTeacherIds,[]);
  assert.equal(result.winnerSelectionAllowed,false);
});

test('eligibility origin failure is invalid provenance, not a blocked product selection',async()=>{
  const f=await fixture();
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    f.selectedIds,
    H('selection-rationale'),
    finalOrigin(false),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(
    result.blockers.includes('FINALIZATION_ELIGIBILITY_ORIGIN_UNVERIFIED'),
  );
  assert.equal(result.finalDecision,null);
});

test('license review changed after eligibility is invalid evidence drift',async()=>{
  const f=await fixture();
  const reviews=structuredClone(f.reviews);
  reviews[0].rationale=['changed after eligibility proof'];
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    reviews,
    f.toolchains,
    f.selectedIds,
    H('selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(
    result.blockers.includes('FINALIZATION_SELECTED_LICENSE_DIGEST_DRIFT'),
  );
});

test('toolchain resource tuple changed after eligibility is invalid evidence drift',async()=>{
  const f=await fixture();
  const toolchains=structuredClone(f.toolchains);
  toolchains[0].resourceEvidence.workingMemoryBytes+=1;
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    toolchains,
    f.selectedIds,
    H('selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(
    result.blockers.includes('FINALIZATION_SELECTED_TOOLCHAIN_DIGEST_DRIFT')
    ||result.blockers.includes('FINALIZATION_SELECTED_RESOURCE_EVIDENCE_DRIFT'),
  );
});

test('invalid selection rationale digest prevents final decision construction',async()=>{
  const f=await fixture();
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    f.selectedIds,
    'not-a-sha',
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(
    result.blockers.includes('FINALIZATION_SELECTION_RATIONALE_HASH_INVALID'),
  );
});

test('extra stale evidence outside refreshed roster is invalid',async()=>{
  const f=await fixture();
  const extra=structuredClone(f.reviews[0]);
  extra.teacherCandidateId='stale-teacher';
  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    f.eligibility,
    f.qualityAssembly,
    f.manifests,
    [...f.reviews,extra],
    f.toolchains,
    f.selectedIds,
    H('selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(result.blockers.includes('FINALIZATION_LICENSE_EXTRA_CANDIDATE'));
});

test('blocked eligibility cannot be converted into admitted decision by caller selection',async()=>{
  const f=await fixture();
  const blocked=structuredClone(f.eligibility);
  blocked.state='ELIGIBILITY_BLOCKED';
  blocked.eligibleTeacherIds=[];
  blocked.entries=blocked.entries.map(value=>({...value,eligible:false}));
  blocked.eligibilityEvidenceSha256='0'.repeat(64);

  const result=await finalizeHsmeTeacherAdmissionV1(
    f.rosterRefresh,
    blocked,
    f.qualityAssembly,
    f.manifests,
    f.reviews,
    f.toolchains,
    f.selectedIds,
    H('selection-rationale'),
    finalOrigin(),
    hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(
    result.blockers.includes('FINALIZATION_ELIGIBILITY_REHASH_MISMATCH'),
  );
});

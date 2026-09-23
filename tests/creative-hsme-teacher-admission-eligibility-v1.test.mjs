import assert from 'node:assert/strict';
import test from 'node:test';

import {
  proveHsmeTeacherAdmissionEligibilityV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionEligibilityV1.ts';
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

async function baseFixture({failedCandidates=[]}={}){
  const manifests=makeManifests();
  const qualityAssembly=await buildQualityAssembly({manifests,failedCandidates});
  const rosterRefresh=await buildRosterRefresh({qualityAssembly,manifests});
  assert.equal(rosterRefresh.state,'ROSTER_REFRESH_READY');
  return {manifests,qualityAssembly,rosterRefresh};
}

test('one fully evidenced quality-qualified teacher becomes eligible without selection authority',async()=>{
  const fixture=await baseFixture();
  const target=fixture.manifests.find(
    value=>value.teacherCandidateId==='qwen-image-2512-quality-teacher',
  );
  const review=await makeLicenseReview(target);
  const toolchain=await makeToolchain(target);

  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [toolchain],
    makeEligibilityOrigin(),
    hashPort,
  );

  assert.equal(result.state,'ELIGIBILITY_READY',JSON.stringify(result));
  assert.deepEqual(result.blockers,[]);
  assert.deepEqual(result.eligibleTeacherIds,['qwen-image-2512-quality-teacher']);
  assert.deepEqual(
    result.requiredCapabilities,
    ['IMAGE_EDITING','MULTI_REFERENCE_EDITING','TEXT_TO_IMAGE'],
  );
  assert.match(result.rosterRefreshSha256,/^[0-9a-f]{64}$/);
  assert.match(result.refreshedDecisionSha256,/^[0-9a-f]{64}$/);
  assert.match(result.qualityBakeoffAssemblySha256,/^[0-9a-f]{64}$/);
  assert.match(result.eligibilityEvidenceSha256,/^[0-9a-f]{64}$/);

  const eligible=result.entries.find(value=>value.eligible);
  assert.equal(eligible.teacherCandidateId,'qwen-image-2512-quality-teacher');
  assert.equal(eligible.qualityGatePassed,true);
  assert.equal(eligible.workingMemoryBytes,4000);
  assert.equal(eligible.workingMemoryKind,'MEASURED');
  assert.match(eligible.licenseReviewSha256,/^[0-9a-f]{64}$/);
  assert.match(eligible.toolchainSha256,/^[0-9a-f]{64}$/);

  assert.equal(result.teacherSelectionAllowed,false);
  assert.equal(result.teacherAdmissionAllowed,false);
  assert.equal(result.trainingStartAllowed,false);
  assert.equal(result.productionAuthorityGranted,false);
  assert.equal(result.providerAuthorityGranted,false);
  assert.equal(result.billingAuthorityGranted,false);
  assert.equal(result.projectArtifactMutationAllowed,false);
  assert.equal(result.aeeExecutionAuthorityGranted,false);
  assert.equal(result.durableModelFleetPromotionAllowed,false);
  assert.equal(result.winnerSelectionAllowed,false);
});

test('permissive declared model license alone cannot create eligibility',async()=>{
  const fixture=await baseFixture();
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [],
    [],
    makeEligibilityOrigin(),
    hashPort,
  );
  assert.equal(result.state,'ELIGIBILITY_BLOCKED');
  assert.deepEqual(result.eligibleTeacherIds,[]);
  for(const entry of result.entries){
    assert.ok(entry.blockers.includes('CANDIDATE_LICENSE_REVIEW_MISSING'));
    assert.ok(entry.blockers.includes('CANDIDATE_TOOLCHAIN_MISSING'));
  }
});

test('explicit REVIEW_REQUIRED distillation-output rights remain blocked',async()=>{
  const fixture=await baseFixture();
  const target=fixture.manifests[0];
  const review=await makeLicenseReview(target,{
    commercialUseConclusion:'COMMERCIAL_ADMISSIBLE',
    distillationOutputUse:'REVIEW_REQUIRED',
  });
  const toolchain=await makeToolchain(target);
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [toolchain],
    makeEligibilityOrigin(),
    hashPort,
  );
  const entry=result.entries.find(
    value=>value.teacherCandidateId===target.teacherCandidateId,
  );
  assert.equal(entry.eligible,false);
  assert.ok(
    entry.blockers.includes('CANDIDATE_DISTILLATION_OUTPUT_RIGHTS_NOT_ADMITTED'),
  );
});

test('quality failure cannot be compensated by rights or toolchain evidence',async()=>{
  const failed='qwen-image-2512-quality-teacher';
  const fixture=await baseFixture({failedCandidates:[failed]});
  const target=fixture.manifests.find(value=>value.teacherCandidateId===failed);
  const review=await makeLicenseReview(target);
  const toolchain=await makeToolchain(target);
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [toolchain],
    makeEligibilityOrigin(),
    hashPort,
  );
  const entry=result.entries.find(value=>value.teacherCandidateId===failed);
  assert.equal(entry.eligible,false);
  assert.equal(entry.qualityGatePassed,false);
  assert.ok(entry.blockers.includes('CANDIDATE_QUALITY_GATE_FAILED'));
});

test('incomplete runtime-artifact license coverage blocks eligibility',async()=>{
  const fixture=await baseFixture();
  const target=fixture.manifests[0];
  const review=await makeLicenseReview(target,{omitLogicalIds:['model-config']});
  const toolchain=await makeToolchain(target);
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [toolchain],
    makeEligibilityOrigin(),
    hashPort,
  );
  const entry=result.entries.find(
    value=>value.teacherCandidateId===target.teacherCandidateId,
  );
  assert.equal(entry.eligible,false);
  assert.ok(
    entry.blockers.includes('CANDIDATE_RUNTIME_LICENSE_COVERAGE_INCOMPLETE'),
  );
});

test('toolchain resource evidence must match canonical installed bytes',async()=>{
  const fixture=await baseFixture();
  const target=fixture.manifests[0];
  const review=await makeLicenseReview(target);
  const toolchain=await makeToolchain(target);
  toolchain.resourceEvidence.installedBytes+=1;
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [toolchain],
    makeEligibilityOrigin(),
    hashPort,
  );
  const entry=result.entries.find(
    value=>value.teacherCandidateId===target.teacherCandidateId,
  );
  assert.equal(entry.eligible,false);
  assert.ok(
    entry.blockers.includes('CANDIDATE_TOOLCHAIN_INSTALLED_BYTES_MISMATCH'),
  );
});

test('forged license-review origin is INVALID rather than ordinary blocked evidence',async()=>{
  const fixture=await baseFixture();
  const target=fixture.manifests[0];
  const review=await makeLicenseReview(target);
  const toolchain=await makeToolchain(target);
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [toolchain],
    makeEligibilityOrigin({license:false}),
    hashPort,
  );
  assert.equal(result.state,'ELIGIBILITY_INVALID');
  assert.ok(
    result.blockers.includes('ELIGIBILITY_LICENSE_REVIEW_ORIGIN_UNVERIFIED'),
  );
  assert.deepEqual(result.entries,[]);
  assert.deepEqual(result.eligibleTeacherIds,[]);
});

test('forged roster-refresh origin is INVALID before candidate eligibility',async()=>{
  const fixture=await baseFixture();
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [],
    [],
    makeEligibilityOrigin({roster:false}),
    hashPort,
  );
  assert.equal(result.state,'ELIGIBILITY_INVALID');
  assert.ok(
    result.blockers.includes('ELIGIBILITY_ROSTER_REFRESH_ORIGIN_UNVERIFIED'),
  );
});

test('manifest origin failure is INVALID, not a candidate rights blocker',async()=>{
  const fixture=await baseFixture();
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [],
    [],
    makeEligibilityOrigin({manifest:false}),
    hashPort,
  );
  assert.equal(result.state,'ELIGIBILITY_INVALID');
  assert.ok(result.blockers.includes('ELIGIBILITY_MANIFEST_ORIGIN_UNVERIFIED'));
});

test('extra stale license review outside refreshed roster fails closed as INVALID',async()=>{
  const fixture=await baseFixture();
  const target=fixture.manifests[0];
  const review=await makeLicenseReview(target);
  review.teacherCandidateId='stale-teacher';
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    fixture.qualityAssembly,
    fixture.manifests,
    [review],
    [],
    makeEligibilityOrigin(),
    hashPort,
  );
  assert.equal(result.state,'ELIGIBILITY_INVALID');
  assert.ok(
    result.blockers.includes('ELIGIBILITY_LICENSE_REVIEW_EXTRA_CANDIDATE'),
  );
});

test('quality assembly must remain exactly bound to the roster refresh proof',async()=>{
  const fixture=await baseFixture();
  const other=structuredClone(fixture.qualityAssembly);
  other.bakeoffAssemblySha256=H('different-quality-assembly');
  const result=await proveHsmeTeacherAdmissionEligibilityV1(
    fixture.rosterRefresh,
    other,
    fixture.manifests,
    [],
    [],
    makeEligibilityOrigin(),
    hashPort,
  );
  assert.equal(result.state,'ELIGIBILITY_INVALID');
  assert.ok(
    result.blockers.includes('ELIGIBILITY_QUALITY_ASSEMBLY_REHASH_MISMATCH'),
  );
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/realesrgan-release.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('Real-ESRGAN release is manual main-only and uses a dedicated signing domain', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /GITHUB_REF_NAME.*main/);
  assert.match(workflow, /secrets\.REALESRGAN_RELEASE_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /MOBILESAM_RELEASE_PRIVATE_KEY/);
  assert.match(workflow, /bers-super-resolution-release-2026-08/);
});

test('candidate release verifies official bytes, signatures, publication and tamper rejection', () => {
  assert.match(workflow, /CHECKPOINT_SHA256: 8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292/);
  assert.match(workflow, /sha256sum --check --strict/);
  assert.match(workflow, /build-realesrgan-x4v3-release\.py/);
  assert.match(workflow, /pkeyutl -sign -rawin/);
  assert.match(workflow, /Tampered Real-ESRGAN artifact signature was accepted/);
  assert.match(workflow, /published-release/);
  assert.match(workflow, /pkeyutl -verify -rawin -pubin/);
});

test('release workflow cannot promote Real-ESRGAN or track ONNX in Git', () => {
  assert.match(workflow, /manifest\['status'\] == 'CANDIDATE'/);
  assert.match(workflow, /productionApprovalEvidence.*None/);
  assert.doesNotMatch(workflow, /manifest\[['"]status['"]\]\s*=\s*['"]PRODUCTION_APPROVED['"]/);
  assert.match(workflow, /git ls-files '\*\.onnx'/);
  assert.match(workflow, /git log --all.*'\*\.onnx'/);
  assert.doesNotMatch(workflow, /git add[^\n]*\.onnx/);
});

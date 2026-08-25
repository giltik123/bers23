import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../.github/workflows/efficientsam-release.yml', import.meta.url), 'utf8');

test('EfficientSAM release is manual exact-main only and uses a dedicated signing domain', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /GITHUB_REF_NAME.*main/);
  assert.match(workflow, /secrets\.EFFICIENTSAM_RELEASE_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /MOBILESAM_RELEASE_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /REALESRGAN_RELEASE_PRIVATE_KEY/);
  assert.match(workflow, /bers-interactive-segmentation-release-2026-08/);
});

test('release signs exact pinned upstream split artifacts and verifies publication/tamper', () => {
  assert.match(workflow, /UPSTREAM_REVISION: d525f622e6f640acf5a0fc37c7ca1f243da5bde0/);
  assert.match(workflow, /inspect-efficientsam-ti-release\.py/);
  assert.match(workflow, /efficient-sam-ti-encoder\.onnx/);
  assert.match(workflow, /efficient-sam-ti-decoder\.onnx/);
  assert.match(workflow, /pkeyutl -sign -rawin/);
  assert.match(workflow, /Tampered EfficientSAM artifact signature was accepted/);
  assert.match(workflow, /published-release/);
  assert.match(workflow, /pkeyutl -verify -rawin -pubin/);
});

test('candidate release cannot promote EfficientSAM or commit ONNX/private key material', () => {
  assert.match(workflow, /manifest\['status'\] == 'CANDIDATE'/);
  assert.match(workflow, /productionApprovalEvidence.*None/);
  assert.doesNotMatch(workflow, /manifest\[['"]status['"]\]\s*=\s*['"]PRODUCTION_APPROVED['"]/);
  assert.match(workflow, /git ls-files '\*\.onnx'/);
  assert.match(workflow, /git log --all.*'\*\.onnx'/);
  assert.doesNotMatch(workflow, /git add[^\n]*\.onnx/);
  assert.doesNotMatch(workflow, /git add[^\n]*private-key/);
});

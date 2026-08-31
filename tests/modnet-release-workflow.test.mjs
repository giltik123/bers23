import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/modnet-release.yml', import.meta.url), 'utf8');

const CHECKPOINT_SHA = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8';
const ONNX_SHA = '223bdc36ba84f9728ab4a94a7985128161514019d8388c3e827402c15072c654';
const RELEASE_MARKER = 'modnet-release-created-by-this-run';

test('MODNet release is manual exact-main only and uses a dedicated signing domain', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.match(workflow, /GITHUB_REF_NAME.*main/);
  assert.match(workflow, /MODNET_RELEASE_PRIVATE_KEY/);
  assert.match(workflow, /bers-portrait-matting-release-2026-08/);
  assert.match(workflow, /git rev-parse origin\/main/);
});

test('candidate.2 release reproduces only the exact byte-pinned checkpoint and no-folding ONNX candidate', () => {
  assert.match(workflow, /VERSION: 1\.0\.0-candidate\.2/);
  assert.match(workflow, /RELEASE_TAG: modnet-photographic-portrait-matting-v1\.0\.0-candidate\.2/);
  assert.match(workflow, /ONNX_SIZE: '26236047'/);
  assert.match(workflow, new RegExp(CHECKPOINT_SHA));
  assert.match(workflow, new RegExp(ONNX_SHA));
  assert.match(workflow, /inspect-modnet-checkpoint\.py/);
  assert.match(workflow, /--expected-sha256/);
  assert.match(workflow, /build-modnet-portrait-matting-release\.py/);
  assert.match(workflow, /torch==2\.1\.2 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /onnx==1\.15\.0/);
  assert.match(workflow, /onnxruntime==1\.16\.3/);
  assert.match(workflow, /sha256sum .*modnet-photographic-portrait-matting\.onnx/);
  assert.match(workflow, /manifest\['bersExport'\]\['constantFolding'\] is False/);
});

test('release signs, rejects tamper and re-downloads published bytes', () => {
  assert.match(workflow, /pkeyutl -sign -rawin/);
  assert.match(workflow, /Tampered MODNet artifact signature was accepted/);
  assert.match(workflow, /gh release download/);
  assert.match(workflow, /pkeyutl -verify -rawin -pubin/);
});

test('failure cleanup can delete only a release created by the current run', () => {
  const createIndex = workflow.indexOf('gh release create "${RELEASE_TAG}"');
  const markerIndex = workflow.indexOf(`touch "\${RUNNER_TEMP}/${RELEASE_MARKER}"`);
  const cleanupGateIndex = workflow.indexOf(`if test -f "\${RUNNER_TEMP}/${RELEASE_MARKER}"; then`);
  const deleteIndex = workflow.indexOf('gh release delete "${RELEASE_TAG}" --yes --cleanup-tag');

  assert.ok(createIndex >= 0, 'release create command is required');
  assert.ok(markerIndex > createIndex, 'ownership marker must be written only after release creation succeeds');
  assert.ok(cleanupGateIndex > markerIndex, 'cleanup must test ownership marker written by this run');
  assert.ok(deleteIndex > cleanupGateIndex, 'release deletion must occur only inside marker-gated cleanup');
  assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/);
  assert.equal((workflow.match(new RegExp(RELEASE_MARKER, 'g')) ?? []).length >= 2, true);
});

test('candidate release cannot grant production approval or commit model/private-key bytes', () => {
  assert.match(workflow, /assert manifest\['status'\] == 'CANDIDATE'/);
  assert.match(workflow, /assert manifest\['version'\] == os\.environ\['VERSION'\]/);
  assert.match(workflow, /manifest\['artifactState'\] = 'SIGNED_RELEASE'/);
  assert.match(workflow, /manifest\['productionApprovalEvidence'\] = None/);
  assert.doesNotMatch(workflow, /manifest\['status'\]\s*=\s*['"]PRODUCTION_APPROVED['"]/);
  assert.match(workflow, /git ls-files '\*\.ckpt' '\*\.onnx'/);
  assert.match(workflow, /PRIVATE KEY/);
  assert.match(workflow, /git diff --cached --name-only \| wc -l.*-eq 3/);
  assert.match(workflow, /portrait-matting\.manifest\.sig/);
  assert.match(workflow, /public-key\.pem/);
});

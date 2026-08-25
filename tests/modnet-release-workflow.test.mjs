import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/modnet-release.yml', import.meta.url), 'utf8');

const CHECKPOINT_SHA = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8';
const ONNX_SHA = '18d30ce06d8344549e09b02d14e7c1a8d5136c6ecd4c181d05bcd04abb884919';

test('MODNet release is manual exact-main only and uses a dedicated signing domain', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.match(workflow, /GITHUB_REF_NAME.*main/);
  assert.match(workflow, /MODNET_RELEASE_PRIVATE_KEY/);
  assert.match(workflow, /bers-portrait-matting-release-2026-08/);
  assert.match(workflow, /git rev-parse origin\/main/);
});

test('release reproduces only the exact byte-pinned checkpoint and ONNX candidate', () => {
  assert.match(workflow, new RegExp(CHECKPOINT_SHA));
  assert.match(workflow, new RegExp(ONNX_SHA));
  assert.match(workflow, /inspect-modnet-checkpoint\.py/);
  assert.match(workflow, /--expected-sha256/);
  assert.match(workflow, /build-modnet-portrait-matting-release\.py/);
  assert.match(workflow, /torch==2\.1\.2 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /onnx==1\.15\.0/);
  assert.match(workflow, /onnxruntime==1\.16\.3/);
  assert.match(workflow, /sha256sum .*modnet-photographic-portrait-matting\.onnx/);
});

test('release signs, rejects tamper, re-downloads bytes and cleans orphan release on failure', () => {
  assert.match(workflow, /pkeyutl -sign -rawin/);
  assert.match(workflow, /Tampered MODNet artifact signature was accepted/);
  assert.match(workflow, /gh release download/);
  assert.match(workflow, /pkeyutl -verify -rawin -pubin/);
  assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/);
  assert.match(workflow, /gh release delete .*--cleanup-tag/);
});

test('candidate release cannot grant production approval or commit model/private-key bytes', () => {
  assert.match(workflow, /assert manifest\['status'\] == 'CANDIDATE'/);
  assert.match(workflow, /manifest\['artifactState'\] = 'SIGNED_RELEASE'/);
  assert.match(workflow, /manifest\['productionApprovalEvidence'\] = None/);
  assert.doesNotMatch(workflow, /manifest\['status'\]\s*=\s*['"]PRODUCTION_APPROVED['"]/);
  assert.match(workflow, /git ls-files '\*\.ckpt' '\*\.onnx'/);
  assert.match(workflow, /PRIVATE KEY/);
  assert.match(workflow, /git diff --cached --name-only \| wc -l.*-eq 3/);
  assert.match(workflow, /portrait-matting\.manifest\.sig/);
  assert.match(workflow, /public-key\.pem/);
});

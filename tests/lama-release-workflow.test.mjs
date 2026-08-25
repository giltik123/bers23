import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/lama-release.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));

const ONNX_SIZE = 208593659;
const ONNX_SHA = '8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7';

test('LaMa release is manual exact-main only with a dedicated private-key secret', () => {
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: write/);
  assert.match(workflow, /secrets\.LAMA_RELEASE_PRIVATE_KEY/);
  assert.match(workflow, /test "\$\{GITHUB_REF_NAME\}" = main/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$\(git rev-parse origin\/main\)"/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('release rebuilds only exact pinned trust roots and exact C8 bytes', () => {
  assert.match(workflow, /786f5936b27fb3dacd2b1ad799e4de968ea697e7/);
  assert.match(workflow, /fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423/);
  assert.match(workflow, /4fdeed49926e13b101c4dd9e193acec9e58677dfdb4ba49dd6a3a8927964e2a7/);
  assert.match(workflow, /ONNX_SIZE: '208593659'/);
  assert.match(workflow, /ONNX_SHA256: 8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7/);
  assert.match(workflow, /torch==2\.6\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /weightsOnly/);
  assert.match(workflow, /rm -f "\$\{RUNNER_TEMP\}\/lama-release\/best\.ckpt"/);
  assert.match(workflow, /torch==2\.13\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
  assert.match(workflow, /probe-lama-cross-process-reproducibility\.py/);
  assert.match(workflow, /matchesPinnedReleaseIdentity/);
  assert.match(workflow, /stat -c%s "\$\{PACK_DIR\}\/lama-big-places-inpainting\.onnx"/);
  assert.match(workflow, /sha256sum "\$\{PACK_DIR\}\/lama-big-places-inpainting\.onnx"/);
});

test('release signs model and manifest and rejects model tampering', () => {
  assert.match(workflow, /VERIFICATION_KEY_ID: bers-lama-inpainting-release-2026-08/);
  assert.match(workflow, /openssl pkey -in/);
  assert.match(workflow, /openssl pkeyutl -sign -rawin/);
  assert.match(workflow, /openssl pkeyutl -verify -rawin -pubin/);
  assert.match(workflow, /tampered-lama\.onnx/);
  assert.match(workflow, /Tampered LaMa artifact signature was accepted/);
  assert.match(workflow, /base64 -w 0/);
  assert.match(workflow, /lama-inpainting\.manifest\.sig/);
});

test('staged release stays CANDIDATE and cannot manufacture production/device approval', () => {
  assert.match(workflow, /assert manifest\['status'\] == 'CANDIDATE'/);
  assert.match(workflow, /manifest\['artifactState'\] = 'SIGNED_RELEASE'/);
  assert.match(workflow, /manifest\['productionApprovalEvidence'\] = None/);
  assert.match(workflow, /assert manifest\['runtimeFeasibility'\]\['realDeviceWebGpu'\] == 'UNPROVEN'/);
  assert.match(workflow, /productionDeviceApproval/);
  assert.doesNotMatch(workflow, /manifest\['status'\]\s*=\s*'PRODUCTION_APPROVED'/);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(manifest.runtimeFeasibility.realDeviceWebGpu, 'UNPROVEN');
});

test('published asset is re-downloaded and byte/signature verified before metadata activation', () => {
  const create = workflow.indexOf('gh release create "${RELEASE_TAG}"');
  const marker = workflow.indexOf('touch "${RUNNER_TEMP}/lama-release-created-by-this-run"');
  const upload = workflow.indexOf('gh release upload "${RELEASE_TAG}"');
  const download = workflow.indexOf('gh release download "${RELEASE_TAG}"');
  const activate = workflow.indexOf('Atomically activate signed CANDIDATE metadata on main');
  assert.ok(create >= 0 && marker > create && upload > marker && download > upload && activate > download);
  assert.match(workflow, /assets \| length'\)" -eq 4/);
  assert.match(workflow, /\$\{published\}\/lama-big-places-inpainting\.onnx/);
  assert.match(workflow, /\$\{published\}\/lama-big-places-inpainting\.onnx\.sig/);
  assert.match(workflow, /stat -c%s "\$\{published\}\/lama-big-places-inpainting\.onnx"/);
  assert.match(workflow, /sha256sum "\$\{published\}\/lama-big-places-inpainting\.onnx"/);
});

test('failure cleanup is ownership-gated and activation commits metadata only', () => {
  const markerGate = workflow.indexOf('if test -f "${RUNNER_TEMP}/lama-release-created-by-this-run"');
  const deleteRelease = workflow.indexOf('gh release delete "${RELEASE_TAG}"');
  assert.ok(markerGate >= 0 && deleteRelease > markerGate);
  assert.match(workflow, /git add "\$\{model_dir\}\/lama-inpainting\.manifest\.json"/);
  assert.match(workflow, /"\$\{model_dir\}\/lama-inpainting\.manifest\.sig"/);
  assert.match(workflow, /"\$\{key_dir\}\/\$\{VERIFICATION_KEY_ID\}\.public-key\.pem"/);
  assert.match(workflow, /git diff --cached --name-only \| wc -l\)" -eq 3/);
  assert.doesNotMatch(workflow, /git add[^\n]*\.onnx/);
  assert.match(workflow, /git ls-files '\*\.ckpt' '\*\.pth' '\*\.pt' '\*\.safetensors' '\*\.onnx' '\*\.ort'/);
  assert.match(workflow, /BEGIN \(ED25519 \|EC \|RSA \|OPENSSH \)\?PRIVATE KEY/);
});

test('current pre-release manifest is exact pinned C8 candidate identity', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.ok(['EXPORT_PINNED_RELEASE_REQUIRED', 'SIGNED_RELEASE'].includes(manifest.artifactState));
  assert.equal(manifest.bersArtifact.state, 'PINNED');
  assert.equal(manifest.bersArtifact.size, ONNX_SIZE);
  assert.equal(manifest.bersArtifact.sha256, ONNX_SHA);
  assert.equal(manifest.bersArtifact.opset, 18);
});

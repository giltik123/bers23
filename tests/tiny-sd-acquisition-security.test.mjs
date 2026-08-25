import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inspector = await readFile(new URL('../scripts/inspect-tiny-sd-snapshot.py', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../scripts/bridge-tiny-sd-safetensors.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42d1-tiny-sd-acquisition.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json', import.meta.url), 'utf8'));

test('snapshot inspector inventories exact runtime files without deserializing weights', () => {
  assert.match(inspector, /EXPECTED_FILES = \(/);
  assert.match(inspector, /--expected-manifest/);
  assert.match(inspector, /identityState.*PINNED/);
  assert.match(inspector, /Tiny-SD pinned runtime identity mismatch/);
  assert.match(inspector, /matchesPinnedManifest.*True/);
  assert.match(inspector, /text_encoder\/pytorch_model\.bin/);
  assert.match(inspector, /unet\/diffusion_pytorch_model\.bin/);
  assert.match(inspector, /vae\/diffusion_pytorch_model\.bin/);
  assert.match(inspector, /hashlib\.sha256/);
  assert.match(inspector, /symlinked runtime file rejected/);
  assert.match(inspector, /StableDiffusionPipeline/);
  assert.doesNotMatch(inspector, /torch\.load/);
  assert.doesNotMatch(inspector, /pickle\.load/);
});

test('bridge verifies recorded bytes before restricted weights-only deserialization', () => {
  const verifySha = bridge.indexOf('actual_sha = sha256_file(source)');
  const driftGate = bridge.indexOf('source weight drift before deserialization');
  const load = bridge.indexOf('torch.load(source, map_location="cpu", weights_only=True)');
  assert.ok(verifySha >= 0 && driftGate > verifySha && load > driftGate);
  assert.match(bridge, /--expected-manifest/);
  assert.match(bridge, /matchesPinnedManifest/);
  assert.match(bridge, /Tiny-SD pinned tensor bridge identity mismatch/);
  assert.match(bridge, /weights_only=True/);
  assert.doesNotMatch(bridge, /weights_only=False/);
  assert.match(bridge, /non-tensor state_dict value/);
  assert.match(bridge, /save_file\(tensors/);
  assert.match(bridge, /pickleFreeBridge/);
  assert.match(bridge, /bridgePublished.*False/);
  assert.match(bridge, /runtimeAuthorityGranted.*False/);
});

test('hosted D1 acquisition reproduces pinned identities and destroys binaries before JSON upload', () => {
  assert.match(workflow, /cad0bd7495fa6c4bcca01b19a723dc91627fe84f/);
  assert.match(workflow, /TINY_SD_MANIFEST: src\/platform\/creative\/local-ai\/models\/tiny-sd-generation\.manifest\.json/);
  assert.match(workflow, /snapshot_download/);
  assert.match(workflow, /inspect-tiny-sd-snapshot\.py/);
  assert.match(workflow, /numpy==1\.26\.4/);
  assert.match(workflow, /torch==2\.6\.0/);
  assert.match(workflow, /safetensors==0\.8\.0/);
  assert.match(workflow, /assert numpy\.__version__ == '1\.26\.4'/);
  assert.match(workflow, /bridge-tiny-sd-safetensors\.py/);
  assert.equal((workflow.match(/--expected-manifest/g) ?? []).length, 2);
  assert.match(workflow, /inventory\['matchesPinnedManifest'\] is True/);
  assert.match(workflow, /bridge\['matchesPinnedManifest'\] is True/);
  assert.match(workflow, /rm -rf "\$\{RUNNER_TEMP\}\/tiny-sd" "\$\{RUNNER_TEMP\}\/tiny-sd-bridge"/);
  const destroy = workflow.indexOf('rm -rf "${RUNNER_TEMP}/tiny-sd" "${RUNNER_TEMP}/tiny-sd-bridge"');
  const upload = workflow.indexOf('actions/upload-artifact@v4');
  assert.ok(destroy >= 0 && upload > destroy);
  assert.doesNotMatch(workflow, /upload-artifact@[\s\S]*\.bin/);
  assert.doesNotMatch(workflow, /upload-artifact@[\s\S]*\.safetensors/);
});

test('D1 failure cleanup explicitly removes downloaded and bridged model bytes', () => {
  const failureCleanup = workflow.indexOf('Cleanup Tiny-SD binary evidence on failure');
  const failureCondition = workflow.indexOf('if: ${{ failure() }}', failureCleanup);
  const failureRm = workflow.indexOf('rm -rf "${RUNNER_TEMP}/tiny-sd" "${RUNNER_TEMP}/tiny-sd-bridge"', failureCleanup);
  assert.ok(failureCleanup >= 0 && failureCondition > failureCleanup && failureRm > failureCondition);
  assert.match(workflow.slice(failureCleanup), /test ! -e "\$\{RUNNER_TEMP\}\/tiny-sd"/);
  assert.match(workflow.slice(failureCleanup), /test ! -e "\$\{RUNNER_TEMP\}\/tiny-sd-bridge"/);
});

test('D1 pinned trust root still cannot grant release, runtime or production authority', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.licenseReview, 'REVIEWED_WITH_USE_AND_REDISTRIBUTION_OBLIGATIONS');
  assert.equal(manifest.licenseReviewEvidence.licenseIdentifier, 'creativeml-openrail-m');
  assert.equal(manifest.licenseReviewEvidence.productionApprovalGranted, false);
  assert.equal(manifest.upstream.snapshot.identityState, 'PINNED');
  assert.equal(manifest.upstream.snapshot.files.length, 12);
  assert.equal(manifest.tensorBridge.state, 'PINNED');
  assert.equal(manifest.tensorBridge.pickleFree, true);
  assert.equal(manifest.tensorBridge.ephemeral, true);
  assert.equal(manifest.tensorBridge.published, false);
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal('verificationKeyId' in manifest, false);
  assert.equal('artifacts' in manifest, false);
});

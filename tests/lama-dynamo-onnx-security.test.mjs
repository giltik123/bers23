import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const probe = await readFile(new URL('../scripts/probe-lama-dynamo-onnx.py', import.meta.url), 'utf8');
const c6 = await readFile(new URL('../scripts/inspect-lama-checkpoint.py', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/lama-inpainting.manifest.json', import.meta.url), 'utf8'));

test('C7 reuses exact C6 checkpoint identity and safe loader instead of inventing a second trust root', () => {
  assert.match(probe, /CHECKPOINT_SHA256 = "fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423"/);
  assert.match(probe, /load_c6_module/);
  assert.match(probe, /module\.CHECKPOINT_SHA256 != CHECKPOINT_SHA256/);
  assert.match(probe, /c6\.restricted_load\(checkpoint\)/);
  assert.match(probe, /c6\.build_generator\(source\)/);
  assert.match(probe, /generator\.load_state_dict\(generator_state, strict=True\)/);
  assert.match(c6, /weights_only=True/);
  assert.doesNotMatch(probe, /weights_only=False/);
  assert.doesNotMatch(probe, /pytorch_lightning/);
  assert.doesNotMatch(probe, /omegaconf/);
});

test('C7 uses native modern Dynamo export only with no ATen fallback or Fourier rewrite', () => {
  assert.match(probe, /torch\.onnx\.export\(/);
  assert.match(probe, /dynamo=True/);
  assert.match(probe, /fallback=False/);
  assert.match(probe, /OPSET = 18/);
  assert.match(probe, /external_data=False/);
  assert.match(probe, /standardDftNodeCount/);
  assert.match(probe, /node\.op_type == "DFT"/);
  assert.match(probe, /EXPORTED_REJECTED_ATEN_NODES/);
  assert.match(probe, /EXPORTED_REJECTED_CUSTOM_DOMAIN_NODES/);
  assert.match(probe, /EXPORTED_REJECTED_NO_STANDARD_DFT/);
  assert.doesNotMatch(probe, /ONNX_ATEN_FALLBACK/);
  assert.doesNotMatch(probe, /operator_export_type/);
  assert.doesNotMatch(probe, /cosine|sine matrix|FourierUnitJIT/i);
});

test('C7 environment is fully pinned and CPU ORT matches the repository browser runtime line', () => {
  assert.match(probe, /EXPECTED_TORCH_PREFIX = "2\.13\.0"/);
  assert.match(probe, /EXPECTED_ONNX = "1\.22\.0"/);
  assert.match(probe, /EXPECTED_ONNXSCRIPT = "0\.7\.1"/);
  assert.match(probe, /EXPECTED_ORT = "1\.27\.0"/);
  assert.match(probe, /providers=\["CPUExecutionProvider"\]/);
  assert.match(probe, /MAX_ABS_TOL = 2e-4/);
  assert.match(probe, /RMSE_TOL = 5e-5/);
});

test('C7 semantic smoke uses upstream mask polarity and generated proposal remains non-authoritative', () => {
  assert.match(probe, /image \* \(1\.0 - mask\)/);
  assert.match(probe, /mask\[:, :, 16:48, 20:44\] = 1\.0/);
  assert.match(probe, /generatorInputFormula/);
  assert.match(probe, /"runtimeAuthorityGranted": False/);
  assert.match(probe, /"productionPromotionAllowed"\] = False/);
  assert.match(probe, /modelRetainedOnlyAsCiEvidence/);
});

test('C7 starts from the C6 fail-closed manifest and cannot silently promote LaMa', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'CHECKPOINT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.state, 'BLOCKED_DIRECT_LEGACY_EXPORT_ALTERNATE_EXPORTER_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.cpuOrt, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.browserWasm, 'UNPROVEN');
  assert.equal(manifest.bersArtifact.state, 'UNBUILT');
  assert.equal(manifest.productionApprovalEvidence, null);
});

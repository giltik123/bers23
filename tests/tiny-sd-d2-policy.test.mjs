import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json', import.meta.url), 'utf8'));
const common = await readFile(new URL('../scripts/tiny_sd_d2_common.py', import.meta.url), 'utf8');
const reference = await readFile(new URL('../scripts/probe-tiny-sd-reference.py', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../scripts/probe-tiny-sd-component-onnx.py', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/sprint-6.42d2-tiny-sd-components.yml', import.meta.url), 'utf8');

test('D2 cannot advance Tiny-SD production or runtime authority', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED');
  assert.equal(manifest.runtimeFeasibility.state, 'UNPROVEN');
  assert.equal(manifest.runtimeFeasibility.runtimeAuthorityGranted, false);
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal('verificationKeyId' in manifest, false);
  assert.equal('artifacts' in manifest, false);
});

test('D2 uses only the D1 pinned safetensors bridge and exact synthetic vectors', () => {
  assert.match(common, /TRUST_ROOT_PINNED_RUNTIME_FEASIBILITY_REQUIRED/);
  assert.match(common, /bridgeSha256/);
  assert.match(common, /bridgeSize/);
  assert.match(common, /load_file\(str\(path\), device="cpu"\)/);
  assert.match(common, /load_state_dict\(state, strict=True\)/);
  assert.doesNotMatch(common, /torch\.load/);
  assert.doesNotMatch(common, /pickle\.load/);
  assert.match(common, /FP16 -> FP32 is an exact value-preserving widening/);
  assert.match(common, /_attn_implementation.*eager/);
  assert.match(common, /AttnProcessor\(\)/);
  assert.match(common, /torch\.arange\(SEQUENCE_LENGTH/);
  assert.match(common, /torch\.linspace/);
});

test('historical reference and modern exporter environments are independently pinned', () => {
  for (const token of ['3.10', '1.24.4', '2.0.1+cpu', '0.19.0', '4.30.2', '0.16.4', '0.3.1']) {
    assert.match(reference, new RegExp(token.replaceAll('.', '\\.').replace('+', '\\+')));
  }
  for (const token of ['2.13.0', '2.4.6', '0.39.0', '4.57.6', '0.8.0', '1.22.0', '0.7.1', '1.27.0']) {
    assert.match(exporter, new RegExp(token.replaceAll('.', '\\.')));
  }
  assert.match(reference, /HISTORICAL_LIBRARY_SEMANTICS_OVER_D1_PINNED_TENSORS/);
  assert.match(exporter, /historicalReferenceVerifiedBeforeExport/);
});

test('component export requires reference parity, standard ONNX and CPU ORT parity independently', () => {
  assert.match(exporter, /TextEncoderWrapper/);
  assert.match(exporter, /UNetWrapper/);
  assert.match(exporter, /VaeDecoderWrapper/);
  assert.match(exporter, /require_metrics\(f"\{name\} historical-reference"/);
  assert.match(exporter, /torch\.onnx\.export/);
  assert.match(exporter, /dynamo=True/);
  assert.match(exporter, /opset_version=OPSET/);
  assert.match(exporter, /onnx\.checker\.check_model/);
  assert.match(exporter, /custom-domain ONNX nodes rejected/);
  assert.match(exporter, /ATen-like ONNX nodes rejected/);
  assert.match(exporter, /CPUExecutionProvider/);
  assert.match(exporter, /releaseIdentityPinned.*False/);
  assert.match(exporter, /runtimeAuthorityGranted.*False/);
  assert.match(exporter, /productionApproval.*False/);
});

test('D2 hosted workflow destroys binary/model/reference evidence before JSON upload', () => {
  assert.match(workflow, /sprint-6\.42d1-tiny-sd-acquisition/);
  assert.match(workflow, /probe-tiny-sd-reference\.py/);
  assert.match(workflow, /probe-tiny-sd-component-onnx\.py/);
  assert.match(workflow, /diffusers==0\.19\.0/);
  assert.match(workflow, /transformers==4\.30\.2/);
  assert.match(workflow, /diffusers==0\.39\.0/);
  assert.match(workflow, /transformers==4\.57\.6/);
  const destroy = workflow.indexOf('Destroy Tiny-SD D2 binary evidence before JSON upload');
  const uploadStep = workflow.indexOf('Upload D2 JSON feasibility evidence only');
  const uploadAction = workflow.indexOf('actions/upload-artifact@v4', uploadStep);
  const publishStep = workflow.indexOf('Publish D2 summary', uploadAction);
  assert.ok(destroy >= 0 && uploadStep > destroy && uploadAction > uploadStep && publishStep > uploadAction);
  const destroyBlock = workflow.slice(destroy, uploadStep);
  assert.match(destroyBlock, /rm -rf/);
  assert.match(destroyBlock, /tiny-sd-d2-reference\.npz/);
  assert.match(destroyBlock, /tiny-sd-d2-onnx/);
  const uploadBlock = workflow.slice(uploadStep, publishStep);
  assert.match(uploadBlock, /\.json/);
  assert.doesNotMatch(uploadBlock, /\.onnx/);
  assert.doesNotMatch(uploadBlock, /\.safetensors/);
  assert.doesNotMatch(uploadBlock, /\.npz/);
});

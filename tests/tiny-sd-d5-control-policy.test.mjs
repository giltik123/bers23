import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');
const constants = read('scripts/tiny-sd-d5-control-constants.mjs');
const probe = read('scripts/probe-tiny-sd-d5-control.py');
const browserPrep = read('scripts/prepare-tiny-sd-d5-browser-tokenizer.py');
const solver = read('scripts/tiny-sd-d5-dpm-solver.mjs');
const parity = read('scripts/test-tiny-sd-d5-dpm-parity.mjs');
const browserHarness = read('scripts/test-tiny-sd-d5-control-browser.mjs');
const browserPage = read('tests/tiny-sd-d5-control-browser.html');
const workflow = read('.github/workflows/sprint-6.42d5-control-semantics.yml');

test('D5 control proof pins the actual Tiny-SD CLIP + DPM-Solver identities', () => {
  for (const needle of [
    'cad0bd7495fa6c4bcca01b19a723dc91627fe84f',
    'DPMSolverMultistepScheduler',
    'CLIPTokenizer',
    'dpmsolver++',
    'scaled_linear',
    'midpoint',
    'model_max_length',
  ]) assert.ok(probe.includes(needle), `missing pinned control identity: ${needle}`);
  assert.ok(solver.includes("algorithm_type: 'dpmsolver++'"));
  assert.ok(solver.includes("beta_schedule: 'scaled_linear'"));
  assert.ok(solver.includes("solver_type: 'midpoint'"));
  assert.ok(solver.includes('lower_order_final=true'));
});

test('D5 scheduler proof exercises exact timesteps, first/second order and state reset with measured narrow limits', () => {
  assert.match(solver, /roundTiesToEven/);
  assert.match(solver, /firstOrderUpdate/);
  assert.match(solver, /secondOrderUpdate/);
  assert.match(solver, /lowerOrderFinal/);
  assert.match(solver, /this\.modelOutputs = \[null, null\]/);
  assert.match(constants, /D5_DPM_PARITY_LIMIT/);
  assert.match(constants, /maxAbs: 8e-6/);
  assert.match(constants, /rmse: 5e-6/);
  assert.match(parity, /D5_DPM_PARITY_LIMIT/);
  assert.match(parity, /solver order drift/);
  assert.match(parity, /scheduler reset must be exactly deterministic/);
  assert.equal(parity.includes('CALIBRATION_CEILING'), false);
});

test('D5 tokenizer compatibility isolates raw BPE from historical CLIP post-processing', () => {
  assert.match(constants, /D5_TRANSFORMERS_JS_VERSION = '3\.8\.1'/);
  assert.match(probe, /CLIP_CONTENT_LIMIT = CLIP_MODEL_MAX_LENGTH - CLIP_SPECIAL_TOKEN_SLOTS/);
  assert.match(probe, /rawContentIds/);
  assert.match(probe, /BOS_PLUS_FIRST_75_CONTENT_PLUS_EOS_THEN_RIGHT_PAD/);
  assert.match(probe, /provedAgainstHistoricalTokenizer/);
  assert.match(browserPrep, /CLIPTokenizerFast/);
  assert.match(browserPrep, /save_pretrained/);
  assert.match(browserPrep, /sourceVocabSha256/);
  assert.match(browserPrep, /sourceMergesSha256/);
  assert.match(browserPrep, /pinnedSourceAssetsPreservedByteExactly/);
  assert.match(browserPrep, /shutil\.copyfile\(source, output_dir \/ name\)/);
  assert.match(browserPrep, /RUNNER_LOCAL_COMPATIBILITY_ARTIFACT_REQUIRES_BROWSER_SEMANTIC_PARITY/);
  assert.match(browserPrep, /--reference/);
  assert.match(browserPrep, /CLIPTokenizerFast\.from_pretrained\(output_dir/);
  assert.match(browserPrep, /fastVsHistoricalReferenceExact/);
  assert.match(workflow, /--reference \.test-cache\/6\.42d5-control\/tiny-sd-d5-control-reference\.json/);
  assert.match(workflow, /prep\['fastVsHistoricalReferenceExact'\] is True/);
  assert.match(browserPage, /AutoTokenizer\.from_pretrained\('tiny-sd-tokenizer'/);
  assert.match(browserPage, /env\.allowRemoteModels = false/);
  assert.match(browserPage, /env\.allowLocalModels = true/);
  assert.match(browserPage, /encodeHistoricalClip/);
  assert.match(browserPage, /add_special_tokens: false/);
  assert.match(browserPage, /truncation: false/);
  assert.match(browserPage, /rawContentIds/);
  assert.match(browserPage, /historicalPostProcessing\.contentLimit === 75/);
  assert.match(browserPage, /RAW_TRANSFORMERS_JS_BPE_PLUS_HISTORICAL_CLIP_POST_PROCESSING/);
  assert.doesNotMatch(browserPage, /truncation:\s*true/);
  assert.match(browserHarness, /exactRawContentIds/);
  assert.match(browserHarness, /externalHttpRequests/);
  assert.match(browserHarness, /assert\.deepEqual\(diagnostics\.externalHttpRequests, \[\]/);
});

test('D5 lightweight control workflow cannot masquerade as model or quality acceptance', () => {
  assert.match(workflow, /COMPOSITION_ONLY_NOT_QUALITY_ADMISSION/);
  assert.match(workflow, /model_index\.json/);
  assert.match(workflow, /scheduler\/scheduler_config\.json/);
  assert.match(workflow, /text_encoder\/config\.json/);
  assert.match(workflow, /tokenizer\/vocab\.json/);
  assert.match(workflow, /tokenizer\/merges\.txt/);
  assert.match(workflow, /TRANSFORMERS_JS_VERSION: '3\.8\.1'/);
  assert.match(workflow, /npm install --no-save --package-lock=false --ignore-scripts/);
  assert.match(workflow, /git diff --exit-code -- package\.json package-lock\.json/);
  for (const forbidden of [
    'text_encoder/pytorch_model.bin',
    'unet/diffusion_pytorch_model.bin',
    'vae/diffusion_pytorch_model.bin',
    'tiny-sd-d5-control-snapshot/**',
  ]) assert.equal(workflow.includes(forbidden), false, `control workflow must not download/upload model weights: ${forbidden}`);
  assert.match(workflow, /runtimeAuthorityGranted.*False|runtimeAuthorityGranted.*false/s);
  assert.match(workflow, /productionApproval.*False|productionApproval.*false/s);
});

test('D5 control evidence is JSON-only and generated tokenizer/model material is destroyed before upload', () => {
  assert.match(workflow, /tiny-sd-d5-control-reference\.json/);
  assert.match(workflow, /tiny-sd-d5-dpm-js-parity\.json/);
  assert.match(workflow, /tiny-sd-d5-browser-tokenizer\.json/);
  assert.match(workflow, /tiny-sd-d5-browser-control\.json/);
  assert.match(workflow, /git ls-files '\*\.ckpt'/);
  assert.match(workflow, /'\*\.onnx'/);
  assert.match(workflow, /'\*\.ort'/);
  assert.match(workflow, /'\*\.safetensors'/);
  assert.match(workflow, /rm -rf "\$\{RUNNER_TEMP\}\/tiny-sd-d5-control-snapshot" "\$\{RUNNER_TEMP\}\/tiny-sd-d5-browser-tokenizer"/);
  assert.match(workflow, /-name 'tokenizer\.json'/);
  const uploadStart = workflow.indexOf('- name: Upload JSON-only D5 control evidence');
  const uploadEnd = workflow.indexOf('- name: Summarize D5 control semantics', uploadStart);
  assert.notEqual(uploadStart, -1);
  assert.notEqual(uploadEnd, -1);
  const uploadBlock = workflow.slice(uploadStart, uploadEnd);
  const uploadedPaths = [...uploadBlock.matchAll(/^\s{12}(\.test-cache\/6\.42d5-control\/[^\s]+)$/gm)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(uploadedPaths, [
    '.test-cache/6.42d5-control/tiny-sd-d5-browser-control.json',
    '.test-cache/6.42d5-control/tiny-sd-d5-browser-tokenizer.json',
    '.test-cache/6.42d5-control/tiny-sd-d5-control-reference.json',
    '.test-cache/6.42d5-control/tiny-sd-d5-dpm-js-parity.json',
  ].sort());
  assert.equal(uploadBlock.includes('${RUNNER_TEMP}/'), false);
  assert.equal(uploadBlock.includes('.onnx'), false);
  assert.equal(uploadBlock.includes('.safetensors'), false);
});

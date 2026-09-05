import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const caller = fs.readFileSync('.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml', 'utf8');
const prep = fs.readFileSync('.github/workflows/tiny-sd-d3-wasm-d2-prep.yml', 'utf8');
const strategy = fs.readFileSync('.github/workflows/tiny-sd-d3-wasm-strategy-phase.yml', 'utf8');
const browser = fs.readFileSync('.github/workflows/tiny-sd-d3-wasm-browser-phase.yml', 'utf8');
const verifier = fs.readFileSync('scripts/verify-tiny-sd-d3-d2-handoff.py', 'utf8');
const aggregate = fs.readFileSync('scripts/aggregate-tiny-sd-d3-wasm-strategy-evidence.py', 'utf8');
const selected = fs.readFileSync('scripts/reproduce-tiny-sd-d3-selected-wasm-component.py', 'utf8');
const browserHarness = fs.readFileSync('scripts/test-tiny-sd-d3-browser-wasm.mjs', 'utf8');

const components = ['text_encoder', 'unet', 'vae_decoder'];
const strategyTuples = [
  ['text_encoder', 'dynamic_signed'],
  ['text_encoder', 'dynamic_signed_reduce_range'],
  ['text_encoder', 'weight_only_s8'],
  ['text_encoder', 'exact_fp16_storage'],
  ['unet', 'static_s8s8_qdq'],
  ['unet', 'static_u8u8_qdq'],
  ['unet', 'weight_only_s8'],
  ['unet', 'exact_fp16_storage'],
  ['vae_decoder', 'static_s8s8_qdq'],
  ['vae_decoder', 'static_u8u8_qdq'],
  ['vae_decoder', 'weight_only_s8'],
  ['vae_decoder', 'exact_fp16_storage'],
];

const exactCacheKey = /tiny-sd-d3-d2-v2-\$\{\{ github\.run_id \}\}-\$\{\{ inputs\.candidate_sha \}\}-\$\{\{ inputs\.component \}\}/;

test('D3 bounds hosted work as prep -> one-strategy runners -> aggregate -> browser', () => {
  assert.match(caller, /heavy_wasm_d2_prep:/);
  assert.match(caller, /heavy_wasm_strategy:/);
  assert.match(caller, /heavy_wasm_component_matrix:/);
  assert.match(caller, /heavy_wasm_component_browser:/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/tiny-sd-d3-wasm-d2-prep\.yml/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/tiny-sd-d3-wasm-strategy-phase\.yml/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/tiny-sd-d3-wasm-browser-phase\.yml/);
  assert.equal((caller.match(/component: \[text_encoder, unet, vae_decoder\]/g) ?? []).length, 3);
  for (const [component, oneStrategy] of strategyTuples) {
    assert.ok(caller.includes(`- component: ${component}\n            strategy: ${oneStrategy}`), `${component}/${oneStrategy}`);
  }
  assert.equal((caller.match(/- component: (?:text_encoder|unet|vae_decoder)\n\s+strategy:/g) ?? []).length, 12);
});

test('D2 binary handoff uses only run+SHA+component cache and grants no authority', () => {
  assert.match(prep, /ref: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(prep, /WORKFLOW_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(prep, /actions\/cache\/restore@v4/);
  assert.match(prep, /actions\/cache\/save@v4/);
  assert.match(prep, exactCacheKey);
  assert.match(prep, /steps\.d2_handoff_cache\.outputs\.cache-hit == 'true'/);
  assert.match(prep, /steps\.d2_handoff_cache\.outputs\.cache-hit != 'true'/);
  assert.doesNotMatch(prep, /restore-keys:/);
  assert.doesNotMatch(prep, /Upload verified D2 component handoff|tiny-sd-d3-d2-\$\{\{ inputs\.component \}\}[\s\S]{0,400}upload-artifact/);
  assert.match(prep, /workflowRunId': os\.environ\['WORKFLOW_RUN_ID'\]/);
  assert.match(prep, /handoffTransport': 'ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY'/);
  assert.match(prep, /d3CandidateBinaryIncluded': False/);
  assert.match(prep, /crossJobD2Fp32Handoff': True/);
  assert.match(verifier, /HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"/);
  assert.match(verifier, /parser\.add_argument\("--workflow-run-id", required=True\)/);
  assert.match(verifier, /manifest\.get\("workflowRunId"\) != args\.workflow_run_id/);
  assert.match(verifier, /manifest\.get\("handoffTransport"\) != HANDOFF_TRANSPORT/);
  assert.match(verifier, /expected_names = \{filename, "d2-components\.json", "handoff-manifest\.json"\}/);
  assert.match(verifier, /passCount.*3/);
  assert.match(verifier, /allComponentsPass/);
  assert.match(verifier, /D2 FP32 model identity mismatch across report\/manifest\/file/);
  assert.match(verifier, /D2 report identity mismatch across manifest\/file/);
  assert.match(verifier, /runtimeAuthorityGranted/);
  assert.match(verifier, /productionApproval/);
});

test('every selectable strategy requires exact run-scoped D2 cache hit and D3 candidate bytes never cross jobs', () => {
  assert.match(strategy, /WORKFLOW_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(strategy, /actions\/cache\/restore@v4/);
  assert.match(strategy, exactCacheKey);
  assert.match(strategy, /CACHE_HIT: \$\{\{ steps\.d2_handoff_cache\.outputs\.cache-hit \}\}/);
  assert.match(strategy, /test "\$\{CACHE_HIT\}" = "true"/);
  assert.match(strategy, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
  assert.doesNotMatch(strategy, /restore-keys:/);
  assert.match(strategy, /timeout --signal=TERM 240s/);
  assert.match(strategy, /--candidate-worker/);
  assert.match(strategy, /--strategy "\$\{STRATEGY\}"/);
  assert.match(strategy, /workflowRunId': os\.environ\['WORKFLOW_RUN_ID'\]/);
  assert.match(strategy, /d2Fp32HandoffVerified': True/);
  assert.match(strategy, /d2HandoffTransport': handoff\['handoffTransport'\]/);
  assert.match(strategy, /d2HandoffManifestSha256': hashlib\.sha256\(handoff_manifest\.read_bytes\(\)\)\.hexdigest\(\)/);
  assert.match(strategy, /d3CandidateBinaryCrossJobHandoff': False/);
  assert.match(strategy, /Destroy restored D2 cache bytes and D3 binary evidence before JSON upload/);
  const uploadStart = strategy.indexOf('- name: Upload JSON-only single-strategy evidence');
  const cleanupStart = strategy.indexOf('- name: Failure cleanup', uploadStart);
  assert.ok(uploadStart >= 0 && cleanupStart > uploadStart);
  const uploadStep = strategy.slice(uploadStart, cleanupStart);
  assert.match(uploadStep, /uses: actions\/upload-artifact@v4/);
  assert.match(uploadStep, /path: \.test-cache\/6\.42d3-wasm\/\$\{\{ inputs\.component \}\}--\$\{\{ inputs\.strategy \}\}\.json/);
  assert.doesNotMatch(uploadStep, /\.(?:onnx|ort|bin|safetensors|pt|pth|ckpt)(?:\s|$)/);
});

test('aggregate preserves canonical minimum-size policy and requires one D2 manifest across all strategies', () => {
  assert.match(aggregate, /ast\.literal_eval/);
  assert.match(aggregate, /ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT/);
  assert.match(aggregate, /ACCEPTED_SELECTED_SCHEME_BY_COMPONENT/);
  assert.match(aggregate, /MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES/);
  assert.match(aggregate, /min\(passing, key=lambda item: \(item\[0\], item\[1\]\)\)/);
  assert.match(aggregate, /HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"/);
  assert.match(aggregate, /wrapper\.get\("workflowRunId"\) != workflow_run_id/);
  assert.match(aggregate, /wrapper\.get\("d2HandoffTransport"\) != HANDOFF_TRANSPORT/);
  assert.match(aggregate, /wrapper\.get\("d2HandoffManifestSha256"\)/);
  assert.match(aggregate, /handoff_manifest_shas\.add\(handoff_manifest_sha\)/);
  assert.match(aggregate, /if len\(handoff_manifest_shas\) != 1:/);
  assert.match(aggregate, /strategy jobs did not use one identical D2 handoff manifest/);
  assert.match(aggregate, /"workflowRunId": args\.workflow_run_id/);
  assert.match(aggregate, /"d2HandoffManifestSha256": handoff_manifest_sha/);
  assert.match(aggregate, /"d2HandoffManifestConsensus": True/);
  assert.match(aggregate, /selectableStrategySetBoundToCanonicalImplementation.*True/);
  assert.match(aggregate, /crossJobD2Fp32Handoff.*True/);
  assert.match(aggregate, /crossJobD3CandidateBinaryHandoff.*False/);
  assert.match(aggregate, /jsonStrategyEvidenceOnly.*True/);
  assert.doesNotMatch(aggregate, /ACCEPTED_SELECTED_STRATEGY_BY_COMPONENT\s*=\s*\{/);
  assert.doesNotMatch(aggregate, /ACCEPTED_SELECTED_SCHEME_BY_COMPONENT\s*=\s*\{/);
  assert.match(caller, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
});

test('browser re-creates only accepted D3 representation after exact cache and manifest-consensus verification', () => {
  assert.match(browser, /WORKFLOW_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(browser, /actions\/cache\/restore@v4/);
  assert.match(browser, exactCacheKey);
  assert.match(browser, /test "\$\{CACHE_HIT\}" = "true"/);
  assert.match(browser, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
  assert.doesNotMatch(browser, /restore-keys:/);
  assert.match(browser, /verify-tiny-sd-d3-d2-handoff\.py/);
  assert.match(browser, /reproduce-tiny-sd-d3-selected-wasm-component\.py/);
  assert.match(browser, /timeout --signal=TERM 180s/);
  assert.match(browser, /--component "\$\{COMPONENT\}"/);
  assert.match(browser, /Destroy restored D2 cache bytes and D3 binary evidence before JSON upload/);
  assert.match(selected, /HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"/);
  assert.match(selected, /parser\.add_argument\("--workflow-run-id", required=True\)/);
  assert.match(selected, /handoff_manifest_sha = _require_handoff_manifest/);
  assert.match(selected, /component_matrix\.get\("workflowRunId"\) != args\.workflow_run_id/);
  assert.match(selected, /component_matrix\.get\("d2HandoffTransport"\) != HANDOFF_TRANSPORT/);
  assert.match(selected, /component_matrix\.get\("d2HandoffManifestSha256"\) != handoff_manifest_sha/);
  assert.match(selected, /component_matrix\.get\("d2HandoffManifestConsensus"\) is not True/);
  assert.match(selected, /matrix_record\.get\("d2HandoffManifestSha256"\) != handoff_manifest_sha/);
  assert.match(selected, /"d2HandoffManifestConsensusVerified": True/);
  assert.match(selected, /selected\._selected_component\(/);
  assert.match(selected, /selected reproduction identity does not match accepted component matrix evidence/);
  assert.match(selected, /crossJobD3CandidateBinaryHandoff": False/);
  assert.match(selected, /reselectionPerformed": False/);
  assert.match(browserHarness, /const requestedComponent = args\.get\('component'\) \?\? null/);
  assert.match(browserHarness, /const COMPONENTS = requestedComponent === null \? ALL_COMPONENTS : \[requestedComponent\]/);
});

test('one stable outward gate fails closed over every bounded phase', () => {
  for (const component of components) assert.ok(caller.includes(component), component);
  assert.equal((caller.match(/name: wasm-compact-feasibility\n/g) ?? []).length, 1);
  const gate = caller.slice(caller.indexOf('wasm_compact_feasibility_gate:'));
  for (const key of ['PREP_RESULT', 'STRATEGY_RESULT', 'MATRIX_RESULT', 'BROWSER_RESULT']) {
    assert.ok(gate.includes(`${key}:`), key);
    assert.ok(gate.includes(`test "\${${key}}" = "success"`), `${key} success`);
    assert.ok(gate.includes(`test "\${${key}}" = "skipped"`), `${key} skipped`);
  }
});

test('obsolete component-monolith orchestration is removed', () => {
  assert.equal(fs.existsSync('.github/workflows/tiny-sd-d3-wasm-component-phase.yml'), false);
  assert.equal(fs.existsSync('scripts/prepare-tiny-sd-d3-wasm-component-matrix.py'), false);
});

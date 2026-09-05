import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const matrix = fs.readFileSync('scripts/prepare-tiny-sd-d3-wasm-strategy-matrix.py', 'utf8');
const d4Selected = fs.readFileSync('scripts/reproduce-tiny-sd-d3-selected-wasm.py', 'utf8');
const policyWorkflow = fs.readFileSync('.github/workflows/tiny-sd-d3-candidate-process-isolation-policy.yml', 'utf8');
const caller = fs.readFileSync('.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml', 'utf8');
const prepWorkflow = fs.readFileSync('.github/workflows/tiny-sd-d3-wasm-d2-prep.yml', 'utf8');
const strategyWorkflow = fs.readFileSync('.github/workflows/tiny-sd-d3-wasm-strategy-phase.yml', 'utf8');
const browserWorkflow = fs.readFileSync('.github/workflows/tiny-sd-d3-wasm-browser-phase.yml', 'utf8');
const verifier = fs.readFileSync('scripts/verify-tiny-sd-d3-d2-handoff.py', 'utf8');
const aggregate = fs.readFileSync('scripts/aggregate-tiny-sd-d3-wasm-strategy-evidence.py', 'utf8');
const selectedComponent = fs.readFileSync('scripts/reproduce-tiny-sd-d3-selected-wasm-component.py', 'utf8');

const exactCacheKey = /tiny-sd-d3-d2-v2-\$\{\{ github\.run_id \}\}-\$\{\{ inputs\.candidate_sha \}\}-\$\{\{ inputs\.component \}\}/;

test('canonical D3 candidate worker still bounds native candidate lifetime per strategy', () => {
  assert.match(matrix, /MAX_WORKER_RECORD_BYTES = 2 \* 1024 \* 1024/);
  assert.match(matrix, /--candidate-worker/);
  assert.match(matrix, /subprocess\.run\(/);
  assert.match(matrix, /sys\.executable/);
  assert.match(matrix, /def _resolve_strategy\([\s\S]*?_strategy_definitions\(component\)/);
  assert.match(matrix, /def candidate_worker_main\([\s\S]*?_candidate_record\(/);
  assert.match(matrix, /candidate worker exited non-zero/);
  assert.match(matrix, /candidate worker artifact identity mismatch/);
});

test('accepted strategy authority remains canonical and fail closed', () => {
  assert.match(matrix, /MIN_SIZE_AMONG_ORIGINAL_D3_NATIVE_PARITY_PASSING_CANDIDATES/);
  assert.match(matrix, /"text_encoder": "exact_fp16_storage"/);
  assert.match(matrix, /"unet": "exact_fp16_storage"/);
  assert.match(matrix, /"vae_decoder": "exact_fp16_storage"/);
  assert.match(matrix, /"text_encoder": "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
  assert.match(matrix, /"unet": "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
  assert.match(matrix, /"vae_decoder": "EXACT_FP16_STORAGE_FP32_COMPUTE"/);
});

test('trusted D2 prep completes 3/3 parity before saving exact run-scoped component cache', () => {
  const d2Step = prepWorkflow.indexOf('- name: Reproduce D2 accepted FP32 component graphs and CPU parity');
  const handoffStep = prepWorkflow.indexOf('- name: Stage exact component-scoped D2 handoff on cache miss');
  const verifyStep = prepWorkflow.indexOf('- name: Verify newly staged D2 component handoff');
  const saveStep = prepWorkflow.indexOf('- name: Save exact run and SHA-bound verified D2 component cache');
  assert.ok(d2Step >= 0 && handoffStep > d2Step && verifyStep > handoffStep && saveStep > verifyStep);
  assert.match(prepWorkflow, /assert report\['passCount'\] == 3/);
  assert.match(prepWorkflow, /assert report\['allComponentsPass'\] is True/);
  assert.match(prepWorkflow, /WORKFLOW_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(prepWorkflow, /actions\/cache\/restore@v4/);
  assert.match(prepWorkflow, /actions\/cache\/save@v4/);
  assert.match(prepWorkflow, exactCacheKey);
  assert.doesNotMatch(prepWorkflow, /restore-keys:/);
  assert.match(prepWorkflow, /verify-tiny-sd-d3-d2-handoff\.py/);
  assert.match(prepWorkflow, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
  assert.match(prepWorkflow, /workflowRunId': os\.environ\['WORKFLOW_RUN_ID'\]/);
  assert.match(prepWorkflow, /handoffTransport': 'ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY'/);
  assert.match(prepWorkflow, /d3CandidateBinaryIncluded': False/);
  assert.match(prepWorkflow, /runtimeAuthorityGranted': False/);
  assert.match(prepWorkflow, /productionApproval': False/);
  assert.match(verifier, /HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"/);
  assert.match(verifier, /parser\.add_argument\("--workflow-run-id", required=True\)/);
  assert.match(verifier, /manifest\.get\("workflowRunId"\) != args\.workflow_run_id/);
});

test('strategy runners require exact run-scoped D2 cache hit and preserve manifest identity', () => {
  assert.match(strategyWorkflow, /Restore exact run and SHA-bound accepted D2 FP32 cache/);
  assert.match(strategyWorkflow, exactCacheKey);
  assert.match(strategyWorkflow, /test "\$\{CACHE_HIT\}" = "true"/);
  assert.match(strategyWorkflow, /Require exact D2 cache hit and verify before use/);
  assert.match(strategyWorkflow, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
  assert.doesNotMatch(strategyWorkflow, /restore-keys:/);
  assert.match(strategyWorkflow, /--candidate-worker/);
  assert.match(strategyWorkflow, /--component "\$\{COMPONENT\}"/);
  assert.match(strategyWorkflow, /--strategy "\$\{STRATEGY\}"/);
  assert.match(strategyWorkflow, /timeout --signal=TERM 240s/);
  assert.match(strategyWorkflow, /workflowRunId': os\.environ\['WORKFLOW_RUN_ID'\]/);
  assert.match(strategyWorkflow, /d2HandoffTransport': handoff\['handoffTransport'\]/);
  assert.match(strategyWorkflow, /d2HandoffManifestSha256': hashlib\.sha256\(handoff_manifest\.read_bytes\(\)\)\.hexdigest\(\)/);
  assert.match(strategyWorkflow, /d3CandidateBinaryCrossJobHandoff': False/);
  assert.match(aggregate, /wrapper\.get\("workflowRunId"\) != workflow_run_id/);
  assert.match(aggregate, /wrapper\.get\("d2HandoffTransport"\) != HANDOFF_TRANSPORT/);
  assert.match(aggregate, /wrapper\.get\("d2HandoffManifestSha256"\)/);
  assert.match(aggregate, /if len\(handoff_manifest_shas\) != 1:/);
  assert.match(aggregate, /"d2HandoffManifestConsensus": True/);
  assert.match(caller, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
});

test('browser runner re-verifies exact cache and matrix-to-cache D2 manifest consensus', () => {
  assert.match(browserWorkflow, /Restore exact run and SHA-bound accepted D2 FP32 cache/);
  assert.match(browserWorkflow, exactCacheKey);
  assert.match(browserWorkflow, /test "\$\{CACHE_HIT\}" = "true"/);
  assert.match(browserWorkflow, /Require exact D2 cache hit and verify before browser reproduction/);
  assert.match(browserWorkflow, /--workflow-run-id "\$\{WORKFLOW_RUN_ID\}"/);
  assert.doesNotMatch(browserWorkflow, /restore-keys:/);
  assert.match(browserWorkflow, /reproduce-tiny-sd-d3-selected-wasm-component\.py/);
  assert.doesNotMatch(browserWorkflow, /--candidate-worker/);
  assert.match(browserWorkflow, /test-tiny-sd-d3-browser-wasm\.mjs/);
  assert.match(browserWorkflow, /--component "\$\{COMPONENT\}"/);
  assert.match(browserWorkflow, /Destroy restored D2 cache bytes and D3 binary evidence before JSON upload/);
  assert.match(selectedComponent, /HANDOFF_TRANSPORT = "ACTIONS_CACHE_EXACT_RUN_SHA_COMPONENT_KEY"/);
  assert.match(selectedComponent, /parser\.add_argument\("--workflow-run-id", required=True\)/);
  assert.match(selectedComponent, /handoff_manifest_sha = _require_handoff_manifest/);
  assert.match(selectedComponent, /component_matrix\.get\("workflowRunId"\) != args\.workflow_run_id/);
  assert.match(selectedComponent, /component_matrix\.get\("d2HandoffTransport"\) != HANDOFF_TRANSPORT/);
  assert.match(selectedComponent, /component_matrix\.get\("d2HandoffManifestSha256"\) != handoff_manifest_sha/);
  assert.match(selectedComponent, /component_matrix\.get\("d2HandoffManifestConsensus"\) is not True/);
  assert.match(selectedComponent, /matrix_record\.get\("d2HandoffManifestSha256"\) != handoff_manifest_sha/);
  assert.match(selectedComponent, /"d2HandoffManifestConsensusVerified": True/);
});

test('caller owns trusted relevance, all bounded fanouts and one stable outward gate', () => {
  assert.match(caller, /classify_tiny_sd_relevance:/);
  assert.match(caller, /heavy_wasm_d2_prep:/);
  assert.match(caller, /heavy_wasm_strategy:/);
  assert.match(caller, /heavy_wasm_component_matrix:/);
  assert.match(caller, /heavy_wasm_component_browser:/);
  assert.equal((caller.match(/name: wasm-compact-feasibility\n/g) ?? []).length, 1);
});

test('D4 selected-only reproduction remains independent from D3 research worker orchestration', () => {
  assert.match(d4Selected, /matrix\._candidate_record\(/);
  assert.doesNotMatch(d4Selected, /--candidate-worker|_run_candidate_isolated/);
  assert.match(d4Selected, /PINNED_ACCEPTED_SCHEME_REPRODUCTION_NO_RESELECTION/);
});

test('dedicated hosted policy workflow is read-only, exact-head bound and watches every lifecycle surface', () => {
  for (const path of [
    'scripts/verify-tiny-sd-d3-d2-handoff.py',
    'scripts/aggregate-tiny-sd-d3-wasm-strategy-evidence.py',
    'scripts/reproduce-tiny-sd-d3-selected-wasm-component.py',
    '.github/workflows/tiny-sd-d3-wasm-d2-prep.yml',
    '.github/workflows/tiny-sd-d3-wasm-strategy-phase.yml',
    '.github/workflows/tiny-sd-d3-wasm-browser-phase.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
  ]) assert.ok(policyWorkflow.includes(path), path);
  assert.match(policyWorkflow, /permissions:\n  contents: read/);
  assert.match(policyWorkflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(policyWorkflow, /test "\$\(git rev-parse HEAD\)" = "\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}"/);
  assert.doesNotMatch(policyWorkflow, /contents: write|pull-requests: write|actions: write/);
});

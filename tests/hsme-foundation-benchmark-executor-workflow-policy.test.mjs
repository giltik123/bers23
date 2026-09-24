import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const path='.github/workflows/hsme-2a-3-3b-protected-foundation-executor.yml';
const workflow=await readFile(path,'utf8');

test('ordinary CI is synthetic and automatic while real execution is manual-only',()=>{
  assert.match(workflow,/^on:\n  pull_request:/m);
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.match(workflow,/synthetic-contract:/);
  assert.match(workflow,/if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);
  const synthetic=workflow.slice(workflow.indexOf('  synthetic-contract:'),workflow.indexOf('  plan-protected-run:'));
  assert.doesNotMatch(synthetic,/HSME_FOUNDATION_BLIND_HMAC_KEY/);
  assert.doesNotMatch(synthetic,/hf_hub_download|from_pretrained|nvidia-smi|pip install.*torch/);
});

test('planning happens on unprotected hosted runner before protected GPU execution',()=>{
  assert.match(workflow,/plan-protected-run:\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}\n    runs-on: ubuntu-24\.04/);
  assert.match(workflow,/execute-protected-run:\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' && needs\.plan-protected-run\.outputs\.disposition == 'EXECUTE' \}\}/);
  assert.match(workflow,/runs-on: \[self-hosted, linux, x64, gpu, bers-hsme-evidence\]/);
  assert.match(workflow,/environment: hsme-foundation-benchmark-evidence/);
});

test('unsupported and parity-blocked dispositions cannot reach model execution job',()=>{
  assert.match(workflow,/needs\.plan-protected-run\.outputs\.disposition == 'EXECUTE'/);
  assert.match(workflow,/terminal-row\.json/);
  assert.match(workflow,/no-files-found: ignore/);
});

test('candidate is exact SHA ancestor of the same current main used as controller',()=>{
  assert.match(workflow,/git -C candidate merge-base --is-ancestor "\$\{CANDIDATE_SHA\}" origin\/main/);
  assert.match(workflow,/test "\$\(git -C controller rev-parse HEAD\)" = "\$\(git -C candidate rev-parse origin\/main\)"/);
  assert.match(workflow,/--controller-main-sha "\$\{CONTROLLER_MAIN_SHA\}"/);
});

test('protected job verifies raw run before upload and destroys transient model/cache bytes',()=>{
  assert.match(workflow,/hsme-foundation-benchmark-executor-verify\.mjs/);
  assert.match(workflow,/Destroy transient model and Hub cache bytes/);
  assert.match(workflow,/rm -rf "\$\{MODEL_ROOT\}" "\$\{HF_HOME\}"/);
  const verifyIndex=workflow.indexOf('Verify raw candidate run against accepted contract');
  const uploadIndex=workflow.indexOf('Upload protected benchmark evidence');
  assert.ok(verifyIndex>=0&&uploadIndex>verifyIndex);
});

test('protected secret is scoped only to execution and reviewer artifacts remain blind-only',()=>{
  assert.match(workflow,/HSME_FOUNDATION_BLIND_HMAC_KEY: \$\{\{ secrets\.HSME_FOUNDATION_BLIND_HMAC_KEY \}\}/);
  assert.match(workflow,/review-package\.json/);
  assert.match(workflow,/blind-review/);
  const synthetic=workflow.slice(workflow.indexOf('  synthetic-contract:'),workflow.indexOf('  plan-protected-run:'));
  assert.doesNotMatch(synthetic,/accepted_output_cost_microusd|resource-measurement\.json|nvidia-smi/);
  const blindUpload=workflow.slice(workflow.indexOf('      - name: Upload protected benchmark evidence'),workflow.indexOf('      - name: Upload separately verified resource measurement evidence'));
  assert.doesNotMatch(blindUpload,/resource-measurement|resource-hardware-profile|resource-measurement-method|resource-measurement-evidence/);
  assert.doesNotMatch(blindUpload,/accepted_output_cost_microusd|workingMemoryKind|peakWorkingMemoryBytes/);
});

test('manual protected resource capture requires explicit cost evidence and separate verified artifact',()=>{
  assert.match(workflow,/cost_kind:/);
  assert.match(workflow,/accepted_output_cost_microusd:/);
  assert.match(workflow,/cost_evidence_sha256:/);
  assert.match(workflow,/Validate explicit resource cost evidence before protected execution/);
  assert.match(workflow,/hsme-foundation-resource-fragment-verify\.mjs/);
  assert.match(workflow,/steps\.verify\.outputs\.run_status == 'COMPLETE'/);
  assert.match(workflow,/hsme-foundation-resource-evidence-/);
  assert.match(workflow,/if-no-files-found: error/);
  const resourceUpload=workflow.slice(workflow.indexOf('      - name: Upload separately verified resource measurement evidence'),workflow.indexOf('      - name: Preserve failed candidate state'));
  assert.match(resourceUpload,/execution-plan\.json/);
  assert.match(resourceUpload,/candidate-run\.json/);
  assert.match(resourceUpload,/runtime-inventory\.json/);
  assert.doesNotMatch(resourceUpload,/review-package\.json|blind-review|\.png/);
});

test('verified protected evidence is provenance-bound before either artifact upload',()=>{
  assert.match(workflow,/Build content-addressed protected artifact provenance/);
  assert.match(workflow,/build-hsme-foundation-protected-artifact-provenance\.mjs/);
  assert.match(workflow,/HSME_FOUNDATION_PROTECTED_PROVENANCE_CLI=1/);
  assert.match(workflow,/--workflow-run-id "\$\{GITHUB_RUN_ID\}"/);
  assert.match(workflow,/--workflow-run-attempt "\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.match(workflow,/--repository "\$\{GITHUB_REPOSITORY\}"/);
  assert.match(
    workflow,
    /--workflow "\.github\/workflows\/hsme-2a-3-3b-protected-foundation-executor\.yml"/,
  );

  const verifyIndex=workflow.indexOf('Verify raw candidate run against accepted contract');
  const provenanceIndex=workflow.indexOf('Build content-addressed protected artifact provenance');
  const blindUploadIndex=workflow.indexOf('Upload protected benchmark evidence');
  assert.ok(
    verifyIndex>=0
    &&provenanceIndex>verifyIndex
    &&blindUploadIndex>provenanceIndex,
  );

  const blindUpload=workflow.slice(
    workflow.indexOf('      - name: Upload protected benchmark evidence'),
    workflow.indexOf('      - name: Upload separately verified resource measurement evidence'),
  );
  const resourceUpload=workflow.slice(
    workflow.indexOf('      - name: Upload separately verified resource measurement evidence'),
    workflow.indexOf('      - name: Preserve failed candidate state'),
  );
  assert.match(blindUpload,/protected-artifact-provenance\.json/);
  assert.match(resourceUpload,/protected-artifact-provenance\.json/);
  assert.match(blindUpload,/steps\.provenance\.outcome == 'success'/);
  assert.match(resourceUpload,/steps\.provenance\.outcome == 'success'/);
  assert.match(workflow,/manifest_sha256=\$\{MANIFEST_SHA256\}/);
  assert.match(workflow,/GITHUB_STEP_SUMMARY/);
  assert.match(workflow,/Downstream trust: explicit external pin still required/);
});

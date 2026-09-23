import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const workflow=readFileSync(
  '.github/workflows/hsme-2b1-2-teacher-protected-acquisition-evidence.yml',
  'utf8',
);

test('ordinary PR CI is synthetic/offline and protected acquisition is manual only',()=>{
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/synthetic-contract:\n[\s\S]*runs-on: ubuntu-24\.04/);
  assert.match(
    workflow,
    /plan-acquisition:\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' \}\}/,
  );
  assert.match(
    workflow,
    /acquire-protected:\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && needs\.plan-acquisition\.result == 'success' \}\}/,
  );
});

test('large teacher bytes require fixed protected evidence runner and environment',()=>{
  assert.match(workflow,/runs-on: \[self-hosted, linux, x64, gpu, bers-hsme-evidence\]/);
  assert.match(workflow,/environment: hsme-teacher-acquisition-evidence/);
  assert.match(workflow,/EXPECTED_DOWNLOAD_BYTES/);
  assert.match(workflow,/required=max\(expected\*2, expected\+20\*1024\*1024\*1024\)/);
});

test('explicit download ceiling and all Hub/Xet caches are bound before protected download',()=>{
  assert.match(workflow,/max_download_bytes:/);
  assert.match(workflow,/MAX_DOWNLOAD_BYTES: \$\{\{ inputs\.max_download_bytes \}\}/);
  assert.match(workflow,/expected download bytes \$\{total\} exceed explicit max_download_bytes/);
  assert.match(workflow,/HF_HOME: \$\{\{ runner\.temp \}\}\/hsme-teacher-acquisition-hf-cache/);
  assert.match(workflow,/HF_HUB_CACHE: \$\{\{ runner\.temp \}\}\/hsme-teacher-acquisition-hf-cache\/hub/);
  assert.match(workflow,/HF_XET_CACHE: \$\{\{ runner\.temp \}\}\/hsme-teacher-acquisition-hf-cache\/xet/);
  assert.match(workflow,/--max-download-bytes "\$\{MAX_DOWNLOAD_BYTES\}"/);
});

test('protected run pins metadata transport and exact selected plan',()=>{
  assert.match(workflow,/huggingface_hub==0\.36\.0 hf_xet==1\.1\.10/);
  assert.match(workflow,/resolve-hsme-teacher-remote-manifest\.py/);
  assert.match(workflow,/materialize-hsme-teacher-acquisition-plans\.py/);
  assert.match(workflow,/acquire-hsme-teacher-snapshot\.py acquire/);
  assert.match(workflow,/--expected-manifest/);
});

test('model bytes and cache are destroyed before cleanup proof and JSON upload',()=>{
  const destroy=workflow.indexOf('Destroy transient teacher model and Hub cache bytes');
  const prove=workflow.indexOf('Prove transient model/cache deletion');
  const upload=workflow.indexOf('Upload JSON-only teacher acquisition evidence');
  assert.ok(destroy>0);
  assert.ok(prove>destroy);
  assert.ok(upload>prove);
  assert.match(workflow,/rm -rf "\$\{MODEL_ROOT\}" "\$\{HF_HOME\}"/);
  assert.match(workflow,/acquire-hsme-teacher-snapshot\.py prove-cleanup/);
  assert.doesNotMatch(
    workflow.slice(upload),
    /\$\{\{\s*env\.(?:MODEL_ROOT|HF_HOME)\s*\}\}|\$\{MODEL_ROOT\}|\$\{HF_HOME\}/,
  );
});

test('evidence upload is gated on successful acquisition destruction and cleanup proof',()=>{
  assert.match(workflow,/id: acquire/);
  assert.match(workflow,/id: destroy/);
  assert.match(workflow,/id: cleanup/);
  assert.match(
    workflow,
    /if: \$\{\{ steps\.acquire\.outcome == 'success' && steps\.destroy\.outcome == 'success' && steps\.cleanup\.outcome == 'success' \}\}/,
  );
});

test('workflow never deserializes weights or grants teacher admission',()=>{
  assert.doesNotMatch(workflow,/torch\.load|pickle\.load|from_pretrained|safe_open/);
  assert.doesNotMatch(workflow,/TEACHER_SET_ADMITTED|trainingStartAllowed.*true|teacherAdmissionAllowed.*true/i);
});

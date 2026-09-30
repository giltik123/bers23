import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const matrix = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));

test('v1 browser release matrix covers #233 journeys 1..22 exactly once', () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.program, 'BERS_V1_BROWSER_RELEASE_JOURNEY_MATRIX');
  assert.equal(matrix.issue, 233);
  assert.equal(matrix.topology, 'BUILT_SPA_BUILT_CORE_REAL_POSTGRESQL');
  assert.match(matrix.evidenceBaseSha, /^[0-9a-f]{40}$/);
  assert.deepEqual(matrix.entries.map(entry => entry.id), Array.from({length:22},(_,i)=>i+1));
  assert.equal(new Set(matrix.entries.map(entry => entry.id)).size, 22);
});

test('all in-v1 proven journeys bind to committed harness markers and hosted workflows', async () => {
  for (const entry of matrix.entries.filter(value => value.disposition === 'PROVEN' && value.id !== 22)) {
    assert.equal(typeof entry.marker, 'string', 'journey '+entry.id+' marker missing');
    const [harness, workflow] = await Promise.all([readFile(entry.harness,'utf8'), readFile(entry.workflow,'utf8')]);
    assert.match(harness, new RegExp(escapeRegExp(entry.marker)), 'journey '+entry.id+' harness marker missing');
    assert.ok(workflow.includes(entry.harness) || workflow.includes(entry.marker) || workflow.includes(entry.harness.split('/').pop()),
      'journey '+entry.id+' workflow is not bound to harness/marker');
    if (entry.additionalMarker) {
      const [extraHarness, extraWorkflow] = await Promise.all([readFile(entry.additionalHarness,'utf8'), readFile(entry.additionalWorkflow,'utf8')]);
      assert.match(extraHarness, new RegExp(escapeRegExp(entry.additionalMarker)), 'journey '+entry.id+' additional marker missing');
      assert.ok(extraWorkflow.includes(entry.additionalHarness) || extraWorkflow.includes(entry.additionalMarker) || extraWorkflow.includes(entry.additionalHarness.split('/').pop()),
        'journey '+entry.id+' additional workflow is not bound');
    }
  }
});

test('Billing journey is explicitly out of v1 while release browser evidence preserves the financial freeze', async () => {
  const entry = matrix.entries.find(value => value.id === 17);
  assert.equal(entry.disposition, 'DEFERRED_OUT_OF_V1');
  assert.match(entry.reason, /#189/);
  const [boundary, workflow] = await Promise.all([readFile(entry.evidence,'utf8'), readFile('.github/workflows/release-r3a-browser-e2e.yml','utf8')]);
  assert.match(boundary, /financialAccount\|financialTrial\|credit_grants\|credit_wallets/);
  assert.match(workflow, /Preserve financial redesign freeze/);
});

test('journey 22 is either honestly deployment-pending or bound to recorded live evidence', async () => {
  const entry=matrix.entries.find(value=>value.id===22);
  assert.ok(entry);

  if (entry.disposition === 'DEPLOYMENT_TARGET_PENDING') {
    const unresolved=matrix.entries.filter(value=>!['PROVEN','DEFERRED_OUT_OF_V1'].includes(value.disposition));
    assert.deepEqual(unresolved.map(value=>value.id),[22]);
    const [contract,workflow,verifier]=await Promise.all([
      readFile(entry.evidence,'utf8'),
      readFile(entry.workflow,'utf8'),
      readFile(entry.verifier,'utf8'),
    ]);
    assert.match(contract,/requiredProductionFrontendHeaders/);
    assert.match(contract,/frame-ancestors/);
    assert.match(workflow,/Prove frontend security policy and live-header verifier/);
    assert.match(verifier,/FRONTEND_URL/);
    assert.match(verifier,/strict-transport-security/);
    assert.equal(entry.liveEvidence,undefined);
  } else {
    assert.equal(entry.disposition,'PROVEN');
    const evidence=entry.liveEvidence;
    assert.equal(evidence?.schemaVersion,1);
    assert.equal(evidence?.kind,'BERS_V1_FRONTEND_SECURITY_EVIDENCE');
    assert.match(evidence?.verifiedSha ?? '',/^[0-9a-f]{40}$/u);
    assert.match(evidence?.htmlSha256 ?? '',/^[0-9a-f]{64}$/u);
    assert.match(evidence?.frontendUrl ?? '',/^https:\/\//u);
    assert.equal(typeof evidence?.coreApiUrl,'string');
    assert.ok(evidence.coreApiUrl.length > 0);
    assert.match(evidence?.workflowRunUrl ?? '',/^https:\/\/github\.com\/giltik123\/bers23\/actions\/runs\/\d+$/u);
    assert.match(evidence?.artifactName ?? '',/^bers-v1-frontend-security-[0-9a-f]{40}$/u);
    assert.equal(evidence.artifactName,`bers-v1-frontend-security-${evidence.verifiedSha}`);
    assert.match(evidence?.verifiedAt ?? '',/^\d{4}-\d{2}-\d{2}T/u);
    const unresolved=matrix.entries.filter(value=>!['PROVEN','DEFERRED_OUT_OF_V1'].includes(value.disposition));
    assert.deepEqual(unresolved,[]);
  }
});

test('matrix has no fake success for external deployment evidence', () => {
  const serialized=JSON.stringify(matrix);
  assert.doesNotMatch(serialized,/ASSUME_DEPLOYED|FAKE_HEADER_SUCCESS|BYPASS/);
  const security=matrix.entries.find(entry=>entry.id===22);
  if (security.disposition === 'PROVEN') {
    assert.equal(security.liveEvidence?.kind,'BERS_V1_FRONTEND_SECURITY_EVIDENCE');
  }
});

function escapeRegExp(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}


test('journey matrix workflow supports pending and proven deployment states and PR-only diff hygiene', async () => {
  const workflow=await readFile('.github/workflows/v1-release-journey-matrix.yml','utf8');
  assert.match(workflow,/BERS_V1_FRONTEND_DEPLOYMENT_PENDING/u);
  assert.match(workflow,/BERS_V1_FRONTEND_DEPLOYMENT_PROVEN/u);
  assert.match(workflow,/security\?\.disposition === 'DEPLOYMENT_TARGET_PENDING'/u);
  assert.match(workflow,/security\?\.disposition === 'PROVEN'/u);
  assert.match(workflow,/actions:\s*read/u);
  assert.match(workflow,/Verify hosted frontend deployment evidence when PROVEN/u);
  assert.match(workflow,/gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$\{RUN_ID\}"/u);
  assert.match(workflow,/\.head_sha/u);
  assert.match(workflow,/\.conclusion/u);
  assert.match(workflow,/workflow_dispatch/u);
  assert.match(workflow,/gh run download "\$RUN_ID"/u);
  assert.match(workflow,/hosted artifact does not match committed journey 22 evidence/u);
  assert.match(workflow,/Check committed diff whitespace\s*\n\s*if:\s*github\.event_name == 'pull_request'/u);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('C2a.1 production recovery wiring is workflow-owned, PostgreSQL-backed and canonical-artifact read-only', async () => {
  const [server, adapter, delivery] = await Promise.all([
    source('../../index.ts'),
    source('../http/localCompositeContinuationHttpAdapter.ts'),
    source('./LocalCompositeInputDeliveryService.ts'),
  ]);

  assert.match(server, /new LocalCompositeInputDeliveryService\(\{/);
  assert.match(server, /continuations:\s*new PostgresWorkflowContinuationStore\(production\.transactions\.pool, Date\.now\)/);
  assert.match(server, /tickets:\s*production\.localExecution\.admission/);
  assert.match(server, /ownsArtifacts:\s*\(scope, artifactIds\) => production\.artifacts\.owns\(scope, artifactIds\)/);
  assert.match(server, /new CanonicalArtifactHydrator\(production\.artifacts\)/);
  assert.match(server, /hydrateArtifacts:\s*\(scope, sourceId, maskIds\) => localCompositeHydrator\.hydrate\(scope, sourceId, maskIds\)/);
  assert.match(server, /createLocalCompositeContinuationHttpAdapter\(\{ continuation: production\.localExecution\.composite, inputs: localCompositeInputs,/);

  assert.match(adapter, /const inputMatch = url\.pathname\.match/);
  assert.match(adapter, /if \(inputMatch && request\.method === 'GET'\)/);
  assert.match(adapter, /delivery\.deliver\(decodeURIComponent\(inputMatch\[1\]\), scope\(principal, projectId\)\)/);
  assert.doesNotMatch(adapter, /searchParams\.get\(['"]ticketId['"]\)/);
  assert.doesNotMatch(adapter, /searchParams\.get\(['"]capability['"]\)/);
  assert.match(adapter, /Access-Control-Expose-Headers/);
  assert.match(adapter, /X-Bers-Composite-Input-Step/);
  assert.match(adapter, /X-Bers-Local-Source-Sha256/);
  assert.match(adapter, /X-Bers-Local-Mask-Sha256/);

  assert.match(delivery, /LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES\.segment/);
  assert.match(delivery, /LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES\.backgroundIsolation/);
  assert.match(delivery, /admitLocalExecutionInputs\(ticket, artifacts\)/);
  assert.match(delivery, /ownsArtifacts\(ticket\.scope/);
  assert.match(delivery, /hydrateArtifacts\(ticket\.scope/);
  assert.doesNotMatch(delivery, /providerId|paidCloudCredits|Billing|financialAccounts|persistFinal|persistMask|submitLocalResult|\.issue\(/);
});

test('C2a.1 preserves MobileSAM CANDIDATE fail-closed production admission and legacy Agent lockdown', async () => {
  const [policy, agent] = await Promise.all([
    source('../localExecution/productionLocalModelPolicy.ts'),
    source('../../../src/lib/agent/executionQueue.js'),
  ]);

  assert.match(policy, /manifest\.status === 'PRODUCTION_APPROVED'/);
  assert.match(policy, /:\s*Object\.freeze\(\[\]\)/);
  assert.match(policy, /\[MOBILE_SAM_LOCAL_CAPABILITY\]: approvedMobileSam/);
  assert.match(policy, /\[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES\.segment\]: approvedMobileSam/);
  assert.match(policy, /executable:\s*approvedMobileSam\.length === 1/);

  assert.match(agent, /AGENT_EXECUTION_NOT_WIRED/);
  assert.match(agent, /image execution is not wired to the canonical server Execution Fabric/);
  assert.match(agent, /async run\(\) \{[\s\S]*throw error;/);
  assert.doesNotMatch(agent, /coreClient\.compositeContinuations|\/composite-continuations\/start/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const genericProjectPaths = Object.freeze([
  'server/core/localExecution/LocalExecutionInputAdmission.ts',
  'server/core/localExecution/LocalExecutionInputDeliveryService.ts',
]);

test('F4b.2 keeps generic Project input admission and delivery unaware of managed Garment authority', async () => {
  for (const path of genericProjectPaths) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /managedInputs|ManagedGarmentLocalExecutionInputAuthority|GARMENT_VIEW|GARMENT_REPRESENTATION|representationId|garmentId/,
      `${path} must remain Project-Artifact-only`);
  }

  const authority = await readFile('server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts', 'utf8');
  assert.match(authority, /revalidateTicket/);
  assert.match(authority, /createHash\('sha256'\)/);
  assert.doesNotMatch(authority, /productionTargetSelection|providerId|providerCalls|paidCloudCredits|persistFinal|acceptFinal|Billing/i,
    'managed input authority must not gain execution, provider, Billing or FINAL authority');

  const contract = await readFile('src/platform/creative/canonical/localExecution.ts', 'utf8');
  const projectBinding = contract.match(/export type LocalExecutionInputBinding = Readonly<\{([\s\S]*?)\}>;/)?.[1];
  assert.ok(projectBinding, 'LocalExecutionInputBinding declaration must remain present');
  assert.doesNotMatch(projectBinding, /garment|managed/i, 'LocalExecutionInputBinding must remain the existing Project Artifact contract');
  assert.match(contract, /managedInputs\?: readonly LocalExecutionManagedGarmentInputBinding\[\]/);
});

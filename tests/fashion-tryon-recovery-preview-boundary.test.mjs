import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const service = fs.readFileSync(new URL('../server/core/fashion/FashionTryOnRecoveryPreviewService.ts', import.meta.url), 'utf8');
const finalResult = fs.readFileSync(new URL('../server/core/fashion/FashionTryOnFinalResultService.ts', import.meta.url), 'utf8');
const artifactAuthority = fs.readFileSync(new URL('../server/core/artifacts/artifactAuthority.ts', import.meta.url), 'utf8');
const signedAuthority = fs.readFileSync(new URL('../server/core/artifacts/signedArtifactAuthority.ts', import.meta.url), 'utf8');

test('preview foundation accepts stable Try-On intent through existing final-result authority only', () => {
  assert.match(service, /this\.dependencies\.result\.result\(input, auth\)/);
  assert.match(finalResult, /normalizeFashionTryOnOrchestrationIntent/);
  assert.doesNotMatch(service, /input\.artifactId|input\.storageId|input\.representationId|input\.anchorSetId|input\.ticketId|input\.executionId/);
});

test('preview delivery is minted from server-resolved FINAL evidence and reconfirmed after minting', () => {
  const resolveIndex = service.indexOf('resolveFinalEvidence(scope, initial.artifactId)');
  const mintIndex = service.indexOf('mintFinalDelivery(scope, evidence.storageId, expiresAt)');
  const secondResultIndex = service.indexOf('this.dependencies.result.result(input, auth)', service.indexOf('this.dependencies.result.result(input, auth)') + 1);
  assert.ok(resolveIndex >= 0);
  assert.ok(mintIndex > resolveIndex);
  assert.ok(secondResultIndex > mintIndex);
  assert.match(artifactAuthority, /resolveStoredImageEvidence/);
  assert.match(signedAuthority, /issueStoredFinalDelivery/);
});

test('preview foundation grants no Project mutation, provider, Billing, database or direct HTTP authority', () => {
  for (const forbidden of [
    'acceptFinal', 'pushEdit', 'history', 'provider', 'Billing', 'credits',
    "from 'pg'", 'pool.query', 'fetch(', 'request(', 'localStorage',
  ]) assert.equal(service.includes(forbidden), false, `preview foundation must not contain ${forbidden}`);
});

test('preview response can expose stable FINAL identity and ephemeral URL but no storage/evidence internals', () => {
  assert.match(service, /artifactId: initial\.artifactId/);
  assert.match(service, /previewUrl/);
  assert.match(service, /previewExpiresAt/);
  const responseBlock = service.slice(service.indexOf("status: 'PREVIEW_READY'"), service.indexOf('});', service.indexOf("status: 'PREVIEW_READY'")) + 3);
  for (const forbidden of ['storageId', 'representationId', 'anchorSetId', 'sha256', 'meshSha256']) {
    assert.equal(responseBlock.includes(forbidden), false, `PREVIEW_READY must not expose ${forbidden}`);
  }
});

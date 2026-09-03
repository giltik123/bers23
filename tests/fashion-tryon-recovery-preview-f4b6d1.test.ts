import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_RECOVERY_PREVIEW_TTL_MS,
  FashionTryOnRecoveryPreviewService,
} from '../server/core/fashion/FashionTryOnRecoveryPreviewService.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const sourceArtifactId = 'signed-current-project-image';
const artifactId = 'signed-final-artifact';
const auth = Object.freeze({ tenantId: 'tenant-preview', userId: 'user-preview' }) as any;
const intent = Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId: 'preview-recovery-1' });

function final(id = artifactId) {
  return Object.freeze({ status: 'FINAL_READY' as const, projectId, sourceArtifactId, garmentId, artifactId: id });
}
function pending() {
  return Object.freeze({ status: 'TEXTURE_PENDING' as const, projectId, sourceArtifactId, garmentId });
}
function stale() {
  return Object.freeze({ status: 'TEXTURE_STALE' as const, projectId, sourceArtifactId, garmentId });
}
function evidence(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    artifactId,
    projectId,
    storageId: '33333333-3333-4333-8333-333333333333',
    role: 'COMPOSITE' as const,
    lifecycle: 'FINAL' as const,
    ...overrides,
  });
}

function harness(results: readonly any[], evidenceValue = evidence(), url = '/api/core/artifacts/results/opaque-delivery-token') {
  const calls: any = { result: [], resolve: [], mint: [] };
  let cursor = 0;
  const service = new FashionTryOnRecoveryPreviewService({
    result: {
      result: async (value: unknown, scope: unknown) => {
        calls.result.push({ value, scope });
        const next = results[Math.min(cursor, results.length - 1)];
        cursor += 1;
        return next;
      },
    } as any,
    delivery: {
      resolveFinalEvidence: async (scope: unknown, id: string) => {
        calls.resolve.push({ scope, id });
        return evidenceValue as any;
      },
      mintFinalDelivery: (scope: unknown, storageId: string, expiresAt: number) => {
        calls.mint.push({ scope, storageId, expiresAt });
        return url;
      },
    },
    now: () => 1_000_000,
  });
  return { service, calls };
}

test('recovery preview mints only after FINAL recovery and reconfirms the same current FINAL after minting', async () => {
  const { service, calls } = harness([final(), final()]);
  const result = await service.preview(intent, auth);
  assert.deepEqual(result, {
    status: 'PREVIEW_READY', projectId, sourceArtifactId, garmentId, artifactId,
    previewUrl: '/api/core/artifacts/results/opaque-delivery-token',
    previewExpiresAt: 1_000_000 + FASHION_TRYON_RECOVERY_PREVIEW_TTL_MS,
  });
  assert.equal(calls.result.length, 2);
  assert.equal(calls.resolve.length, 1);
  assert.equal(calls.resolve[0].id, artifactId);
  assert.deepEqual(calls.resolve[0].scope, { ...auth, projectId });
  assert.equal(calls.mint.length, 1);
  assert.equal(calls.mint[0].expiresAt, 1_000_000 + FASHION_TRYON_RECOVERY_PREVIEW_TTL_MS);
});

test('non-final result passes through without resolving or minting a delivery capability', async () => {
  const { service, calls } = harness([pending()]);
  assert.deepEqual(await service.preview(intent, auth), pending());
  assert.equal(calls.result.length, 1);
  assert.equal(calls.resolve.length, 0);
  assert.equal(calls.mint.length, 0);
});

test('evidence transition after mint discards the delivery URL and returns the fresh Core state', async () => {
  const { service, calls } = harness([final(), stale()]);
  assert.deepEqual(await service.preview(intent, auth), stale());
  assert.equal(calls.mint.length, 1, 'mint may happen before the second current-evidence check');
});

test('a different FINAL for the same stable intent is fail-closed as stale and never returned with the minted URL', async () => {
  const { service } = harness([final(), final('different-final-artifact')]);
  assert.deepEqual(await service.preview(intent, auth), stale());
});

test('resolved evidence must remain the same FINAL artifact and Project scope', async () => {
  for (const invalid of [
    evidence({ artifactId: 'other' }),
    evidence({ projectId: '44444444-4444-4444-8444-444444444444' }),
    evidence({ role: 'ORIGINAL' }),
    evidence({ lifecycle: 'IMMUTABLE' }),
    evidence({ storageId: '' }),
  ]) {
    const { service } = harness([final()], invalid);
    await assert.rejects(service.preview(intent, auth), (error: any) => error?.code === 'fashion_tryon_preview_evidence_mismatch');
  }
});

test('delivery port cannot return an external or malformed preview URL', async () => {
  for (const invalid of ['https://example.com/final.png', '/api/core/artifacts/results/', '/api/core/artifacts/results/x\n']) {
    const { service } = harness([final()], evidence(), invalid);
    await assert.rejects(service.preview(intent, auth), (error: any) => error?.code === 'fashion_tryon_preview_delivery_invalid');
  }
});

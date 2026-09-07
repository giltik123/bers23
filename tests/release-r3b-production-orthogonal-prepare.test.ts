import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import type { CoreServerConfig } from '../server/core/config.ts';

const databaseUrl = requiredEnv('DATABASE_URL');
const auth = Object.freeze({ tenantId: 'release-r3b-production-probe-tenant', userId: 'release-r3b-production-probe-user' });

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'production', port: 4188, databaseUrl, provider: 'FAL', falKey: requiredEnv('FAL_KEY'), falBaseUrl: 'http://127.0.0.1:4189',
  jwtSecret: requiredEnv('JWT_SECRET'), jwtIssuer: 'release-r3b-production-probe', jwtAudience: 'release-r3b-production-probe-browser',
  authChallengeSecret: requiredEnv('AUTH_CHALLENGE_SECRET'), authDefaultTenantId: auth.tenantId, authPublicOrigin: 'http://127.0.0.1:4187',
  authSessionAbsoluteTtlMs: 8 * 60 * 60 * 1000, authSessionIdleTtlMs: 30 * 60 * 1000,
  resendApiKey: requiredEnv('RESEND_API_KEY'), authEmailFrom: 'BERS R3b <auth@example.test>', googleOauthClientId: 'release-r3b-production-probe-unused',
  googleOauthClientSecret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'), artifactSigningSecret: requiredEnv('ARTIFACT_SIGNING_SECRET'), trustedAssetHosts: Object.freeze([]),
  allowLegacyAssetUrls: false, allowedWebOrigins: Object.freeze(['http://127.0.0.1:4187']), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 262_144, maskUploadLimitBytes: 1_048_576, maskMaxDimension: 1024, imageUploadLimitBytes: 2_097_152, imageMaxDimension: 1024,
  imageMaxPixels: 1_048_576, requestTimeoutMs: 15_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 3_000,
});

test('production Core prepares browser-shaped orthogonal ticket from canonical authenticated scope', async t => {
  let providerCalls = 0;
  const forbiddenFetcher: typeof fetch = async () => { providerCalls += 1; throw new Error('production orthogonal prepare must not call provider'); };
  const production = await createProductionCore(config, { fetcher: forbiddenFetcher });
  t.after(async () => production.close());

  const source = await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 31, g: 71, b: 111, alpha: 1 } } }).png({ compressionLevel: 9 }).toBuffer();
  const project = await production.projects.create(auth, 'R3b production prepare probe', source, { maxDimension: 1024, maxPixels: 1_048_576 });
  const projectId = String(project.project_id);
  const scope = Object.freeze({ ...auth, projectId });
  const originalStorageId = String(project.original_image_storage_id);
  const sourceArtifactId = production.artifacts.external.issueStoredOriginal(originalStorageId, scope);
  const clientRequestId = globalThis.crypto.randomUUID();

  let prepared;
  try {
    prepared = await production.localExecution.orthogonalTransform.prepare({ projectId, sourceArtifactId, clientRequestId, mode: 'ROTATE_90_CW' }, auth);
  } catch (error) {
    const value = error as Error & { code?: string; status?: number };
    console.error(JSON.stringify({ authority: 'R3B_PRODUCTION_ORTHOGONAL_PREPARE_FAILED', name: value.name, code: value.code, status: value.status, message: value.message, clientRequestIdLength: clientRequestId.length, sourceArtifactIdLength: sourceArtifactId.length }, null, 2));
    throw error;
  }

  assertTicket(prepared);
  assert.equal(providerCalls, 0);
});

function assertTicket(prepared: Awaited<ReturnType<Awaited<ReturnType<typeof createProductionCore>>['localExecution']['orthogonalTransform']['prepare']>>) {
  assert.equal(prepared.ticket.version, '2');
  assert.equal(prepared.ticket.operation.capability, 'local:tool:orthogonal-transform:v1');
  assert.deepEqual(prepared.ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: 'orthogonal-transform', version: '1' }]);
  assert.deepEqual(prepared.ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual([prepared.ticket.expectedOutputs[0].width, prepared.ticket.expectedOutputs[0].height], [8, 12]);
  assert.deepEqual(Object.keys(prepared.ticket.scope).sort(), ['projectId', 'tenantId', 'userId']);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for R3b production composition probe`);
  return value;
}

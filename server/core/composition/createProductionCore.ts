import { randomUUID } from 'node:crypto';
import { checkTransactionSchema } from '../../transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { createPostgresTransactionRuntime } from '../../transactions/infrastructure/postgres/postgresTransactionRuntime.ts';
import { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';
import { CanonicalArtifactHydrator } from '../artifacts/canonicalArtifactHydrator.ts';
import { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import { PostgresMaskArtifactStore } from '../artifacts/postgresMaskArtifactStore.ts';
import { checkMaskArtifactSchema } from '../artifacts/maskArtifactSchema.ts';
import { checkImageArtifactSchema } from '../artifacts/imageArtifactSchema.ts';
import { PostgresImageArtifactStore } from '../artifacts/postgresImageArtifactStore.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { CanonicalDecisionService, CanonicalPlanningService } from '../../../src/platform/creative/canonical/index.ts';
import { checkAuthSchema, migrateAuthSchema } from '../auth/authSchema.ts';
import { CanonicalAuthService } from '../auth/canonicalAuthService.ts';
import { PostgresAuthStore } from '../auth/postgresAuthStore.ts';
import { PostgresAuthSecurityStore } from '../auth/postgresAuthSecurityStore.ts';
import { ResendEmailSender } from '../auth/resendEmailSender.ts';
import { GoogleOidcClient } from '../auth/googleOidcClient.ts';
import type { CoreServerConfig } from '../config.ts';
import { createFalWorkflowRuntime } from '../providers/falWorkflowRuntime.ts';
import { productionExecutionCapabilities } from '../providers/productionExecutionCapabilities.ts';
import { createCreativeCore, type CreativeCoreCompositionInput } from './createCreativeCore.ts';
import { checkProjectSchema } from '../projects/projectSchema.ts';
import { PostgresProjectStore } from '../projects/postgresProjectStore.ts';

export async function createProductionCore(config: CoreServerConfig, options: Readonly<{ fetcher?: typeof fetch; now?: () => number }> = {}) {
  const transactions = createPostgresTransactionRuntime({ databaseUrl: config.databaseUrl, applicationName: 'bers-core-server' });
  try {
    await transactions.pool.query('SELECT 1');
    await checkTransactionSchema(transactions.pool);
    await checkMaskArtifactSchema(transactions.pool);
    await checkImageArtifactSchema(transactions.pool);
    await checkProjectSchema(transactions.pool);
    if (config.nodeEnv === 'test') await migrateAuthSchema(transactions.pool);
    else await checkAuthSchema(transactions.pool);
    const now = options.now ?? Date.now;
    const externalArtifacts = new SignedArtifactAuthority(config.artifactSigningSecret, config.trustedAssetHosts, now);
    const artifacts = new ArtifactAuthority(externalArtifacts, new PostgresMaskArtifactStore(transactions.pool), new PostgresImageArtifactStore(transactions.pool));
    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const runtime = createFalWorkflowRuntime({ apiKey: config.falKey, baseUrl: config.falBaseUrl, timeoutMs: config.providerTimeoutMs, artifacts: externalArtifacts, fetcher });
    const hydrator = new CanonicalArtifactHydrator(artifacts, fetcher);
    const decision = new CanonicalDecisionService();
    const planning = new CanonicalPlanningService();
    const core = createCreativeCore({
      transactions: transactions.transactions, transactionStore: transactions.store, ownsArtifacts: (scope, ids) => artifacts.owns(scope, ids), hydrateArtifacts: (scope, original, masks) => hydrator.hydrate(scope, original, masks),
      persistFinal: async (scope, executionId, artifact) => {
        const metrics = artifact.metadata?.integrityMetrics as { verificationOutcome?: string } | undefined;
        const image = artifact.value as PixelImage;
        if (artifact.role !== 'COMPOSITE' || artifact.state !== 'FINAL' || metrics?.verificationOutcome !== 'PASS' || !(image?.data instanceof Uint8ClampedArray)) throw new Error('Only a verified FINAL COMPOSITE may be persisted');
        const stored = await artifacts.images.persistFinal(scope, executionId, artifact.producerOperationId, image);
        const artifactId = externalArtifacts.issueStoredFinal(stored.storageId, scope);
        return Object.freeze({ ...artifact, id: artifactId, value: Object.freeze({ artifactId }), image: { width: stored.width, height: stored.height, format: stored.encoding, orientation: 1 as const, colorSpace: 'srgb', alpha: true }, metadata: Object.freeze({ ...artifact.metadata, storageId: stored.storageId, executionId, operationId: stored.operationId, contentType: stored.contentType, encoding: stored.encoding, parentArtifactIds: artifact.metadata?.parentArtifactIds }) });
      },
      mintFinalDelivery: (scope, storageId) => `/api/core/artifacts/results/${encodeURIComponent(externalArtifacts.issueStoredFinalDelivery(storageId, scope, now() + 5 * 60_000))}`,
      creditsPerEdit: config.creditsPerEdit, hardBudgetCredits: config.hardBudgetCredits,
      canonical: {
        runtime, providers: { isAvailable: providerId => providerId === 'fal', fallback: () => undefined },
        decision,
        planning,
        targetSelector: { select: () => 'CLOUD' as const }, capabilityAdmission: productionExecutionCapabilities, securityGate: { authorize: request => request.budget?.credits !== undefined && request.budget.credits <= config.hardBudgetCredits },
        recovery: { decide: () => 'MARK_UNKNOWN' }, verifier: { verify: async (operation, output) => ({ stepId: operation.id, valid: output.length > 0, checks: output.length ? ['provider-artifact-present'] : [], errors: output.length ? [] : ['Provider returned no artifact'] }) },
        now: Date.now, id: randomUUID,
      },
    } satisfies CreativeCoreCompositionInput);
    const authStore = new PostgresAuthStore(transactions.pool);
    const authSecurityStore = new PostgresAuthSecurityStore(transactions.pool);
    const authRuntime = resolveAuthRuntime(config);
    const email = new ResendEmailSender({ apiKey: authRuntime.resendApiKey, from: authRuntime.emailFrom, fetcher });
    const google = new GoogleOidcClient({
      clientId: authRuntime.googleClientId,
      clientSecret: authRuntime.googleClientSecret,
      redirectUri: new URL('/api/core/auth/callback/google', authRuntime.publicOrigin).toString(),
      fetcher,
      now,
    });
    const auth = new CanonicalAuthService({
      store: authStore,
      securityStore: authSecurityStore,
      jwt: { secret: config.jwtSecret, issuer: config.jwtIssuer, audience: config.jwtAudience },
      challengeSecret: authRuntime.challengeSecret,
      defaultTenantId: authRuntime.defaultTenantId,
      publicOrigin: authRuntime.publicOrigin,
      email,
      google,
      now,
      sessionTtlMs: config.authSessionAbsoluteTtlMs,
      sessionIdleTtlMs: config.authSessionIdleTtlMs,
      allowStatelessTestTokens: config.nodeEnv === 'test',
    });
    return Object.freeze({ core, artifacts, projects: new PostgresProjectStore(transactions.pool), auth, transactions, close: () => transactions.close() });
  } catch (error) { await transactions.close(); throw error; }
}

function resolveAuthRuntime(config: CoreServerConfig) {
  if (config.nodeEnv !== 'test') {
    return {
      challengeSecret: config.authChallengeSecret,
      defaultTenantId: config.authDefaultTenantId,
      publicOrigin: config.authPublicOrigin,
      resendApiKey: config.resendApiKey,
      emailFrom: config.authEmailFrom,
      googleClientId: config.googleOauthClientId,
      googleClientSecret: config.googleOauthClientSecret,
    };
  }
  return {
    challengeSecret: config.authChallengeSecret || 'test-only-auth-challenge',
    defaultTenantId: config.authDefaultTenantId || 'test-tenant',
    publicOrigin: config.authPublicOrigin || 'http://localhost',
    resendApiKey: config.resendApiKey || 'test-only-resend-key',
    emailFrom: config.authEmailFrom || 'Bers Test <auth@example.test>',
    googleClientId: config.googleOauthClientId || 'test-google-client',
    googleClientSecret: config.googleOauthClientSecret || 'test-google-secret',
  };
}

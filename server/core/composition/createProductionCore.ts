import { randomUUID } from 'node:crypto';
import { checkTransactionSchema } from '../../transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { createPostgresTransactionRuntime } from '../../transactions/infrastructure/postgres/postgresTransactionRuntime.ts';
import { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';
import { CanonicalArtifactHydrator } from '../artifacts/canonicalArtifactHydrator.ts';
import { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import { PostgresMaskArtifactStore } from '../artifacts/postgresMaskArtifactStore.ts';
import { checkMaskArtifactSchema } from '../artifacts/maskArtifactSchema.ts';
import { checkImageArtifactSchema } from '../artifacts/imageArtifactSchema.ts';
import { checkLocalExecutionUploadSchema, migrateLocalExecutionUploadSchema } from '../artifacts/localExecutionUploadSchema.ts';
import { PostgresImageArtifactStore } from '../artifacts/postgresImageArtifactStore.ts';
import type { LocalExecutionExecutorBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { CanonicalDecisionService, CanonicalPlanningService } from '../../../src/platform/creative/canonical/index.ts';
import { checkAuthSchema, migrateAuthSchema } from '../auth/authSchema.ts';
import { CanonicalAuthService } from '../auth/canonicalAuthService.ts';
import { PostgresAuthStore } from '../auth/postgresAuthStore.ts';
import { PostgresAuthSecurityStore } from '../auth/postgresAuthSecurityStore.ts';
import { ResendEmailSender } from '../auth/resendEmailSender.ts';
import { GoogleOidcClient } from '../auth/googleOidcClient.ts';
import type { CoreServerConfig } from '../config.ts';
import { LocalDeterministicImageExecutionService, LocalExecutionInputDeliveryService, LocalExecutionTicketAuthority, LocalSegmentationExecutionService, LocalSuperResolutionExecutionService, PostgresLocalExecutionLedger, PostgresLocalExecutionUploadStore, checkLocalExecutionLedgerSchema, migrateLocalExecutionLedgerSchema } from '../localExecution/index.ts';
import { productionLocalModelsByCapability } from '../localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../localExecution/productionLocalExecutorPolicy.ts';
import { createFalWorkflowRuntime } from '../providers/falWorkflowRuntime.ts';
import { productionProviderSelection } from '../providers/productionProviderSelection.ts';
import { productionExecutionRoute } from '../providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../providers/productionTargetSelection.ts';
import { productionExecutionCapabilities } from '../providers/productionExecutionCapabilities.ts';
import { productionWorkflowVerifier } from '../providers/productionWorkflowVerifier.ts';
import { createCreativeCore, type CreativeCoreCompositionInput } from './createCreativeCore.ts';
import { checkProjectSchema } from '../projects/projectSchema.ts';
import { PostgresProjectStore } from '../projects/postgresProjectStore.ts';

const LOCAL_EXECUTION_TICKET_TTL_MS = 5 * 60_000;

type ProductionCoreOptions = Readonly<{
  fetcher?: typeof fetch;
  now?: () => number;
  /** Test-only authority catalog. Never accepted by production/staging composition. */
  testLocalExecutorsByCapability?: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>>;
}>;

export async function createProductionCore(config: CoreServerConfig, options: ProductionCoreOptions = {}) {
  if (options.testLocalExecutorsByCapability && config.nodeEnv !== 'test') throw new Error('Test local executor injection is forbidden outside nodeEnv=test');
  const localExecutorsByCapability = options.testLocalExecutorsByCapability ?? productionLocalExecutorsByCapability;
  const transactions = createPostgresTransactionRuntime({ databaseUrl: config.databaseUrl, applicationName: 'bers-core-server' });
  try {
    await transactions.pool.query('SELECT 1');
    await checkTransactionSchema(transactions.pool);
    await checkMaskArtifactSchema(transactions.pool);
    await checkImageArtifactSchema(transactions.pool);
    await checkProjectSchema(transactions.pool);
    if (config.nodeEnv === 'test') {
      await migrateAuthSchema(transactions.pool);
      await migrateLocalExecutionUploadSchema(transactions.pool);
      await migrateLocalExecutionLedgerSchema(transactions.pool);
    } else {
      await checkAuthSchema(transactions.pool);
      await checkLocalExecutionUploadSchema(transactions.pool);
      await checkLocalExecutionLedgerSchema(transactions.pool);
    }
    const now = options.now ?? Date.now;
    const externalArtifacts = new SignedArtifactAuthority(config.artifactSigningSecret, config.trustedAssetHosts, now);
    const maskArtifacts = new PostgresMaskArtifactStore(transactions.pool);
    const artifacts = new ArtifactAuthority(externalArtifacts, maskArtifacts, new PostgresImageArtifactStore(transactions.pool));
    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const runtime = createFalWorkflowRuntime({ apiKey: config.falKey, baseUrl: config.falBaseUrl, timeoutMs: config.providerTimeoutMs, artifacts: externalArtifacts, fetcher });
    const hydrator = new CanonicalArtifactHydrator(artifacts, fetcher);
    const decision = new CanonicalDecisionService();
    const planning = new CanonicalPlanningService();
    const localExecutionAdmission = new PostgresLocalExecutionLedger(transactions.pool);
    const localExecution = new LocalExecutionTicketAuthority(localExecutionAdmission, {
      now,
      id: randomUUID,
      nonce: randomUUID,
      ttlMs: LOCAL_EXECUTION_TICKET_TTL_MS,
      modelsByCapability: productionLocalModelsByCapability,
      executorsByCapability: localExecutorsByCapability,
    });
    const localUploads = new PostgresLocalExecutionUploadStore(transactions.pool);
    const canonical = {
      runtime,
      providers: { isAvailable: (providerId: string) => providerId === 'fal', fallback: () => undefined },
      decision,
      planning,
      routeSelector: productionExecutionRoute,
      targetSelector: productionTargetSelection,
      providerSelector: productionProviderSelection,
      capabilityAdmission: productionExecutionCapabilities,
      securityGate: { authorize: (request: { budget?: { credits?: number } }) => request.budget?.credits !== undefined && request.budget.credits <= config.hardBudgetCredits },
      recovery: { decide: () => 'MARK_UNKNOWN' as const },
      verifier: productionWorkflowVerifier,
      localExecution,
      localExecutionV2: localExecution,
      now,
      id: randomUUID,
    };
    const ownsArtifacts = (scope: Parameters<ArtifactAuthority['owns']>[0], ids: readonly string[]) => artifacts.owns(scope, ids);
    const hydrateArtifacts = (scope: Parameters<CanonicalArtifactHydrator['hydrate']>[0], original: string, masks: readonly string[]) => hydrator.hydrate(scope, original, masks);
    const core = createCreativeCore({
      transactions: transactions.transactions,
      transactionStore: transactions.store,
      ownsArtifacts,
      hydrateArtifacts,
      persistFinal: async (scope, executionId, artifact) => {
        const metrics = artifact.metadata?.integrityMetrics as { verificationOutcome?: string } | undefined;
        const image = artifact.value as PixelImage;
        if (artifact.role !== 'COMPOSITE' || artifact.state !== 'FINAL' || metrics?.verificationOutcome !== 'PASS' || !(image?.data instanceof Uint8ClampedArray)) throw new Error('Only a verified FINAL COMPOSITE may be persisted');
        const stored = await artifacts.images.persistFinal(scope, executionId, artifact.producerOperationId, image);
        const artifactId = externalArtifacts.issueStoredFinal(stored.storageId, scope);
        return Object.freeze({ ...artifact, id: artifactId, value: Object.freeze({ artifactId }), image: { width: stored.width, height: stored.height, format: stored.encoding, orientation: 1 as const, colorSpace: 'srgb', alpha: true }, metadata: Object.freeze({ ...artifact.metadata, storageId: stored.storageId, executionId, operationId: stored.operationId, contentType: stored.contentType, encoding: stored.encoding, parentArtifactIds: artifact.metadata?.parentArtifactIds }) });
      },
      mintFinalDelivery: (scope, storageId) => `/api/core/artifacts/results/${encodeURIComponent(externalArtifacts.issueStoredFinalDelivery(storageId, scope, now() + 5 * 60_000))}`,
      creditsPerEdit: config.creditsPerEdit,
      hardBudgetCredits: config.hardBudgetCredits,
      canonical,
    } satisfies CreativeCoreCompositionInput);
    const localSegmentation = new LocalSegmentationExecutionService({
      platform: canonical,
      ownsArtifacts,
      hydrateArtifacts,
      admission: localExecutionAdmission,
      uploads: localUploads,
      persistMask: (ticketId, scope, width, height, alpha, sourceArtifactId) => maskArtifacts.persistLocalExecution(ticketId, scope, width, height, alpha, sourceArtifactId ? resolveStoredImageStorageId(externalArtifacts, sourceArtifactId, scope) : undefined),
      loadPersistedMask: (ticketId, scope) => maskArtifacts.loadLocalExecution(ticketId, scope),
      issueMaskId: (storageId, scope) => externalArtifacts.issueStoredMask(storageId, scope),
      now,
    });
    const localDeterministicImages = new LocalDeterministicImageExecutionService({
      platform: canonical,
      ownsArtifacts,
      hydrateArtifacts,
      admission: localExecutionAdmission,
      uploads: localUploads,
      persistFinal: (scope, executionId, operationId, image) => artifacts.images.persistFinal(scope, executionId, operationId, image),
      loadPersistedFinal: (executionId, scope) => artifacts.images.loadFinalByExecution(executionId, scope),
      issueFinalId: (storageId, scope) => externalArtifacts.issueStoredFinal(storageId, scope),
      now,
    });
    const localSuperResolution = new LocalSuperResolutionExecutionService({
      platform: canonical,
      ownsArtifacts,
      hydrateArtifacts,
      admission: localExecutionAdmission,
      uploads: localUploads,
      persistFinal: (scope, executionId, operationId, image) => artifacts.images.persistFinal(scope, executionId, operationId, image),
      loadPersistedFinal: (executionId, scope) => artifacts.images.loadFinalByExecution(executionId, scope),
      issueFinalId: (storageId, scope) => externalArtifacts.issueStoredFinal(storageId, scope),
      now,
    });
    const localInputDelivery = new LocalExecutionInputDeliveryService({ admission: localExecutionAdmission, ownsArtifacts, hydrateArtifacts, now });
    const authStore = new PostgresAuthStore(transactions.pool);
    const authSecurityStore = new PostgresAuthSecurityStore(transactions.pool);
    const authRuntime = resolveAuthRuntime(config);
    const email = new ResendEmailSender({ apiKey: authRuntime.resendApiKey, from: authRuntime.emailFrom, fetcher });
    const google = new GoogleOidcClient({ clientId: authRuntime.googleClientId, clientSecret: authRuntime.googleClientSecret, redirectUri: new URL('/api/core/auth/callback/google', authRuntime.publicOrigin).toString(), fetcher, now });
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
    return Object.freeze({ core, artifacts, projects: new PostgresProjectStore(transactions.pool), auth, localExecution: Object.freeze({ tickets: localExecution, admission: localExecutionAdmission, uploads: localUploads, segmentation: localSegmentation, deterministicImages: localDeterministicImages, superResolution: localSuperResolution, inputDelivery: localInputDelivery }), transactions, close: () => transactions.close() });
  } catch (error) { await transactions.close(); throw error; }
}

function resolveStoredImageStorageId(authority: SignedArtifactAuthority, artifactId: string, scope: Parameters<ArtifactAuthority['owns']>[0]): string | undefined {
  try { return authority.resolveStoredOriginalId(artifactId, scope).storageId; } catch { /* stored FINAL below */ }
  try { return authority.resolveStoredFinalId(artifactId, scope).storageId; } catch { return undefined; }
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

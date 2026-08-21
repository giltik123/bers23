import { randomUUID } from 'node:crypto';
import { checkTransactionSchema } from '../../transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { createPostgresTransactionRuntime } from '../../transactions/infrastructure/postgres/postgresTransactionRuntime.ts';
import { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';
import { CanonicalArtifactHydrator } from '../artifacts/canonicalArtifactHydrator.ts';
import { HmacJwtVerifier } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { createFalWorkflowRuntime } from '../providers/falWorkflowRuntime.ts';
import { createCreativeCore, type CreativeCoreCompositionInput } from './createCreativeCore.ts';

export async function createProductionCore(config: CoreServerConfig, options: Readonly<{ fetcher?: typeof fetch }> = {}) {
  const transactions = createPostgresTransactionRuntime({ databaseUrl: config.databaseUrl, applicationName: 'bers-core-server' });
  try {
    await transactions.pool.query('SELECT 1'); await checkTransactionSchema(transactions.pool);
    const artifacts = new SignedArtifactAuthority(config.artifactSigningSecret, config.trustedAssetHosts);
    const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    const runtime = createFalWorkflowRuntime({ apiKey: config.falKey, baseUrl: config.falBaseUrl, timeoutMs: config.providerTimeoutMs, artifacts, fetcher });
    const hydrator = new CanonicalArtifactHydrator(artifacts, fetcher);
    const core = createCreativeCore({
      transactions: transactions.transactions, transactionStore: transactions.store, ownsArtifacts: (scope, ids) => artifacts.owns(scope, ids), hydrateArtifacts: (scope, original, masks) => hydrator.hydrate(scope, original, masks),
      creditsPerEdit: config.creditsPerEdit, hardBudgetCredits: config.hardBudgetCredits,
      canonical: {
        runtime, providers: { isAvailable: providerId => providerId === 'fal', fallback: () => undefined },
        decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
        planning: { plan: async request => { const controlled = request.metadata?.editCapability === 'CONTROLLED_LOCAL_EDIT' && Boolean(request.inputArtifacts?.some(artifact => artifact.role === 'ORIGINAL')) && Boolean(request.inputArtifacts?.some(artifact => artifact.role === 'MASK')) && Boolean((request.metadata?.selectedObjectIds as readonly unknown[] | undefined)?.length); const operation = { id: 'creative-image-edit', type: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'image-edit', providerId: 'fal', requiredArtifacts: (request.inputArtifacts ?? []).map(artifact => artifact.id), produces: ['image'], input: controlled ? { instruction: request.intent, preserveMode: request.metadata?.preserveMode ?? 'STRICT', correlationId: request.metadata?.correlationId } : { prompt: request.intent, correlationId: request.metadata?.correlationId } }; return { requestId: request.id, operations: [operation] }; } },
        targetSelector: { select: () => 'CLOUD' as const }, securityGate: { authorize: request => request.budget?.credits !== undefined && request.budget.credits <= config.hardBudgetCredits },
        recovery: { decide: () => 'MARK_UNKNOWN' }, verifier: { verify: async (operation, output) => ({ stepId: operation.id, valid: output.length > 0, checks: output.length ? ['provider-artifact-present'] : [], errors: output.length ? [] : ['Provider returned no artifact'] }) },
        now: Date.now, id: randomUUID,
      },
    } satisfies CreativeCoreCompositionInput);
    return Object.freeze({ core, auth: new HmacJwtVerifier({ secret: config.jwtSecret, issuer: config.jwtIssuer, audience: config.jwtAudience }), transactions, close: () => transactions.close() });
  } catch (error) { await transactions.close(); throw error; }
}

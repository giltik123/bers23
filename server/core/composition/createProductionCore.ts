import { randomUUID } from 'node:crypto';
import { checkTransactionSchema } from '../../transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { createPostgresTransactionRuntime } from '../../transactions/infrastructure/postgres/postgresTransactionRuntime.ts';
import { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';
import { HmacJwtVerifier } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { createFalWorkflowRuntime } from '../providers/falWorkflowRuntime.ts';
import { createCreativeCore } from './createCreativeCore.ts';

export async function createProductionCore(config: CoreServerConfig, options: Readonly<{ fetcher?: typeof fetch }> = {}) {
  const transactions = createPostgresTransactionRuntime({ databaseUrl: config.databaseUrl, applicationName: 'bers-core-server' });
  try {
    await transactions.pool.query('SELECT 1'); await checkTransactionSchema(transactions.pool);
    const artifacts = new SignedArtifactAuthority(config.artifactSigningSecret, config.trustedAssetHosts);
    const runtime = createFalWorkflowRuntime({ apiKey: config.falKey, baseUrl: config.falBaseUrl, timeoutMs: config.providerTimeoutMs, artifacts, fetcher: options.fetcher });
    const operation = { id: 'creative-image-edit', type: 'image-edit', providerId: 'fal', input: {} } as const;
    const core = createCreativeCore({
      transactions: transactions.transactions, transactionStore: transactions.store, ownsArtifacts: (scope, ids) => artifacts.owns(scope, ids),
      creditsPerEdit: config.creditsPerEdit, hardBudgetCredits: config.hardBudgetCredits,
      canonical: {
        runtime, providers: { isAvailable: providerId => providerId === 'fal', fallback: () => undefined },
        decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
        planning: { plan: async request => ({ requestId: request.id, operations: [{ ...operation, requiredArtifacts: (request.inputArtifacts ?? []).map(artifact => artifact.id), produces: ['image'], input: { prompt: request.intent, correlationId: request.metadata?.correlationId } }] }) },
        targetSelector: { select: () => 'CLOUD' }, securityGate: { authorize: request => request.budget?.credits !== undefined && request.budget.credits <= config.hardBudgetCredits },
        recovery: { decide: () => 'MARK_UNKNOWN' }, verifier: { verify: async (_operation, output) => ({ stepId: operation.id, valid: output.length > 0, checks: output.length ? ['provider-artifact-present'] : [], errors: output.length ? [] : ['Provider returned no artifact'] }) },
        now: Date.now, id: randomUUID,
      },
    });
    return Object.freeze({ core, auth: new HmacJwtVerifier({ secret: config.jwtSecret, issuer: config.jwtIssuer, audience: config.jwtAudience }), transactions, close: () => transactions.close() });
  } catch (error) { await transactions.close(); throw error; }
}

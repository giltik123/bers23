import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformDependencies, type CreativeRequest } from '../../../src/platform/creative/canonical/index.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/index.ts';
import type { TransactionStore } from '../../transactions/application/ports.ts';
import { TransactionService } from '../../transactions/application/transactionService.ts';
import { CreativeExecutionService, type CreativeExecutionServiceDependencies } from '../application/creativeExecutionService.ts';
import { TransactionBillingAuthorityAdapter } from '../billing/TransactionBillingAuthorityAdapter.ts';
import { createCreativeExecuteHandler } from '../http/creativeExecuteHandler.ts';
import { createCreativeLifecycleHandlers } from '../http/creativeLifecycleHandlers.ts';

export type AuthContext = Readonly<{ userId: string; tenantId: string }>;
export type InputSource = 'CANONICAL_ARTIFACT' | 'LEGACY_URL';
export type ResolvedInput = Readonly<{ artifact: CreativeArtifact; inputSource: InputSource }>;
export interface AuthenticationVerifier { verify(token: string): Promise<AuthContext | undefined> }
export interface ArtifactAuthority {
  resolveArtifact(id: string, scope: Scope): Promise<CreativeArtifact | undefined>;
  resolveLegacyUrl(url: string, scope: Scope): Promise<CreativeArtifact | undefined>;
  projectBelongsTo(projectId: string, identity: AuthContext): Promise<boolean>;
}
export interface CoreTelemetry { record(event: Readonly<{ name: string; inputSource: InputSource; tenantId: string; projectId: string }>): void | Promise<void> }

export type CreativeCoreDependencies = Readonly<{
  platform: CreativeExecutionPlatformDependencies;
  auth: AuthenticationVerifier;
  artifacts: ArtifactAuthority;
  telemetry: CoreTelemetry;
  trustedAssetHosts: readonly string[];
  maxCredits: number;
}>;

export type CreativeCoreCompositionInput = Readonly<{
  canonical: Omit<CreativeExecutionPlatformDependencies, 'billing'>;
  transactions: TransactionService;
  transactionStore: TransactionStore;
  ownsArtifacts: CreativeExecutionServiceDependencies['ownsArtifacts'];
  hydrateArtifacts?: CreativeExecutionServiceDependencies['hydrateArtifacts'];
  persistFinal?: CreativeExecutionServiceDependencies['persistFinal'];
  mintFinalDelivery?: CreativeExecutionServiceDependencies['mintFinalDelivery'];
  creditsPerEdit?: number;
  hardBudgetCredits?: number;
}>;

export type ExecuteInput = Readonly<{ clientRequestId: string; projectId: string; intent: string; artifactId?: string; inputArtifact?: string; maskArtifactIds?: readonly string[]; selectedObjectIds?: readonly string[]; preserveMode?: 'STRICT' | 'BALANCED' | 'CREATIVE'; budget?: Readonly<{ credits?: number }> }>;
type ExecutionRecord = Readonly<{ scope: Scope; promise: Promise<void> }>;

/** Existing application composition retained for callers that supply transaction services directly. */
function createCreativeApplicationCore(input: CreativeCoreCompositionInput) {
  const billing = new TransactionBillingAuthorityAdapter(input.transactions, input.transactionStore, 'fal');
  const service = new CreativeExecutionService({
    platform: { ...input.canonical, billing },
    ownsArtifacts: input.ownsArtifacts,
    hydrateArtifacts: input.hydrateArtifacts,
    persistFinal: input.persistFinal,
    mintFinalDelivery: input.mintFinalDelivery,
    creditsPerEdit: input.creditsPerEdit,
    hardBudgetCredits: input.hardBudgetCredits,
  });
  return Object.freeze({ service, execute: createCreativeExecuteHandler(service), lifecycle: createCreativeLifecycleHandlers(service) });
}

/** HTTP/runtime composition used by deployment adapters. */
function createCreativeHttpCore(dependencies: CreativeCoreDependencies) {
  validateDependencies(dependencies);
  const platform = new CreativeExecutionPlatform(dependencies.platform);
  const executions = new Map<string, ExecutionRecord>();

  const authenticate = async (authorization: string | null): Promise<AuthContext> => {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const identity = match ? await dependencies.auth.verify(match[1]) : undefined;
    if (!identity?.userId || !identity.tenantId) throw publicError(401, 'Authentication required');
    return identity;
  };
  const assertOwnership = (id: string, identity: AuthContext) => {
    const record = executions.get(id);
    if (!record) throw publicError(404, 'Execution not found');
    if (record.scope.userId !== identity.userId || record.scope.tenantId !== identity.tenantId) throw publicError(403, 'Execution scope denied');
    return record;
  };
  return Object.freeze({
    authenticate,
    async execute(identity: AuthContext, input: ExecuteInput) {
      if (!input.clientRequestId || !input.projectId || !input.intent) throw publicError(400, 'clientRequestId, projectId and intent are required');
      if (!await dependencies.artifacts.projectBelongsTo(input.projectId, identity)) throw publicError(403, 'Project scope denied');
      const scope = { tenantId: identity.tenantId, userId: identity.userId, projectId: input.projectId };
      const resolved = await resolveInputArtifact(input, scope, dependencies); const masks = await Promise.all((input.maskArtifactIds ?? []).map(async artifactId => { const artifact = await dependencies.artifacts.resolveArtifact(artifactId, scope); if (!artifact) throw publicError(403, 'Mask artifact scope denied'); return artifact; }));
      const id = `${identity.tenantId}:${identity.userId}:${input.projectId}:${input.clientRequestId}`;
      if (!executions.has(id)) {
        const request: CreativeRequest = { id, intent: input.intent, scope, inputArtifacts: [resolved.artifact, ...masks], budget: { credits: Math.min(input.budget?.credits ?? 0, dependencies.maxCredits), aiCalls: 1, retries: 0 }, metadata: { idempotencyKey: input.clientRequestId, inputSource: resolved.inputSource, editCapability: masks.length && (input.selectedObjectIds?.length ?? 0) ? 'CONTROLLED_LOCAL_EDIT' : 'GLOBAL_EDIT', preserveMode: input.preserveMode ?? 'STRICT', selectedObjectIds: input.selectedObjectIds ?? [], maskArtifactIds: input.maskArtifactIds ?? [] } };
        platform.createExecution(request);
        const promise = platform.execute(id).then(() => undefined);
        // Install the ownership record before yielding so concurrent duplicates share it.
        executions.set(id, { scope, promise });
        await dependencies.telemetry.record({ name: 'creative_input_resolved', inputSource: resolved.inputSource, tenantId: scope.tenantId, projectId: scope.projectId });
      }
      return { executionId: id, status: platform.status(id), inputSource: resolved.inputSource };
    },
    status(identity: AuthContext, id: string) { assertOwnership(id, identity); return { executionId: id, status: platform.status(id) }; },
    result(identity: AuthContext, id: string) { assertOwnership(id, identity); const outcome = platform.result(id); return outcome ? publicOutcome(outcome) : { executionId: id, status: platform.status(id) }; },
    cancel(identity: AuthContext, id: string) { assertOwnership(id, identity); platform.cancel(id); return { executionId: id, status: platform.status(id) }; },
    wait(identity: AuthContext, id: string) { return assertOwnership(id, identity).promise; },
  });
}

export type CreativeApplicationCore = ReturnType<typeof createCreativeApplicationCore>;
export type CreativeHttpCore = ReturnType<typeof createCreativeHttpCore>;

export function createCreativeCore(input: CreativeCoreDependencies): CreativeHttpCore;
export function createCreativeCore(input: CreativeCoreCompositionInput): CreativeApplicationCore;
export function createCreativeCore(input: CreativeCoreDependencies | CreativeCoreCompositionInput): CreativeHttpCore | CreativeApplicationCore {
  return 'auth' in input ? createCreativeHttpCore(input) : createCreativeApplicationCore(input);
}

async function resolveInputArtifact(input: ExecuteInput, scope: Scope, dependencies: CreativeCoreDependencies): Promise<ResolvedInput> {
  if (input.artifactId) {
    const artifact = await dependencies.artifacts.resolveArtifact(input.artifactId, scope);
    if (!artifact) throw publicError(403, 'Artifact scope denied');
    return { artifact, inputSource: 'CANONICAL_ARTIFACT' };
  }
  if (!input.inputArtifact) throw publicError(400, 'artifactId is required');
  let url: URL;
  try { url = new URL(input.inputArtifact); } catch { throw publicError(400, 'Legacy asset reference is invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !dependencies.trustedAssetHosts.includes(url.hostname.toLowerCase())) throw publicError(403, 'Legacy asset reference is not trusted');
  const artifact = await dependencies.artifacts.resolveLegacyUrl(url.href, scope);
  if (!artifact) throw publicError(403, 'Legacy asset scope denied');
  return { artifact, inputSource: 'LEGACY_URL' };
}

function validateDependencies(value: CreativeCoreDependencies): void {
  const required = [['transaction store', value.platform.billing], ['provider runtime', value.platform.runtime], ['authentication verifier', value.auth], ['artifact authority/store', value.artifacts], ['security policy', value.platform.securityGate], ['cost/budget configuration', Number.isFinite(value.maxCredits) && value.maxCredits >= 0 ? value.maxCredits + 1 : undefined]] as const;
  for (const [name, dependency] of required) if (!dependency) throw new Error(`Creative Core startup dependency missing: ${name}`);
  if (!Array.isArray(value.trustedAssetHosts) || value.trustedAssetHosts.length === 0) throw new Error('Creative Core startup dependency missing: trusted asset hosts');
}

function publicOutcome(outcome: Awaited<ReturnType<CreativeExecutionPlatform['execute']>>) {
  return { executionId: outcome.executionId, status: outcome.status, verification: { valid: outcome.verification.valid }, artifacts: outcome.artifacts.map(({ id, kind, state }) => ({ id, kind, state })) };
}
export function publicError(status: number, message: string) { return Object.assign(new Error(message), { status }); }

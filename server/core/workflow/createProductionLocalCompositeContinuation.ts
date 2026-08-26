import type { Pool } from 'pg';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import type { CreativeArtifact, ProductionOutcome } from '../../../src/platform/creative/canonical/contracts.ts';
import type { LocalExecutionTicket, LocalExecutionTicketIssuerPort, LocalExecutionTicketV2, LocalExecutionTicketV2IssuerPort } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Artifact, Scope, WorkflowOperation, WorkflowVerifierPort } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import type { CanonicalArtifactHydrator } from '../artifacts/canonicalArtifactHydrator.ts';
import { DurableArtifactLineageResolver } from '../artifacts/durableArtifactLineageResolver.ts';
import type { PostgresMaskArtifactStore } from '../artifacts/postgresMaskArtifactStore.ts';
import type { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';
import { BackgroundIsolationResultAuthority, SegmentationResultAuthority } from '../localExecution/LocalExecutionResultAuthority.ts';
import type { PostgresLocalExecutionLedger } from '../localExecution/PostgresLocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';
import { productionWorkflowVerifier } from '../providers/productionWorkflowVerifier.ts';
import { LocalCompositeContinuationService, LOCAL_COMPOSITE_CONTINUATION_STEPS } from './LocalCompositeContinuationService.ts';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';

type TicketAuthority = LocalExecutionTicketIssuerPort & LocalExecutionTicketV2IssuerPort;

export type ProductionLocalCompositeContinuationInput = Readonly<{
  pool: Pool;
  now: () => number;
  tickets: TicketAuthority;
  admission: PostgresLocalExecutionLedger;
  uploads: PostgresLocalExecutionUploadStore;
  artifacts: ArtifactAuthority;
  hydrator: CanonicalArtifactHydrator;
  signed: SignedArtifactAuthority;
  masks: PostgresMaskArtifactStore;
  verifier?: WorkflowVerifierPort;
}>;

/**
 * Wires the first durable LOCAL_ONLY composite to existing Core authorities.
 * This module exposes no HTTP route and grants no model-release authority.
 */
export function createProductionLocalCompositeContinuation(input: ProductionLocalCompositeContinuationInput): LocalCompositeContinuationService {
  const verifier = input.verifier ?? productionWorkflowVerifier;
  const ownsArtifacts = (scope: Scope, ids: readonly string[]) => input.artifacts.owns(scope, ids);
  const hydrateArtifacts = (scope: Scope, sourceId: string, maskIds: readonly string[]) => input.hydrator.hydrate(scope, sourceId, maskIds);
  const resolver = new DurableArtifactLineageResolver({ signed: input.signed, images: input.artifacts.images, masks: input.masks });
  const continuations = new PostgresWorkflowContinuationStore(input.pool, input.now);

  const segmentAuthority = new SegmentationResultAuthority({
    admission: input.admission,
    uploads: input.uploads,
    ownsArtifacts,
    hydrateArtifacts,
    persistMask: (ticketId, scope, width, height, alpha, sourceArtifactId) => input.masks.persistLocalExecution(
      ticketId,
      scope,
      width,
      height,
      alpha,
      sourceArtifactId ? resolveStoredImageStorageId(input.signed, sourceArtifactId, scope) : undefined,
    ),
    loadPersistedMask: (ticketId, scope) => input.masks.loadLocalExecution(ticketId, scope),
    issueMaskId: (storageId, scope) => input.signed.issueStoredMask(storageId, scope),
    now: input.now,
  }, {
    capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment,
    stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment,
  });

  const backgroundAuthority = new BackgroundIsolationResultAuthority({
    admission: input.admission,
    uploads: input.uploads,
    ownsArtifacts,
    hydrateArtifacts,
    persistFinal: (scope, executionId, operationId, image, lineage) => {
      if (!lineage) throw compositionError('local_composite_final_lineage_missing', 'Composite Background Isolation requires exact IMAGE + MASK lineage');
      const sourceImageStorageId = resolveStoredImageStorageId(input.signed, lineage.sourceArtifactId, scope);
      const maskStorageId = resolveStoredMaskStorageId(input.signed, lineage.maskArtifactId, scope);
      if (!sourceImageStorageId || !maskStorageId) throw compositionError('local_composite_final_lineage_unavailable', 'Composite Background Isolation parents are not durable canonical artifacts');
      return input.artifacts.images.persistFinal(scope, executionId, operationId, image, {
        sourceImageStorageId,
        maskStorageId,
        producerOperation: 'BACKGROUND_ISOLATION',
      });
    },
    loadPersistedFinal: (executionId, scope) => input.artifacts.images.loadFinalByExecution(executionId, scope),
    issueFinalId: (storageId, scope) => input.signed.issueStoredFinal(storageId, scope),
    now: input.now,
  }, {
    capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
    stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation,
  });

  return new LocalCompositeContinuationService({
    continuations,
    tickets: input.admission,
    v1Tickets: input.tickets,
    v2Tickets: input.tickets,
    artifacts: resolver,
    segmentResults: Object.freeze({
      submit: async ({ ticket, result }) => requireSuccessfulSubmission(await segmentAuthority.submit({
        ticket,
        result,
        verify: ({ ticket: admittedTicket, artifact }) => verifyLocalArtifact(verifier, admittedTicket, artifact),
      })),
    }),
    backgroundIsolationResults: Object.freeze({
      submit: async ({ ticket, result }) => requireSuccessfulSubmission(await backgroundAuthority.submit({
        ticket,
        result,
        verify: ({ ticket: admittedTicket, artifact }) => verifyLocalArtifact(verifier, admittedTicket, artifact),
      })),
    }),
    internalVerifier: Object.freeze({
      verify: async ({ scope, stepId, artifactId }) => {
        const durable = await resolver.resolve(scope, artifactId);
        if (durable.kind !== 'image' || durable.role !== 'COMPOSITE') throw compositionError('local_composite_verify_artifact_contract', 'INTERNAL verify requires a durable canonical COMPOSITE');
        const hydrated = await input.hydrator.hydrate(scope, artifactId, []);
        const image = hydrated.find(candidate => candidate.id === artifactId && candidate.kind === 'image');
        if (!image) throw compositionError('local_composite_verify_artifact_unavailable', 'Durable COMPOSITE pixels are unavailable for INTERNAL verification');
        const operation: WorkflowOperation = Object.freeze({
          id: stepId,
          type: 'verify',
          executionRoute: 'INTERNAL',
          requiredArtifacts: Object.freeze([artifactId]),
          outputBindings: Object.freeze([Object.freeze({ logicalId: 'verified-image', artifactId, kind: 'image', slot: 0 })]),
        });
        const verification = await verifier.verify(operation, Object.freeze([asWorkflowArtifact(image, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation)]));
        if (!verification.valid) throw compositionError('local_composite_internal_verification_failed', `INTERNAL verify failed: ${verification.errors.join(',')}`);
      },
    }),
  });
}

async function verifyLocalArtifact(
  verifier: WorkflowVerifierPort,
  ticket: LocalExecutionTicket | LocalExecutionTicketV2,
  artifact: CreativeArtifact,
): Promise<ProductionOutcome> {
  const operation: WorkflowOperation = Object.freeze({
    id: ticket.stepId,
    type: ticket.operation.type,
    executionRoute: 'ON_DEVICE',
    requiredArtifacts: Object.freeze(ticket.inputs.map(binding => binding.artifactId)),
  });
  const verification = await verifier.verify(operation, Object.freeze([asWorkflowArtifact(artifact, ticket.stepId)]));
  const valid = verification.valid;
  return Object.freeze({
    executionId: ticket.workflowId,
    status: valid ? 'SUCCESS' : 'FAILED',
    verification: Object.freeze({ valid, checks: Object.freeze([...verification.checks]), errors: Object.freeze([...verification.errors]) }),
    artifacts: valid ? Object.freeze([artifact]) : Object.freeze([]),
  });
}

function asWorkflowArtifact(artifact: CreativeArtifact, producerStepId: string): Artifact {
  return Object.freeze({
    id: artifact.id,
    kind: artifact.kind,
    value: artifact.value,
    producerStepId,
    scope: artifact.scope,
    metadata: artifact.metadata,
  });
}

function requireSuccessfulSubmission(submission: Readonly<{ status: ProductionOutcome['status']; artifactId?: string }>): Readonly<{ artifactId: string }> {
  if (submission.status !== 'SUCCESS' || !submission.artifactId) throw compositionError('local_composite_result_not_successful', 'Local composite step did not produce a canonical successful Artifact');
  return Object.freeze({ artifactId: submission.artifactId });
}

function resolveStoredImageStorageId(authority: SignedArtifactAuthority, artifactId: string, scope: Scope): string | undefined {
  try { return authority.resolveStoredOriginalId(artifactId, scope).storageId; } catch { /* stored FINAL below */ }
  try { return authority.resolveStoredFinalId(artifactId, scope).storageId; } catch { return undefined; }
}

function resolveStoredMaskStorageId(authority: SignedArtifactAuthority, artifactId: string, scope: Scope): string | undefined {
  try { return authority.resolveStoredMask(artifactId, scope).storageId; } catch { return undefined; }
}

function compositionError(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }

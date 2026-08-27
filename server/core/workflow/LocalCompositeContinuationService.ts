import { createHash } from 'node:crypto';
import type {
  AnyLocalExecutionTicket,
  LocalExecutionTicket,
  LocalExecutionTicketIssuerPort,
  LocalExecutionTicketV2,
  LocalExecutionTicketV2IssuerPort,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT } from '../../../src/platform/creative/canonical/localComposite.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { LocalExecutionLedger, LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import {
  LocalSegmentationContractError,
  normalizeLocalSegmentationSelection,
  validateLocalSegmentationGeometry,
} from '../localExecution/localSegmentationInputContract.ts';
import {
  normalizeScope,
  type WorkflowContinuationSnapshot,
  type WorkflowContinuationStore,
  type WorkflowInputArtifactBinding,
  type WorkflowPlanBinding,
} from './WorkflowContinuationStore.ts';

export const LOCAL_COMPOSITE_CONTINUATION_PLAN_REVISION = '1' as const;
export const LOCAL_COMPOSITE_CONTINUATION_STEPS = Object.freeze({
  segment: 'local-continuation-01-segment',
  backgroundIsolation: 'local-continuation-02-background-isolation',
  verify: 'local-continuation-03-verify',
} as const);

const PLAN_ID = 'local-background-isolation-composite';
const PLAN_DIGEST_DOMAIN = 'bers:local-background-isolation-composite:plan:v1\0';
const EXECUTION_ID_DOMAIN = 'bers:local-background-isolation-composite:execution:v1\0';
const SHA256 = /^[a-f0-9]{64}$/i;

type TicketReader = Pick<LocalExecutionLedger, 'get' | 'getByIdempotencyKey'> & Pick<LocalExecutionLedgerV2, 'getV2' | 'getByIdempotencyKeyV2'>;

export type LocalCompositeResolvedArtifact = WorkflowInputArtifactBinding & Readonly<{ width: number; height: number }>;
export type LocalCompositeArtifactResolver = Readonly<{
  resolve(scope: Scope, artifactId: string): Promise<LocalCompositeResolvedArtifact>;
}>;
export type LocalCompositeV1ResultAuthority = Readonly<{
  submit(input: Readonly<{ ticket: LocalExecutionTicket; result: unknown }>): Promise<Readonly<{ artifactId: string }>>;
}>;
export type LocalCompositeV2ResultAuthority = Readonly<{
  submit(input: Readonly<{ ticket: LocalExecutionTicketV2; result: unknown }>): Promise<Readonly<{ artifactId: string }>>;
}>;
export type LocalCompositeInternalVerifier = Readonly<{
  verify(input: Readonly<{ executionId: string; scope: Scope; stepId: typeof LOCAL_COMPOSITE_CONTINUATION_STEPS.verify; artifactId: string }>): Promise<void>;
}>;

export type LocalCompositeStartCommand = Readonly<{
  clientRequestId: string;
  inputArtifactId: string;
  analysis: Readonly<Record<string, unknown>>;
  points: readonly Readonly<Record<string, unknown>>[];
}>;

export type LocalCompositeContinuationView = Readonly<{
  executionId: string;
  revision: number;
  state: WorkflowContinuationSnapshot['state'];
  nextAction?: Readonly<{ type: 'LOCAL_EXECUTION'; ticket: AnyLocalExecutionTicket }>;
  terminalArtifactId?: string;
  failureCode?: string;
}>;

export type LocalCompositeContinuationDependencies = Readonly<{
  continuations: WorkflowContinuationStore;
  tickets: TicketReader;
  v1Tickets: LocalExecutionTicketIssuerPort;
  v2Tickets: LocalExecutionTicketV2IssuerPort;
  artifacts: LocalCompositeArtifactResolver;
  segmentResults: LocalCompositeV1ResultAuthority;
  backgroundIsolationResults: LocalCompositeV2ResultAuthority;
  internalVerifier: LocalCompositeInternalVerifier;
}>;

/**
 * Internal Core sequencer for the first durable LOCAL_ONLY composite.
 * Browser input can provide selection parameters and a result payload, but never the next step.
 * This service grants no public HTTP authority by itself.
 */
export class LocalCompositeContinuationService {
  private readonly dependencies: LocalCompositeContinuationDependencies;

  constructor(dependencies: LocalCompositeContinuationDependencies) {
    this.dependencies = dependencies;
  }

  async start(commandInput: LocalCompositeStartCommand, scopeInput: Scope): Promise<LocalCompositeContinuationView> {
    const scope = normalizeScope(scopeInput);
    const command = normalizeStart(commandInput);
    const root = await this.dependencies.artifacts.resolve(scope, command.inputArtifactId);
    assertRoot(root);
    validateStartGeometry(command, root);
    const executionId = executionIdFor(scope, command.clientRequestId);
    const createInput = Object.freeze({
      executionId,
      clientRequestId: command.clientRequestId,
      scope,
      plan: planBinding(root, command),
      inputArtifacts: Object.freeze([workflowBinding(root)]),
    });

    const existing = await this.dependencies.continuations.getByClientRequestId(scope, command.clientRequestId);
    if (existing) {
      const reconciled = await this.dependencies.continuations.create(createInput);
      return this.advance(reconciled);
    }

    // Ticket-first ordering closes the crash window before continuation persistence.
    const segmentTicket = await this.issueSegmentTicket(executionId, scope, command, root);
    let snapshot = await this.dependencies.continuations.create(createInput);
    if (snapshot.state === 'READY' && snapshot.completedSteps.length === 0) {
      snapshot = await this.dependencies.continuations.waitForLocalResult({
        executionId,
        scope,
        expectedRevision: snapshot.revision,
        ticket: ticketBinding(segmentTicket),
      });
    }
    return this.advance(snapshot);
  }

  async resume(executionId: string, scopeInput: Scope): Promise<LocalCompositeContinuationView> {
    const scope = normalizeScope(scopeInput);
    const snapshot = await this.dependencies.continuations.get(requireToken(executionId, 'executionId'), scope);
    if (!snapshot) throw serviceError(404, 'local_composite_not_found', 'Local composite continuation was not found in authenticated scope');
    return this.advance(snapshot);
  }

  async submitLocalResult(executionIdInput: string, scopeInput: Scope, result: unknown): Promise<LocalCompositeContinuationView> {
    const scope = normalizeScope(scopeInput);
    const executionId = requireToken(executionIdInput, 'executionId');
    const ticketId = resultTicketId(result);
    let snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot) throw serviceError(404, 'local_composite_not_found', 'Local composite continuation was not found in authenticated scope');

    const completed = snapshot.completedSteps.find(step => step.ticketId === ticketId);
    if (completed) {
      const artifactId = await this.replayCompletedLocalStep(completed.stepId, ticketId, result);
      if (!completed.artifactIds.includes(artifactId)) throw serviceError(409, 'local_composite_replay_artifact_mismatch', 'Exact ticket replay resolved to a different canonical Artifact');
      return this.advance(snapshot);
    }

    if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || snapshot.outstandingLocal.ticketId !== ticketId) {
      throw serviceError(409, 'local_composite_result_not_outstanding', 'Submitted local result is not the Core-selected outstanding workflow step');
    }

    const stepId = snapshot.currentStepId;
    let artifactId: string;
    if (stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.segment) {
      const ticket = await this.requireV1Ticket(ticketId, snapshot);
      artifactId = (await this.dependencies.segmentResults.submit({ ticket, result })).artifactId;
      const mask = await this.dependencies.artifacts.resolve(scope, artifactId);
      assertMask(mask, snapshot.inputArtifacts[0]);
    } else if (stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation) {
      const ticket = await this.requireV2Ticket(ticketId, snapshot);
      artifactId = (await this.dependencies.backgroundIsolationResults.submit({ ticket, result })).artifactId;
      const composite = await this.dependencies.artifacts.resolve(scope, artifactId);
      const maskId = completedArtifactId(snapshot, LOCAL_COMPOSITE_CONTINUATION_STEPS.segment);
      assertComposite(composite, snapshot.inputArtifacts[0], maskId);
    } else {
      throw serviceError(409, 'local_composite_step_contract', 'Continuation is waiting for an unsupported local step');
    }

    snapshot = await this.dependencies.continuations.completeLocalStep({
      executionId,
      scope,
      expectedRevision: snapshot.revision,
      stepId,
      ticketId,
      artifactIds: Object.freeze([artifactId]),
    });
    return this.advance(snapshot);
  }

  private async advance(initial: WorkflowContinuationSnapshot): Promise<LocalCompositeContinuationView> {
    let snapshot = initial;
    for (let guard = 0; guard < 8; guard++) {
      if (snapshot.state === 'SUCCESS' || snapshot.state === 'FAILED' || snapshot.state === 'CANCELLED' || snapshot.state === 'UNKNOWN') return terminalView(snapshot);

      if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT') {
        if (!snapshot.outstandingLocal) throw serviceError(409, 'local_composite_ticket_binding_missing', 'Waiting continuation has no durable local ticket binding');
        const ticket = await this.requireTicketForStep(snapshot.currentStepId, snapshot.outstandingLocal.ticketId, snapshot);
        return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, nextAction: Object.freeze({ type: 'LOCAL_EXECUTION' as const, ticket }) });
      }

      if (snapshot.state === 'RUNNING_INTERNAL') {
        if (snapshot.currentStepId !== LOCAL_COMPOSITE_CONTINUATION_STEPS.verify) throw serviceError(409, 'local_composite_internal_step_contract', 'Unsupported internal continuation step');
        const artifactId = completedArtifactId(snapshot, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation);
        await this.dependencies.internalVerifier.verify({ executionId: snapshot.executionId, scope: snapshot.scope, stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.verify, artifactId });
        snapshot = await this.dependencies.continuations.completeInternalStep({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.verify, artifactIds: Object.freeze([artifactId]) });
        continue;
      }

      if (snapshot.state !== 'READY') throw serviceError(409, 'local_composite_state_contract', `Unsupported continuation state ${snapshot.state}`);
      const completedIds = snapshot.completedSteps.map(step => step.stepId);
      if (completedIds.length === 0) {
        const root = await this.resolveImmutableRoot(snapshot);
        const ticket = await this.dependencies.tickets.getByIdempotencyKey(snapshot.scope, segmentIdempotencyKey(snapshot.clientRequestId));
        if (!ticket) throw serviceError(409, 'local_composite_segment_ticket_missing', 'Ticket-first segment dispatch is missing from the durable local ledger');
        validateSegmentTicket(ticket, snapshot.executionId, snapshot.scope, root);
        snapshot = await this.dependencies.continuations.waitForLocalResult({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, ticket: ticketBinding(ticket) });
        continue;
      }
      if (sameSteps(completedIds, [LOCAL_COMPOSITE_CONTINUATION_STEPS.segment])) {
        const root = await this.resolveImmutableRoot(snapshot);
        const maskId = completedArtifactId(snapshot, LOCAL_COMPOSITE_CONTINUATION_STEPS.segment);
        const mask = await this.dependencies.artifacts.resolve(snapshot.scope, maskId);
        assertMask(mask, snapshot.inputArtifacts[0]);
        const ticket = await this.loadOrIssueBackgroundTicket(snapshot, root, mask);
        snapshot = await this.dependencies.continuations.waitForLocalResult({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, ticket: ticketBinding(ticket) });
        continue;
      }
      if (sameSteps(completedIds, [LOCAL_COMPOSITE_CONTINUATION_STEPS.segment, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation])) {
        snapshot = await this.dependencies.continuations.runInternalStep({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.verify });
        continue;
      }
      if (sameSteps(completedIds, [LOCAL_COMPOSITE_CONTINUATION_STEPS.segment, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation, LOCAL_COMPOSITE_CONTINUATION_STEPS.verify])) {
        const terminalArtifactId = completedArtifactId(snapshot, LOCAL_COMPOSITE_CONTINUATION_STEPS.verify);
        snapshot = await this.dependencies.continuations.succeed({ executionId: snapshot.executionId, scope: snapshot.scope, expectedRevision: snapshot.revision, terminalArtifactId });
        continue;
      }
      throw serviceError(409, 'local_composite_step_order', 'Durable continuation step order does not match the accepted local composite');
    }
    throw serviceError(500, 'local_composite_advance_guard', 'Local composite continuation exceeded the bounded server-side advance loop');
  }

  private async issueSegmentTicket(executionId: string, scope: Scope, command: ReturnType<typeof normalizeStart>, root: LocalCompositeResolvedArtifact): Promise<LocalExecutionTicket> {
    const issued = await this.dependencies.v1Tickets.issue({
      requestId: executionId,
      workflowId: executionId,
      stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment,
      operation: Object.freeze({
        id: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment,
        version: '1',
        type: 'segment',
        capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment,
        parameters: Object.freeze({ selectionRequestId: `${command.clientRequestId}:segment`, analysis: command.analysis, points: command.points }),
      }),
      scope,
      inputs: Object.freeze([{ artifactId: root.artifactId, kind: 'image', role: 'ORIGINAL', sha256: root.sha256 }]),
      expectedOutputs: Object.freeze([{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: Object.freeze(['application/octet-stream']), width: root.width, height: root.height }]),
      policy: 'LOCAL_ONLY',
      idempotencyKey: segmentIdempotencyKey(command.clientRequestId),
    });
    validateSegmentTicket(issued, executionId, scope, root);
    return issued;
  }

  private async loadOrIssueBackgroundTicket(snapshot: WorkflowContinuationSnapshot, root: LocalCompositeResolvedArtifact, mask: LocalCompositeResolvedArtifact): Promise<LocalExecutionTicketV2> {
    const key = backgroundIdempotencyKey(snapshot.clientRequestId);
    const existing = await this.dependencies.tickets.getByIdempotencyKeyV2(snapshot.scope, key);
    if (existing) {
      validateBackgroundTicket(existing, snapshot.executionId, snapshot.scope, root, mask);
      return existing;
    }
    const issued = await this.dependencies.v2Tickets.issue({
      ticketVersion: '2',
      requestId: snapshot.executionId,
      workflowId: snapshot.executionId,
      stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation,
      operation: Object.freeze({
        id: LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation,
        version: '1',
        type: 'BACKGROUND_ISOLATION',
        capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
        parameters: Object.freeze({ sourceArtifactId: root.artifactId, maskArtifactId: mask.artifactId, deterministicTool: 'background-isolation@1' }),
      }),
      scope: snapshot.scope,
      inputs: Object.freeze([
        { artifactId: root.artifactId, kind: 'image', role: 'ORIGINAL', sha256: root.sha256 },
        { artifactId: mask.artifactId, kind: 'mask', role: 'MASK', sha256: mask.sha256 },
      ]),
      expectedOutputs: Object.freeze([{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: root.width, height: root.height }]),
      policy: 'LOCAL_ONLY',
      idempotencyKey: key,
    });
    validateBackgroundTicket(issued, snapshot.executionId, snapshot.scope, root, mask);
    return issued;
  }

  private async replayCompletedLocalStep(stepId: string, ticketId: string, result: unknown): Promise<string> {
    if (stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.segment) {
      const ticket = await this.dependencies.tickets.get(ticketId);
      if (!ticket) throw serviceError(409, 'local_composite_replay_ticket_missing', 'Completed segment ticket is missing from the durable local ledger');
      return (await this.dependencies.segmentResults.submit({ ticket, result })).artifactId;
    }
    if (stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation) {
      const ticket = await this.dependencies.tickets.getV2(ticketId);
      if (!ticket) throw serviceError(409, 'local_composite_replay_ticket_missing', 'Completed background-isolation ticket is missing from the durable local ledger');
      return (await this.dependencies.backgroundIsolationResults.submit({ ticket, result })).artifactId;
    }
    throw serviceError(409, 'local_composite_replay_step', 'Only completed local steps accept local result replay');
  }

  private requireTicketForStep(stepId: string | undefined, ticketId: string, snapshot: WorkflowContinuationSnapshot): Promise<AnyLocalExecutionTicket> {
    if (stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.segment) return this.requireV1Ticket(ticketId, snapshot);
    if (stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation) return this.requireV2Ticket(ticketId, snapshot);
    return Promise.reject(serviceError(409, 'local_composite_ticket_step', 'Outstanding ticket is bound to an unsupported workflow step'));
  }

  private async requireV1Ticket(ticketId: string, snapshot: WorkflowContinuationSnapshot): Promise<LocalExecutionTicket> {
    const ticket = await this.dependencies.tickets.get(ticketId);
    if (!ticket) throw serviceError(409, 'local_composite_ticket_missing', 'Durable segment ticket is unavailable');
    const root = await this.resolveImmutableRoot(snapshot);
    validateSegmentTicket(ticket, snapshot.executionId, snapshot.scope, root);
    return ticket;
  }

  private async requireV2Ticket(ticketId: string, snapshot: WorkflowContinuationSnapshot): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.tickets.getV2(ticketId);
    if (!ticket) throw serviceError(409, 'local_composite_ticket_missing', 'Durable background-isolation ticket is unavailable');
    const root = await this.resolveImmutableRoot(snapshot);
    const maskId = completedArtifactId(snapshot, LOCAL_COMPOSITE_CONTINUATION_STEPS.segment);
    const mask = await this.dependencies.artifacts.resolve(snapshot.scope, maskId);
    assertMask(mask, snapshot.inputArtifacts[0]);
    validateBackgroundTicket(ticket, snapshot.executionId, snapshot.scope, root, mask);
    return ticket;
  }

  private async resolveImmutableRoot(snapshot: WorkflowContinuationSnapshot): Promise<LocalCompositeResolvedArtifact> {
    if (snapshot.inputArtifacts.length !== 1) throw serviceError(409, 'local_composite_root_binding', 'Local composite continuation must have exactly one immutable root binding');
    const binding = snapshot.inputArtifacts[0];
    const root = await this.dependencies.artifacts.resolve(snapshot.scope, binding.artifactId);
    assertRoot(root);
    assertSameArtifactBinding(root, binding, 'local_composite_root_binding', 'Durable ORIGINAL no longer matches the immutable continuation root binding');
    return root;
  }
}

function planBinding(root: LocalCompositeResolvedArtifact, command: ReturnType<typeof normalizeStart>): WorkflowPlanBinding {
  const authority = Object.freeze({
    intent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
    revision: LOCAL_COMPOSITE_CONTINUATION_PLAN_REVISION,
    steps: Object.freeze([
      Object.freeze({ id: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment, capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment }),
      Object.freeze({ id: LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation, capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation }),
      Object.freeze({ id: LOCAL_COMPOSITE_CONTINUATION_STEPS.verify, capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify }),
    ]),
    root: workflowBinding(root),
    selection: Object.freeze({ analysis: command.analysis, points: command.points }),
  });
  return Object.freeze({ planId: PLAN_ID, planRevision: LOCAL_COMPOSITE_CONTINUATION_PLAN_REVISION, planDigest: createHash('sha256').update(PLAN_DIGEST_DOMAIN).update(canonicalJson(authority)).digest('hex') });
}

function executionIdFor(scope: Scope, clientRequestId: string): string {
  return `local-composite-${createHash('sha256').update(EXECUTION_ID_DOMAIN).update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function segmentIdempotencyKey(clientRequestId: string): string { return `c5b:${clientRequestId}:${LOCAL_COMPOSITE_CONTINUATION_STEPS.segment}:v1`; }
function backgroundIdempotencyKey(clientRequestId: string): string { return `c5b:${clientRequestId}:${LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation}:v2`; }
function ticketBinding(ticket: AnyLocalExecutionTicket) { return Object.freeze({ stepId: ticket.stepId, ticketId: ticket.ticketId, ticketVersion: ticket.version, nonce: ticket.nonce, expiresAt: new Date(ticket.expiresAt).toISOString() }); }
function workflowBinding(artifact: LocalCompositeResolvedArtifact): WorkflowInputArtifactBinding { return Object.freeze({ artifactId: artifact.artifactId, kind: artifact.kind, role: artifact.role, sha256: artifact.sha256.toLowerCase(), parentArtifactIds: Object.freeze([...artifact.parentArtifactIds].sort()) }); }

function validateSegmentTicket(ticket: LocalExecutionTicket, executionId: string, scope: Scope, root: LocalCompositeResolvedArtifact): void {
  if (ticket.workflowId !== executionId || ticket.requestId !== executionId || ticket.stepId !== LOCAL_COMPOSITE_CONTINUATION_STEPS.segment || ticket.operation.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.segment || ticket.operation.type !== 'segment' || ticket.operation.capability !== LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment || ticket.policy !== 'LOCAL_ONLY' || !sameScope(ticket.scope, scope) || ticket.cost.providerCalls !== 0 || ticket.cost.paidCloudCredits !== 0) throw serviceError(409, 'local_composite_segment_ticket_contract', 'Segment ticket does not match the durable local composite authority');
  if (ticket.inputs.length !== 1 || ticket.inputs[0].artifactId !== root.artifactId || ticket.inputs[0].kind !== 'image' || ticket.inputs[0].role !== 'ORIGINAL' || ticket.inputs[0].sha256?.toLowerCase() !== root.sha256.toLowerCase()) throw serviceError(409, 'local_composite_segment_input_contract', 'Segment ticket input does not match the immutable root Artifact');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'mask' || output.role !== 'MASK' || output.count !== 1 || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'application/octet-stream' || output.width !== root.width || output.height !== root.height) throw serviceError(409, 'local_composite_segment_output_contract', 'Segment ticket output does not match the immutable root geometry');
}
function validateBackgroundTicket(ticket: LocalExecutionTicketV2, executionId: string, scope: Scope, root: LocalCompositeResolvedArtifact, mask: LocalCompositeResolvedArtifact): void {
  if (ticket.workflowId !== executionId || ticket.requestId !== executionId || ticket.stepId !== LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation || ticket.operation.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation || ticket.operation.type !== 'BACKGROUND_ISOLATION' || ticket.operation.capability !== LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation || ticket.policy !== 'LOCAL_ONLY' || !sameScope(ticket.scope, scope) || ticket.cost.providerCalls !== 0 || ticket.cost.paidCloudCredits !== 0) throw serviceError(409, 'local_composite_background_ticket_contract', 'Background-isolation ticket does not match the durable local composite authority');
  const sourceBinding = ticket.inputs.find(value => value.artifactId === root.artifactId);
  const maskBinding = ticket.inputs.find(value => value.artifactId === mask.artifactId);
  if (ticket.inputs.length !== 2 || !sourceBinding || !maskBinding || sourceBinding.kind !== 'image' || sourceBinding.role !== 'ORIGINAL' || sourceBinding.sha256?.toLowerCase() !== root.sha256.toLowerCase() || maskBinding.kind !== 'mask' || maskBinding.role !== 'MASK' || maskBinding.sha256?.toLowerCase() !== mask.sha256.toLowerCase()) throw serviceError(409, 'local_composite_background_input_contract', 'Background-isolation ticket inputs do not exactly match canonical IMAGE + MASK bindings');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.count !== 1 || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || output.width !== root.width || output.height !== root.height) throw serviceError(409, 'local_composite_background_output_contract', 'Background-isolation ticket output does not match canonical source geometry');
}
function assertRoot(root: LocalCompositeResolvedArtifact): void { assertArtifact(root); if (root.kind !== 'image' || root.role !== 'ORIGINAL' || root.parentArtifactIds.length !== 0) throw serviceError(422, 'local_composite_root_contract', 'First local composite requires one canonical parentless ORIGINAL IMAGE'); }
function assertMask(mask: LocalCompositeResolvedArtifact, root: WorkflowInputArtifactBinding): void { assertArtifact(mask); if (mask.kind !== 'mask' || mask.role !== 'MASK' || mask.parentArtifactIds.length !== 1 || mask.parentArtifactIds[0] !== root.artifactId) throw serviceError(409, 'local_composite_mask_lineage', 'Segment result is not a canonical MASK with exact immutable root IMAGE lineage'); }
function assertComposite(composite: LocalCompositeResolvedArtifact, root: WorkflowInputArtifactBinding, maskArtifactId: string): void { assertArtifact(composite); const parents = [...composite.parentArtifactIds].sort(); const expected = [root.artifactId, maskArtifactId].sort(); if (composite.kind !== 'image' || composite.role !== 'COMPOSITE' || parents.length !== 2 || parents[0] !== expected[0] || parents[1] !== expected[1]) throw serviceError(409, 'local_composite_image_lineage', 'Background isolation result is not a canonical COMPOSITE with exact IMAGE + MASK lineage'); }
function assertSameArtifactBinding(actual: LocalCompositeResolvedArtifact, expected: WorkflowInputArtifactBinding, code: string, message: string): void { const actualParents = [...actual.parentArtifactIds].sort(); const expectedParents = [...expected.parentArtifactIds].sort(); if (actual.artifactId !== expected.artifactId || actual.kind !== expected.kind || actual.role !== expected.role || actual.sha256.toLowerCase() !== expected.sha256.toLowerCase() || actualParents.length !== expectedParents.length || actualParents.some((value, index) => value !== expectedParents[index])) throw serviceError(409, code, message); }
function assertArtifact(value: LocalCompositeResolvedArtifact): void { if (!value.artifactId || !value.kind || !value.role || !SHA256.test(value.sha256) || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || !Array.isArray(value.parentArtifactIds)) throw serviceError(409, 'local_composite_artifact_contract', 'Canonical Artifact binding is incomplete'); }
function completedArtifactId(snapshot: WorkflowContinuationSnapshot, stepId: string): string { const completed = snapshot.completedSteps.find(step => step.stepId === stepId); if (!completed || completed.artifactIds.length !== 1) throw serviceError(409, 'local_composite_completed_artifact', `Workflow step ${stepId} does not have exactly one canonical Artifact`); return completed.artifactIds[0]; }
function sameSteps(actual: readonly string[], expected: readonly string[]): boolean { return actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function sameScope(a: Scope, b: Scope): boolean { return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId; }
function terminalView(snapshot: WorkflowContinuationSnapshot): LocalCompositeContinuationView { return Object.freeze({ executionId: snapshot.executionId, revision: snapshot.revision, state: snapshot.state, terminalArtifactId: snapshot.terminalArtifactId, failureCode: snapshot.failureCode }); }
function resultTicketId(result: unknown): string { if (!result || typeof result !== 'object' || Array.isArray(result)) throw serviceError(400, 'local_composite_result_shape', 'Local result payload must be an object'); return requireToken((result as Record<string, unknown>).ticketId, 'result.ticketId'); }
function normalizeStart(command: LocalCompositeStartCommand) {
  const clientRequestId = requireToken(command?.clientRequestId, 'clientRequestId');
  const inputArtifactId = requireToken(command?.inputArtifactId, 'inputArtifactId');
  try {
    const selection = normalizeLocalSegmentationSelection(command?.analysis, command?.points);
    return Object.freeze({ clientRequestId, inputArtifactId, analysis: deepFreeze(structuredClone(selection.analysis)), points: deepFreeze(structuredClone(selection.points)) });
  } catch (error) {
    if (error instanceof LocalSegmentationContractError) {
      const code = error.reason === 'POINTS_INVALID' ? 'local_composite_points_required' : 'local_composite_analysis_required';
      throw serviceError(400, code, error.message);
    }
    throw error;
  }
}
function validateStartGeometry(command: ReturnType<typeof normalizeStart>, root: LocalCompositeResolvedArtifact): void {
  try { validateLocalSegmentationGeometry(command.analysis, command.points, root.width, root.height); }
  catch (error) {
    if (error instanceof LocalSegmentationContractError) throw serviceError(400, error.reason === 'POINT_OUT_OF_BOUNDS' ? 'local_composite_point_out_of_bounds' : error.reason === 'SOURCE_MISMATCH' ? 'local_composite_source_mismatch' : 'local_composite_analysis_required', error.message);
    throw error;
  }
}
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
function requireToken(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw serviceError(400, 'local_composite_invalid_request', `${field} is required`); return value.trim(); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }

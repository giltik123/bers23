import type { CreativeArtifact, LocalExecutionTicket, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/index.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import {
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from '../localExecution/LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedger, LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import { LOCAL_COMPOSITE_CONTINUATION_STEPS } from './LocalCompositeContinuationService.ts';
import type { WorkflowContinuationSnapshot, WorkflowContinuationStore, WorkflowInputArtifactBinding } from './WorkflowContinuationStore.ts';

const SEGMENT_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.segment;
const BACKGROUND_STEP = LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation;
const SHA256 = /^[a-f0-9]{64}$/i;

type ScopedProject = AuthenticatedScope & Readonly<{ projectId: string }>;
type TicketReader = Pick<LocalExecutionLedger, 'get'> & Pick<LocalExecutionLedgerV2, 'getV2'>;
type ContinuationReader = Pick<WorkflowContinuationStore, 'get'>;

export type LocalCompositeSegmentInputDelivery = Readonly<{
  step: 'SEGMENT';
  executionId: string;
  ticketId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  width: number;
  height: number;
  sourceRgba: Uint8Array;
}>;

export type LocalCompositeBackgroundInputDelivery = Readonly<{
  step: 'BACKGROUND_ISOLATION';
  executionId: string;
  ticketId: string;
  sourceArtifactId: string;
  maskArtifactId: string;
  sourceSha256: string;
  maskSha256: string;
  width: number;
  height: number;
  sourceRgba: Uint8Array;
  maskAlpha: Uint8Array;
}>;

export type LocalCompositeInputDelivery = LocalCompositeSegmentInputDelivery | LocalCompositeBackgroundInputDelivery;

export type LocalCompositeInputDeliveryDependencies = Readonly<{
  continuations: ContinuationReader;
  tickets: TicketReader;
  ownsArtifacts: (scope: ScopedProject, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: ScopedProject, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  now?: () => number;
}>;

/**
 * Read-only byte delivery for the exact outstanding local step of one durable composite.
 * The caller selects only the workflow execution identity. Core resolves the durable
 * outstanding ticket and step; the browser never supplies ticket/capability/model authority.
 */
export class LocalCompositeInputDeliveryService {
  readonly #now: () => number;
  private readonly dependencies: LocalCompositeInputDeliveryDependencies;

  constructor(dependencies: LocalCompositeInputDeliveryDependencies) {
    this.dependencies = dependencies;
    this.#now = dependencies.now ?? Date.now;
  }

  async deliver(executionIdInput: string, scope: ScopedProject): Promise<LocalCompositeInputDelivery> {
    const executionId = requireToken(executionIdInput, 'executionId');
    const snapshot = await this.dependencies.continuations.get(executionId, scope);
    if (!snapshot) throw serviceError(404, 'local_composite_not_found', 'Local composite continuation was not found in authenticated scope');
    const binding = requireOutstanding(snapshot);
    const root = requireImmutableRoot(snapshot);

    if (binding.stepId === SEGMENT_STEP && binding.ticketVersion === '1') {
      const ticket = await this.dependencies.tickets.get(binding.ticketId);
      if (!ticket) throw serviceError(409, 'local_composite_input_ticket_missing', 'Durable segment ticket is unavailable');
      assertTicketBinding(snapshot, ticket, this.#now());
      assertSegmentTicket(ticket, root);
      return this.deliverSegment(snapshot, ticket, root);
    }

    if (binding.stepId === BACKGROUND_STEP && binding.ticketVersion === '2') {
      const ticket = await this.dependencies.tickets.getV2(binding.ticketId);
      if (!ticket) throw serviceError(409, 'local_composite_input_ticket_missing', 'Durable background-isolation ticket is unavailable');
      assertTicketBinding(snapshot, ticket, this.#now());
      const maskArtifactId = requireCompletedSegmentMask(snapshot);
      assertBackgroundTicket(ticket, root, maskArtifactId);
      return this.deliverBackground(snapshot, ticket, root, maskArtifactId);
    }

    throw serviceError(409, 'local_composite_input_step_contract', 'Durable composite is waiting for an unsupported local input contract');
  }

  private async deliverSegment(snapshot: WorkflowContinuationSnapshot, ticket: LocalExecutionTicket, root: WorkflowInputArtifactBinding): Promise<LocalCompositeSegmentInputDelivery> {
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) {
      throw serviceError(409, 'local_composite_input_lineage_unavailable', 'Composite segmentation source is no longer available');
    }
    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, []); }
    catch { throw serviceError(409, 'local_composite_input_lineage_unavailable', 'Composite segmentation source hydration failed'); }
    assertInputAdmission(ticket, artifacts);
    const source = artifacts.find(candidate => candidate.id === sourceBinding.artifactId && candidate.kind === 'image');
    const value = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    const width = Number(value?.width); const height = Number(value?.height);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !(value?.data instanceof Uint8ClampedArray) || value.data.length !== width * height * 4) {
      throw serviceError(409, 'canonical_source_pixels_unavailable', 'Composite segmentation source RGBA pixels are unavailable');
    }
    assertOutputGeometry(ticket, width, height, 'mask', 'MASK', 'application/octet-stream', 'Composite segmentation output contract does not match the canonical source');
    return Object.freeze({
      step: 'SEGMENT',
      executionId: snapshot.executionId,
      ticketId: ticket.ticketId,
      sourceArtifactId: root.artifactId,
      sourceSha256: root.sha256.toLowerCase(),
      width,
      height,
      sourceRgba: Uint8Array.from(value.data),
    });
  }

  private async deliverBackground(
    snapshot: WorkflowContinuationSnapshot,
    ticket: LocalExecutionTicketV2,
    root: WorkflowInputArtifactBinding,
    maskArtifactId: string,
  ): Promise<LocalCompositeBackgroundInputDelivery> {
    const sourceBinding = ticket.inputs.find(binding => binding.artifactId === root.artifactId)!;
    const maskBinding = ticket.inputs.find(binding => binding.artifactId === maskArtifactId)!;
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId, maskBinding.artifactId])) {
      throw serviceError(409, 'local_composite_input_lineage_unavailable', 'Composite background-isolation inputs are no longer available');
    }
    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, [maskBinding.artifactId]); }
    catch { throw serviceError(409, 'local_composite_input_lineage_unavailable', 'Composite background-isolation input hydration failed'); }
    assertInputAdmission(ticket, artifacts);
    const source = artifacts.find(candidate => candidate.id === sourceBinding.artifactId && candidate.kind === 'image');
    const mask = artifacts.find(candidate => candidate.id === maskBinding.artifactId && candidate.kind === 'mask');
    const sourceValue = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    const maskValue = mask?.value as Readonly<{ width?: unknown; height?: unknown; alpha?: unknown }> | undefined;
    const width = Number(sourceValue?.width); const height = Number(sourceValue?.height);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !(sourceValue?.data instanceof Uint8ClampedArray) || sourceValue.data.length !== width * height * 4) {
      throw serviceError(409, 'canonical_source_pixels_unavailable', 'Composite background-isolation source RGBA pixels are unavailable');
    }
    if (!(maskValue?.alpha instanceof Uint8Array) || Number(maskValue.width) !== width || Number(maskValue.height) !== height || maskValue.alpha.length !== width * height) {
      throw serviceError(409, 'canonical_mask_pixels_unavailable', 'Composite background-isolation MASK alpha pixels are unavailable');
    }
    assertOutputGeometry(ticket, width, height, 'image', 'COMPOSITE', 'image/png', 'Composite background-isolation output contract does not match the canonical source');
    return Object.freeze({
      step: 'BACKGROUND_ISOLATION',
      executionId: snapshot.executionId,
      ticketId: ticket.ticketId,
      sourceArtifactId: root.artifactId,
      maskArtifactId,
      sourceSha256: root.sha256.toLowerCase(),
      maskSha256: maskBinding.sha256!.toLowerCase(),
      width,
      height,
      sourceRgba: Uint8Array.from(sourceValue.data),
      maskAlpha: Uint8Array.from(maskValue.alpha),
    });
  }
}

function requireOutstanding(snapshot: WorkflowContinuationSnapshot) {
  if (snapshot.state !== 'WAITING_FOR_LOCAL_RESULT' || !snapshot.outstandingLocal || snapshot.currentStepId !== snapshot.outstandingLocal.stepId) {
    throw serviceError(409, 'local_composite_input_not_outstanding', 'Composite input bytes are available only for the exact outstanding local step');
  }
  return snapshot.outstandingLocal;
}

function requireImmutableRoot(snapshot: WorkflowContinuationSnapshot): WorkflowInputArtifactBinding {
  const root = snapshot.inputArtifacts[0];
  if (
    snapshot.inputArtifacts.length !== 1
    || !root
    || root.kind !== 'image'
    || root.role !== 'ORIGINAL'
    || !SHA256.test(root.sha256)
    || root.parentArtifactIds.length !== 0
  ) throw serviceError(409, 'local_composite_input_root_contract', 'Durable composite input root is not one parentless hash-bound ORIGINAL IMAGE');
  return root;
}

function requireCompletedSegmentMask(snapshot: WorkflowContinuationSnapshot): string {
  const completed = snapshot.completedSteps.find(step => step.stepId === SEGMENT_STEP);
  if (!completed || completed.artifactIds.length !== 1 || !completed.artifactIds[0]) {
    throw serviceError(409, 'local_composite_input_mask_binding', 'Background-isolation recovery requires exactly one completed SEGMENT MASK Artifact');
  }
  return completed.artifactIds[0];
}

function assertTicketBinding(snapshot: WorkflowContinuationSnapshot, ticket: LocalExecutionTicket | LocalExecutionTicketV2, now: number): void {
  const binding = snapshot.outstandingLocal!;
  if (
    ticket.ticketId !== binding.ticketId
    || ticket.version !== binding.ticketVersion
    || ticket.stepId !== binding.stepId
    || ticket.nonce !== binding.nonce
    || new Date(ticket.expiresAt).toISOString() !== binding.expiresAt
    || ticket.requestId !== snapshot.executionId
    || ticket.workflowId !== snapshot.executionId
    || ticket.scope.tenantId !== snapshot.scope.tenantId
    || ticket.scope.userId !== snapshot.scope.userId
    || ticket.scope.projectId !== snapshot.scope.projectId
  ) throw serviceError(409, 'local_composite_input_ticket_binding_mismatch', 'Durable workflow ticket binding no longer matches local execution authority');
  if (now >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Durable composite local ticket has expired');
}

function assertSegmentTicket(ticket: LocalExecutionTicket, root: WorkflowInputArtifactBinding): void {
  if (
    ticket.version !== '1'
    || ticket.issuer !== 'CORE'
    || ticket.policy !== 'LOCAL_ONLY'
    || ticket.stepId !== SEGMENT_STEP
    || ticket.operation.id !== SEGMENT_STEP
    || ticket.operation.type !== 'segment'
    || ticket.operation.capability !== LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment
    || ticket.cost.providerCalls !== 0
    || ticket.cost.paidCloudCredits !== 0
  ) throw serviceError(409, 'local_composite_input_capability_mismatch', 'Ticket is not the admitted zero-cloud composite segmentation contract');
  const source = ticket.inputs[0];
  if (
    ticket.inputs.length !== 1
    || source?.artifactId !== root.artifactId
    || source.kind !== 'image'
    || source.role !== 'ORIGINAL'
    || source.sha256?.toLowerCase() !== root.sha256.toLowerCase()
  ) throw serviceError(409, 'local_composite_input_root_mismatch', 'Composite segmentation ticket source does not match the immutable workflow root');
}

function assertBackgroundTicket(ticket: LocalExecutionTicketV2, root: WorkflowInputArtifactBinding, maskArtifactId: string): void {
  if (
    ticket.version !== '2'
    || ticket.issuer !== 'CORE'
    || ticket.policy !== 'LOCAL_ONLY'
    || ticket.stepId !== BACKGROUND_STEP
    || ticket.operation.id !== BACKGROUND_STEP
    || ticket.operation.type !== 'BACKGROUND_ISOLATION'
    || ticket.operation.capability !== LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation
    || ticket.allowedExecutors.length !== 1
    || ticket.cost.providerCalls !== 0
    || ticket.cost.paidCloudCredits !== 0
  ) throw serviceError(409, 'local_composite_input_capability_mismatch', 'Ticket is not the admitted zero-cloud composite background-isolation contract');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) {
    throw serviceError(409, 'local_composite_input_executor_mismatch', 'Composite background isolation ticket has an invalid deterministic executor binding');
  }
  const source = ticket.inputs.find(binding => binding.artifactId === root.artifactId);
  const mask = ticket.inputs.find(binding => binding.artifactId === maskArtifactId);
  if (
    ticket.inputs.length !== 2
    || !source
    || !mask
    || source.kind !== 'image'
    || source.role !== 'ORIGINAL'
    || source.sha256?.toLowerCase() !== root.sha256.toLowerCase()
    || mask.kind !== 'mask'
    || mask.role !== 'MASK'
    || !mask.sha256
  ) throw serviceError(409, 'local_composite_input_lineage_mismatch', 'Composite background-isolation ticket does not match immutable root + completed SEGMENT MASK lineage');
}

function assertOutputGeometry(
  ticket: LocalExecutionTicket | LocalExecutionTicketV2,
  width: number,
  height: number,
  kind: 'mask' | 'image',
  role: 'MASK' | 'COMPOSITE',
  mimeType: string,
  message: string,
): void {
  const output = ticket.expectedOutputs[0];
  if (
    ticket.expectedOutputs.length !== 1
    || !output
    || output.kind !== kind
    || output.role !== role
    || output.count !== 1
    || output.width !== width
    || output.height !== height
    || output.mimeTypes?.length !== 1
    || output.mimeTypes[0] !== mimeType
  ) throw serviceError(409, 'local_composite_output_contract_mismatch', message);
}

function assertInputAdmission(ticket: LocalExecutionTicket | LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): void {
  const decision = admitLocalExecutionInputs(ticket, artifacts);
  if (!decision.allowed) throw serviceError(409, `local_composite_input_${decision.reasonCode.toLowerCase()}`, `Canonical composite input admission failed: ${decision.reasonCode}`);
}

function requireToken(value: unknown, label: string): string {
  if (typeof value !== 'string') throw serviceError(400, 'local_composite_input_request_invalid', `${label} is required`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw serviceError(400, 'local_composite_input_request_invalid', `${label} is invalid`);
  return normalized;
}

function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}

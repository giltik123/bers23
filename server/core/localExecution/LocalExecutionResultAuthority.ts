import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type {
  CreativeArtifact,
  LocalExecutionOutputEvidence,
  LocalExecutionResult,
  LocalExecutionResultV2,
  LocalExecutionTicket,
  LocalExecutionTicketV2,
  ProductionOutcome,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
  isolateBackgroundRgba,
} from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedger, LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { LocalExecutionUpload } from './PostgresLocalExecutionUploadStore.ts';

type ScopeArtifactAccess = Readonly<{
  ownsArtifacts: (scope: Scope, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: Scope, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
}>;

type UploadReader = Readonly<{
  load(uploadId: string, ticketId: string, scope: Scope, now: number): Promise<LocalExecutionUpload | undefined>;
  consume(uploadId: string, ticketId: string, scope: Scope, now: number): Promise<boolean>;
}>;

type ExactLocalContract = Readonly<{ capability: string; stepId: string }>;

type SegmentationDependencies = ScopeArtifactAccess & Readonly<{
  admission: LocalExecutionLedger;
  uploads: UploadReader;
  persistMask: (ticketId: string, scope: Scope, width: number, height: number, alpha: Uint8Array, sourceArtifactId?: string) => Promise<Readonly<{ storageId: string }>>;
  loadPersistedMask: (ticketId: string, scope: Scope) => Promise<Readonly<{ storageId: string }> | undefined>;
  issueMaskId: (storageId: string, scope: Scope) => string;
  now?: () => number;
}>;

type BackgroundIsolationArtifactLineage = Readonly<{
  sourceArtifactId: string;
  maskArtifactId: string;
  producerOperation: 'BACKGROUND_ISOLATION';
}>;

type DeterministicDependencies = ScopeArtifactAccess & Readonly<{
  admission: LocalExecutionLedgerV2;
  uploads: UploadReader;
  persistFinal: (scope: Scope, executionId: string, operationId: string, image: PixelImage, lineage?: BackgroundIsolationArtifactLineage) => Promise<Readonly<{ storageId: string; width: number; height: number }>>;
  loadPersistedFinal: (executionId: string, scope: Scope) => Promise<Readonly<{ storageId: string; width: number; height: number }> | undefined>;
  issueFinalId: (storageId: string, scope: Scope) => string;
  now?: () => number;
}>;

export type LocalResultAuthoritySubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type SegmentationVerificationPort = (input: Readonly<{
  ticket: LocalExecutionTicket;
  result: LocalExecutionResult;
  artifact: CreativeArtifact;
}>) => Promise<ProductionOutcome>;

export type DeterministicVerificationPort = (input: Readonly<{
  ticket: LocalExecutionTicketV2;
  result: LocalExecutionResultV2;
  artifact: CreativeArtifact;
}>) => Promise<ProductionOutcome>;

/**
 * Shared accepted MASK-result authority. The contract is exact per instance so
 * standalone and composite callers share one path without generic capability fallback.
 */
export class SegmentationResultAuthority {
  private readonly dependencies: SegmentationDependencies;
  private readonly contract: ExactLocalContract;
  private readonly now: () => number;

  constructor(dependencies: SegmentationDependencies, contract: ExactLocalContract) {
    this.dependencies = dependencies;
    this.contract = requireContract(contract);
    this.now = dependencies.now ?? Date.now;
  }

  async submit(input: Readonly<{ ticket: LocalExecutionTicket; result: unknown; verify: SegmentationVerificationPort }>): Promise<LocalResultAuthoritySubmission> {
    const ticket = input.ticket;
    this.assertTicket(ticket);
    const claim = await this.dependencies.admission.claim({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      throw admissionError(claim.reasonCode);
    }

    try {
      const artifacts = await this.revalidateCanonicalInputs(ticket);
      void artifacts;
      const result = claim.result;
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Local segmentation requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await loadExactEvidence(this.dependencies.uploads, ticket, evidence, this.now());
      if (upload.kind !== 'mask' || upload.role !== 'MASK' || !upload.width || !upload.height) throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined output is not a canonical MASK candidate');

      const stored = await this.dependencies.persistMask(ticket.ticketId, ticket.scope, upload.width, upload.height, upload.bytes, ticket.inputs[0].artifactId);
      const artifactId = this.dependencies.issueMaskId(stored.storageId, ticket.scope);
      const artifact: CreativeArtifact = Object.freeze({
        id: artifactId,
        kind: 'mask',
        value: Object.freeze({ width: upload.width, height: upload.height, alpha: Uint8Array.from(upload.bytes), source: 'SEGMENTATION', coordinateSpace: 'ORIGINAL' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'AVAILABLE',
        role: 'MASK',
        image: Object.freeze({ width: upload.width, height: upload.height, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true }),
        metadata: Object.freeze({
          artifactRole: 'MASK',
          localExecutionAdmission: 'ADMITTED',
          ticketId: ticket.ticketId,
          modelId: result.model.modelId,
          modelVersion: result.model.version,
          runtime: result.runtime,
          accelerator: result.accelerator,
          sha256: upload.sha256,
          parentArtifactIds: Object.freeze(ticket.inputs.map(binding => binding.artifactId)),
        }),
      });

      const outcome = await input.verify({ ticket, result, artifact });
      if (outcome.status === 'UNKNOWN') throw serviceError(409, 'local_execution_outcome_unknown', 'Local execution finalization outcome is unknown and cannot be consumed');
      if (outcome.status === 'SUCCESS' && !outcome.artifacts.some(candidate => candidate.id === artifactId)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Completed canonical local execution is bound to a different artifact');

      await this.dependencies.admission.commit(ticket.ticketId, outcome.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED');
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.now());
      return Object.freeze({ executionId: ticket.workflowId, status: outcome.status, artifactId: outcome.status === 'SUCCESS' ? artifactId : undefined, outcome });
    } catch (error) {
      await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw error;
    }
  }

  private assertTicket(ticket: LocalExecutionTicket): void {
    if (ticket.version !== '1' || ticket.operation.capability !== this.contract.capability || ticket.operation.type !== 'segment' || ticket.operation.id !== this.contract.stepId || ticket.stepId !== this.contract.stepId || ticket.policy !== 'LOCAL_ONLY') {
      throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not the exact accepted segmentation result contract');
    }
  }

  private async revalidateCanonicalInputs(ticket: LocalExecutionTicket): Promise<readonly CreativeArtifact[]> {
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Local segmentation requires one SHA-bound canonical IMAGE input');
    const ids = ticket.inputs.map(binding => binding.artifactId);
    if (!await this.dependencies.ownsArtifacts(ticket.scope, ids)) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local execution input is no longer authorized or available');
    const artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, ticket.inputs[0].artifactId, []);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
    return artifacts;
  }

  private async replayFinalized(ticket: LocalExecutionTicket): Promise<LocalResultAuthoritySubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw serviceError(409, 'local_finalization_unknown', 'Local execution was consumed without a recoverable terminal status');
    if (finalization.status === 'FAILED') return failedReplay(ticket.workflowId);
    const stored = await this.dependencies.loadPersistedMask(ticket.ticketId, ticket.scope);
    if (!stored) throw serviceError(409, 'local_finalization_artifact_unavailable', 'Committed local execution MASK is unavailable');
    const artifactId = this.dependencies.issueMaskId(stored.storageId, ticket.scope);
    return successReplay(ticket.workflowId, artifactId);
  }
}

/**
 * Shared accepted deterministic Background Isolation result authority. It owns
 * quarantine evidence verification and byte-exact Core recomputation before persistence.
 */
export class BackgroundIsolationResultAuthority {
  private readonly dependencies: DeterministicDependencies;
  private readonly contract: ExactLocalContract;
  private readonly now: () => number;

  constructor(dependencies: DeterministicDependencies, contract: ExactLocalContract) {
    this.dependencies = dependencies;
    this.contract = requireContract(contract);
    this.now = dependencies.now ?? Date.now;
  }

  async submit(input: Readonly<{ ticket: LocalExecutionTicketV2; result: unknown; verify: DeterministicVerificationPort }>): Promise<LocalResultAuthoritySubmission> {
    const ticket = input.ticket;
    this.assertTicket(ticket);
    const claim = await this.dependencies.admission.claimV2({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      throw admissionError(claim.reasonCode);
    }

    try {
      const artifacts = await this.revalidateCanonicalInputs(ticket);
      const result = claim.result;
      if (result.executor.kind !== 'DETERMINISTIC_TOOL' || result.executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || result.executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) throw serviceError(400, 'local_executor_mismatch', 'Result is not the authorized deterministic executor');
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Background isolation requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await loadExactEvidence(this.dependencies.uploads, ticket, evidence, this.now());
      if (upload.kind !== 'image' || upload.role !== 'COMPOSITE' || upload.mimeType !== 'image/png') throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined output is not a deterministic PNG COMPOSITE candidate');

      const source = requireSource(artifacts, ticket);
      const mask = requireMask(artifacts, ticket);
      const sourcePixels = source.value as Readonly<{ width: number; height: number; data: Uint8ClampedArray }>;
      const maskPixels = mask.value as Readonly<{ width: number; height: number; alpha: Uint8Array }>;
      const candidate = await decodePngRgba(upload.bytes);
      if (candidate.width !== sourcePixels.width || candidate.height !== sourcePixels.height || maskPixels.width !== sourcePixels.width || maskPixels.height !== sourcePixels.height) throw serviceError(400, 'local_image_dimensions_mismatch', 'Deterministic image geometry no longer matches canonical inputs');
      const expected = isolateBackgroundRgba(sourcePixels.data, maskPixels.alpha, sourcePixels.width, sourcePixels.height);
      assertExactPixels(expected, candidate.data);

      const artifact: CreativeArtifact = Object.freeze({
        id: `core-verified-local:${ticket.ticketId}`,
        kind: 'image',
        value: Object.freeze({ width: sourcePixels.width, height: sourcePixels.height, data: expected, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'FINAL',
        role: 'COMPOSITE',
        image: Object.freeze({ width: sourcePixels.width, height: sourcePixels.height, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
        metadata: Object.freeze({
          artifactRole: 'COMPOSITE',
          localExecutionAdmission: 'ADMITTED',
          ticketId: ticket.ticketId,
          executorKind: result.executor.kind,
          toolId: result.executor.toolId,
          toolVersion: result.executor.version,
          runtime: result.runtime,
          accelerator: result.accelerator,
          candidateSha256: upload.sha256,
          verifiedPixelSha256: createHash('sha256').update(expected).digest('hex'),
          integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
          parentArtifactIds: Object.freeze(ticket.inputs.map(binding => binding.artifactId)),
        }),
      });

      const outcome = await input.verify({ ticket, result, artifact });
      if (outcome.status !== 'SUCCESS') throw serviceError(422, 'local_execution_verification_failed', 'Canonical deterministic execution did not pass workflow verification');
      const stored = await this.dependencies.persistFinal(
        ticket.scope,
        ticket.workflowId,
        ticket.stepId,
        { width: sourcePixels.width, height: sourcePixels.height, data: expected },
        { sourceArtifactId: source.id, maskArtifactId: mask.id, producerOperation: 'BACKGROUND_ISOLATION' },
      );
      const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
      await this.dependencies.admission.commit(ticket.ticketId, 'SUCCESS');
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.now());
      return Object.freeze({ executionId: ticket.workflowId, status: 'SUCCESS', artifactId, outcome });
    } catch (error) {
      await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw error;
    }
  }

  private assertTicket(ticket: LocalExecutionTicketV2): void {
    if (ticket.version !== '2' || ticket.operation.capability !== this.contract.capability || ticket.operation.type !== 'BACKGROUND_ISOLATION' || ticket.operation.id !== this.contract.stepId || ticket.stepId !== this.contract.stepId || ticket.policy !== 'LOCAL_ONLY') {
      throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not the exact accepted Background Isolation result contract');
    }
    if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Deterministic Background Isolation must bind exactly one executor');
    const executor = ticket.allowedExecutors[0];
    if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Deterministic Background Isolation executor binding is invalid');
  }

  private async revalidateCanonicalInputs(ticket: LocalExecutionTicketV2): Promise<readonly CreativeArtifact[]> {
    if (ticket.inputs.length !== 2) throw serviceError(409, 'local_input_contract_mismatch', 'Background isolation requires exactly two canonical inputs');
    const sourceBinding = ticket.inputs.find(binding => binding.kind === 'image');
    const maskBinding = ticket.inputs.find(binding => binding.kind === 'mask');
    if (!sourceBinding?.sha256 || !maskBinding?.sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Background isolation requires SHA-bound IMAGE + MASK inputs');
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId, maskBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical deterministic inputs are no longer authorized or available');
    const artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, [maskBinding.artifactId]);
    const source = artifacts.find(artifact => artifact.id === sourceBinding.artifactId && artifact.kind === 'image');
    const mask = artifacts.find(artifact => artifact.id === maskBinding.artifactId && artifact.kind === 'mask' && artifact.role === 'MASK');
    if (!source || !mask) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical source or MASK was not hydrated');
    if (!source.image?.width || !source.image.height || source.image.width !== mask.image?.width || source.image.height !== mask.image?.height) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical deterministic input geometry mismatch');
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
    return artifacts;
  }

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<LocalResultAuthoritySubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw serviceError(409, 'local_finalization_unknown', 'Local execution was consumed without a recoverable terminal status');
    if (finalization.status === 'FAILED') return failedReplay(ticket.workflowId);
    const stored = await this.dependencies.loadPersistedFinal(ticket.workflowId, ticket.scope);
    if (!stored) throw serviceError(409, 'local_finalization_artifact_unavailable', 'Committed deterministic FINAL is unavailable');
    const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
    return successReplay(ticket.workflowId, artifactId);
  }
}

async function loadExactEvidence(uploads: UploadReader, ticket: LocalExecutionTicket | LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence, now: number): Promise<LocalExecutionUpload> {
  const upload = await uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, now);
  if (!upload) throw serviceError(400, 'local_upload_unavailable', 'Quarantined local output is unavailable or expired');
  if (upload.sha256 !== evidence.sha256 || upload.sizeBytes !== evidence.sizeBytes || upload.kind !== evidence.kind || upload.role !== evidence.role || upload.mimeType !== evidence.mimeType || upload.width !== evidence.width || upload.height !== evidence.height) {
    throw serviceError(400, 'local_upload_evidence_mismatch', 'Submitted result evidence does not match quarantined bytes');
  }
  return upload;
}

function requireSource(artifacts: readonly CreativeArtifact[], ticket: LocalExecutionTicketV2) {
  const binding = ticket.inputs.find(value => value.kind === 'image');
  const artifact = binding && artifacts.find(value => value.id === binding.artifactId && value.kind === 'image');
  const value = artifact?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
  if (!artifact || !Number.isInteger(value?.width) || !Number.isInteger(value?.height) || !(value?.data instanceof Uint8ClampedArray)) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical source RGBA pixels are unavailable');
  return artifact as CreativeArtifact & { value: { width: number; height: number; data: Uint8ClampedArray } };
}

function requireMask(artifacts: readonly CreativeArtifact[], ticket: LocalExecutionTicketV2) {
  const binding = ticket.inputs.find(value => value.kind === 'mask');
  const artifact = binding && artifacts.find(value => value.id === binding.artifactId && value.kind === 'mask');
  const value = artifact?.value as Readonly<{ width?: unknown; height?: unknown; alpha?: unknown }> | undefined;
  if (!artifact || !Number.isInteger(value?.width) || !Number.isInteger(value?.height) || !(value?.alpha instanceof Uint8Array)) throw serviceError(409, 'canonical_mask_pixels_unavailable', 'Canonical MASK alpha pixels are unavailable');
  return artifact as CreativeArtifact & { value: { width: number; height: number; alpha: Uint8Array } };
}

async function decodePngRgba(bytes: Uint8Array): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Deterministic image output must be PNG');
    const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (!decoded.info.width || !decoded.info.height || decoded.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Deterministic PNG must decode to RGBA8');
    return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Deterministic PNG could not be decoded');
  }
}

function assertExactPixels(expected: Uint8ClampedArray, actual: Uint8ClampedArray): void {
  if (actual.length !== expected.length) throw serviceError(400, 'local_pixel_verification_failed', 'Deterministic candidate pixel length mismatch');
  for (let index = 0; index < expected.length; index += 1) if (actual[index] !== expected[index]) throw serviceError(400, 'local_pixel_verification_failed', `Deterministic candidate differs from Core recomputation at RGBA byte ${index}`);
}

function admissionError(reasonCode: string): Error & { status: number; code: string } {
  const status = reasonCode === 'IN_PROGRESS' ? 409 : reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
  return serviceError(status, `local_result_${reasonCode.toLowerCase()}`, `Local result admission denied: ${reasonCode}`);
}

function successReplay(executionId: string, artifactId: string): LocalResultAuthoritySubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'SUCCESS', verification: Object.freeze({ valid: true, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze([]) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'SUCCESS', artifactId, outcome });
}

function failedReplay(executionId: string): LocalResultAuthoritySubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'FAILED', verification: Object.freeze({ valid: false, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze(['LOCAL_EXECUTION_PREVIOUSLY_FAILED']) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'FAILED', outcome });
}

function requireContract(contract: ExactLocalContract): ExactLocalContract {
  if (!contract?.capability?.trim() || !contract.stepId?.trim()) throw new Error('Exact local result contract requires capability and stepId');
  return Object.freeze({ capability: contract.capability.trim(), stepId: contract.stepId.trim() });
}

function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}

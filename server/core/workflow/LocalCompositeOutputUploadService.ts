import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import type { AnyLocalExecutionTicket } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';
import { LOCAL_COMPOSITE_CONTINUATION_STEPS, type LocalCompositeContinuationService } from './LocalCompositeContinuationService.ts';

type LocalCompositeResumePort = Pick<LocalCompositeContinuationService, 'resume'>;

export type LocalCompositeUploadEvidence = Readonly<{
  uploadId: string;
  kind: string;
  role: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  width?: number;
  height?: number;
}>;

/**
 * Quarantine boundary for the currently outstanding composite ticket.
 * The caller supplies execution identity + bytes only; Core resolves the ticket,
 * step, output kind and geometry from durable continuation authority.
 */
export class LocalCompositeOutputUploadService {
  private readonly continuation: LocalCompositeResumePort;
  private readonly uploads: PostgresLocalExecutionUploadStore;
  private readonly now: () => number;

  constructor(input: Readonly<{ continuation: LocalCompositeResumePort; uploads: PostgresLocalExecutionUploadStore; now?: () => number }>) {
    this.continuation = input.continuation;
    this.uploads = input.uploads;
    this.now = input.now ?? Date.now;
  }

  async upload(input: Readonly<{ executionId: string; scope: Scope; bytes: Uint8Array; mimeType: string }>): Promise<LocalCompositeUploadEvidence> {
    const view = await this.continuation.resume(requireToken(input.executionId, 'executionId'), input.scope);
    if (view.state !== 'WAITING_FOR_LOCAL_RESULT' || view.nextAction?.type !== 'LOCAL_EXECUTION') {
      throw uploadError(409, 'local_composite_upload_not_expected', 'Composite continuation is not waiting for a local output');
    }
    const ticket = view.nextAction.ticket;
    const expected = exactExpectedOutput(ticket);
    const now = this.now();
    if (now >= ticket.expiresAt) throw uploadError(410, 'local_composite_ticket_expired', 'Outstanding composite ticket has expired');
    if (input.mimeType !== expected.mimeType) throw uploadError(415, 'local_composite_upload_media_type', `Composite output requires ${expected.mimeType}`);
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) throw uploadError(400, 'local_composite_upload_empty', 'Composite local output is empty');
    if (expected.kind === 'mask' && input.bytes.byteLength !== expected.width * expected.height) {
      throw uploadError(400, 'local_composite_mask_size', 'Composite MASK byte length must equal the Core-selected output geometry');
    }
    const stored = await this.uploads.persist({
      ticketId: ticket.ticketId,
      scope: ticket.scope,
      kind: expected.kind,
      role: expected.role,
      mimeType: expected.mimeType,
      width: expected.width,
      height: expected.height,
      bytes: input.bytes,
      expiresAt: ticket.expiresAt,
      now,
    });
    return Object.freeze({
      uploadId: stored.uploadId,
      kind: stored.kind,
      role: stored.role,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      mimeType: stored.mimeType,
      width: stored.width,
      height: stored.height,
    });
  }
}

function exactExpectedOutput(ticket: AnyLocalExecutionTicket): Readonly<{ kind: 'mask' | 'image'; role: 'MASK' | 'COMPOSITE'; mimeType: string; width: number; height: number }> {
  if (ticket.expectedOutputs.length !== 1) throw uploadError(409, 'local_composite_output_contract', 'Composite ticket must bind exactly one local output');
  const output = ticket.expectedOutputs[0];
  if (!Number.isInteger(output.width) || !Number.isInteger(output.height) || Number(output.width) < 1 || Number(output.height) < 1) throw uploadError(409, 'local_composite_output_contract', 'Composite output geometry is incomplete');
  if (ticket.version === '1') {
    if (ticket.stepId !== LOCAL_COMPOSITE_CONTINUATION_STEPS.segment || ticket.operation.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.segment || ticket.operation.capability !== LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment || output.kind !== 'mask' || output.role !== 'MASK' || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'application/octet-stream') {
      throw uploadError(409, 'local_composite_output_contract', 'Outstanding v1 ticket is not the accepted composite segmentation contract');
    }
    return Object.freeze({ kind: 'mask', role: 'MASK', mimeType: 'application/octet-stream', width: Number(output.width), height: Number(output.height) });
  }
  if (ticket.version === '2') {
    if (ticket.stepId !== LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation || ticket.operation.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation || ticket.operation.capability !== LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png') {
      throw uploadError(409, 'local_composite_output_contract', 'Outstanding v2 ticket is not the accepted composite Background Isolation contract');
    }
    return Object.freeze({ kind: 'image', role: 'COMPOSITE', mimeType: 'image/png', width: Number(output.width), height: Number(output.height) });
  }
  throw uploadError(409, 'local_composite_output_contract', 'Unsupported composite ticket version');
}

function requireToken(value: string, field: string): string { const token = value?.trim(); if (!token) throw uploadError(400, 'local_composite_invalid_request', `${field} is required`); return token; }
function uploadError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }

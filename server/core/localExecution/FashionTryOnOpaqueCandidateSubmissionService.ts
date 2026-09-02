import type {
  LocalExecutionOutputEvidence,
  LocalExecutionResultV2,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/index.ts';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import {
  assertGarmentMeshWarpTicket,
  garmentMeshWarpOutputContract,
  garmentMeshWarpParametersFromTicket,
} from './GarmentMeshWarpExecutionContract.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeOutputContract,
  garmentTextureCompositeParametersFromTicket,
} from './GarmentTextureCompositeExecutionContract.ts';
import type { LocalGarmentMeshWarpExecutionService } from './LocalGarmentMeshWarpExecutionService.ts';
import type { LocalGarmentTextureCompositeExecutionService } from './LocalGarmentTextureCompositeExecutionService.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MESH_TOOL = GARMENT_MESH_WARP_TOOL_DEFINITION;
const TEXTURE_EXECUTOR = Object.freeze({
  kind: 'DETERMINISTIC_TOOL' as const,
  toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
});

type TicketReader = Pick<LocalExecutionLedgerV2, 'getV2'>;
type MeshAuthority = Pick<LocalGarmentMeshWarpExecutionService, 'uploadImage' | 'submit'>;
type TextureAuthority = Pick<LocalGarmentTextureCompositeExecutionService, 'uploadImage' | 'submit'>;

export type FashionTryOnOpaqueCandidateSubmissionDependencies = Readonly<{
  admission: TicketReader;
  garmentWarp: MeshAuthority;
  textureComposite: TextureAuthority;
}>;

export type FashionTryOnOpaqueCandidateCommand = Readonly<{
  ticketId: unknown;
  projectId: unknown;
  bytes: unknown;
  latencyMs: unknown;
}>;

export type FashionTryOnOpaqueCandidateResult = Readonly<{
  status: 'SUCCESS' | 'FAILED';
}>;

/**
 * Product-safe bridge from an opaque execution handle to the already accepted
 * deterministic F4 submission authorities.
 *
 * The browser never constructs LocalExecutionResultV2 and never receives its
 * nonce, request/workflow/step identities, executor binding, output receipt,
 * immutable warp-layer identity or FINAL artifact identity. Core reloads the
 * durable v2 ticket by random opaque ticketId, rechecks authenticated Project
 * scope and phase contract, quarantines a private snapshot of candidate PNG
 * bytes, reconstructs the canonical deterministic result envelope itself, then
 * delegates to the existing byte-exact submit authority.
 *
 * The random ticketId is only a lookup handle, not authorization. No HMAC grant,
 * grant table or second result-admission path is introduced here.
 */
export class FashionTryOnOpaqueCandidateSubmissionService {
  constructor(private readonly dependencies: FashionTryOnOpaqueCandidateSubmissionDependencies) {}

  async submitGarmentWarpCandidate(
    input: FashionTryOnOpaqueCandidateCommand,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnOpaqueCandidateResult> {
    const command = normalizeCandidate(input);
    const ticket = await this.requireMeshTicket(command.ticketId, command.projectId, auth);
    const evidence = await this.dependencies.garmentWarp.uploadImage({
      ticketId: ticket.ticketId,
      projectId: ticket.scope.projectId,
      bytes: command.bytes,
    }, auth);
    const result = meshResult(ticket, evidence, command.latencyMs);
    const finalized = await this.dependencies.garmentWarp.submit({
      ticketId: ticket.ticketId,
      projectId: ticket.scope.projectId,
      result,
    }, auth);
    return Object.freeze({ status: finalized.status });
  }

  async submitTextureCompositeCandidate(
    input: FashionTryOnOpaqueCandidateCommand,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnOpaqueCandidateResult> {
    const command = normalizeCandidate(input);
    const ticket = await this.requireTextureTicket(command.ticketId, command.projectId, auth);
    const evidence = await this.dependencies.textureComposite.uploadImage({
      ticketId: ticket.ticketId,
      projectId: ticket.scope.projectId,
      bytes: command.bytes,
    }, auth);
    const result = textureResult(ticket, evidence, command.latencyMs);
    const finalized = await this.dependencies.textureComposite.submit({
      ticketId: ticket.ticketId,
      projectId: ticket.scope.projectId,
      result,
    }, auth);
    return Object.freeze({ status: finalized.status });
  }

  private async requireMeshTicket(ticketId: string, projectId: string, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const ticket = await this.requireScopedTicket(ticketId, projectId, auth);
    assertGarmentMeshWarpTicket(ticket);
    return ticket;
  }

  private async requireTextureTicket(ticketId: string, projectId: string, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const ticket = await this.requireScopedTicket(ticketId, projectId, auth);
    assertGarmentTextureCompositeTicket(ticket);
    return ticket;
  }

  private async requireScopedTicket(ticketId: string, projectId: string, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw candidateError(404, 'fashion_tryon_opaque_ticket_not_found', 'Fashion Try-On execution handle was not found');
    if (
      ticket.scope.tenantId !== auth.tenantId
      || ticket.scope.userId !== auth.userId
      || ticket.scope.projectId !== projectId
    ) {
      throw candidateError(403, 'fashion_tryon_opaque_ticket_scope_mismatch', 'Fashion Try-On execution handle is outside the authenticated Project scope');
    }
    return ticket;
  }
}

function meshResult(
  ticket: LocalExecutionTicketV2,
  evidence: LocalExecutionOutputEvidence,
  latencyMs: number,
): LocalExecutionResultV2 {
  const output = garmentMeshWarpOutputContract(ticket);
  const parameters = garmentMeshWarpParametersFromTicket(ticket);
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: ticket.version,
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: MESH_TOOL.executor,
    runtime: MESH_TOOL.browser.runtime,
    accelerator: MESH_TOOL.browser.accelerator,
    outputs: Object.freeze([Object.freeze({ ...evidence })]),
    metrics: Object.freeze({ latencyMs }),
    benchmarkEvidence: Object.freeze({
      pixelCount: Number(output.width) * Number(output.height),
      deterministicTool: MESH_TOOL.parameters.exact.deterministicTool,
      destinationMeshSha256: parameters.destinationMeshSha256,
    }),
  });
}

function textureResult(
  ticket: LocalExecutionTicketV2,
  evidence: LocalExecutionOutputEvidence,
  latencyMs: number,
): LocalExecutionResultV2 {
  const output = garmentTextureCompositeOutputContract(ticket);
  const parameters = garmentTextureCompositeParametersFromTicket(ticket);
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: ticket.version,
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: TEXTURE_EXECUTOR,
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze({ ...evidence })]),
    metrics: Object.freeze({ latencyMs }),
    benchmarkEvidence: Object.freeze({
      pixelCount: Number(output.width) * Number(output.height),
      deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
      garmentWarpLayerSha256: parameters.garmentWarpLayerSha256,
      producerParametersSha256: parameters.producerParametersSha256,
    }),
  });
}

function normalizeCandidate(input: FashionTryOnOpaqueCandidateCommand): Readonly<{
  ticketId: string;
  projectId: string;
  bytes: Uint8Array;
  latencyMs: number;
}> {
  if (!input || typeof input !== 'object') throw candidateError(400, 'invalid_fashion_tryon_candidate', 'Fashion Try-On candidate request is required');
  const ticketId = canonicalUuid(input.ticketId, 'ticketId');
  const projectId = canonicalUuid(input.projectId, 'projectId');
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) {
    throw candidateError(400, 'invalid_fashion_tryon_candidate', 'Fashion Try-On candidate PNG bytes are required');
  }
  if (typeof input.latencyMs !== 'number' || !Number.isFinite(input.latencyMs) || input.latencyMs < 0) {
    throw candidateError(400, 'invalid_fashion_tryon_candidate', 'Fashion Try-On candidate latencyMs must be finite and non-negative');
  }
  return Object.freeze({
    ticketId,
    projectId,
    bytes: Uint8Array.from(input.bytes),
    latencyMs: input.latencyMs,
  });
}

function canonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw candidateError(400, 'invalid_fashion_tryon_candidate', `${label} must be a canonical lowercase UUID`);
  }
  return value;
}

function candidateError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}

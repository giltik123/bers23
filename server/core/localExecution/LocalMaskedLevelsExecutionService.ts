import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionTicketV2,
  type ProductionOutcome,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  MASKED_LEVELS_CAPABILITY,
  MASKED_LEVELS_OPERATION,
  MASKED_LEVELS_STEP_ID,
  MASKED_LEVELS_TOOL_ID,
  MASKED_LEVELS_TOOL_VERSION,
  normalizeMaskedLevelsParameters,
} from '../../../src/platform/creative/deterministic/MaskedLevels.ts';
import { MASKED_LEVELS_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import { MaskedLevelsResultAuthority } from './LocalExecutionResultAuthority.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const TOOL = MASKED_LEVELS_TOOL_DEFINITION;
const STEP_ID = MASKED_LEVELS_STEP_ID;
const IDEMPOTENCY_SUFFIX = `:${STEP_ID}:local-v2`;

export type LocalMaskedLevelsPrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  maskArtifactId: string;
  inputBlack: number;
  inputMidpoint: number;
  inputWhite: number;
  outputBlack: number;
  outputWhite: number;
  clientRequestId: string;
}>;

export type LocalMaskedLevelsSubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type LocalMaskedLevelsResourceLimits = Readonly<{
  maxDimension: number;
  maxPixels: number;
  maxUploadBytes: number;
}>;

export type LocalMaskedLevelsServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  limits: LocalMaskedLevelsResourceLimits;
  persistFinal: (
    scope: AuthenticatedScope & { projectId: string },
    executionId: string,
    operationId: string,
    image: PixelImage,
    lineage?: Readonly<{ sourceArtifactId: string; maskArtifactId: string; producerOperation: 'MASKED_LEVELS' }>,
  ) => Promise<Readonly<{ storageId: string; width: number; height: number }>>;
  loadPersistedFinal: (executionId: string, scope: AuthenticatedScope & { projectId: string }) => Promise<Readonly<{ storageId: string; width: number; height: number }> | undefined>;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

/**
 * Purpose-bound Core authority for deterministic Masked Levels.
 * Browser bytes stay quarantined until the Core independently recomputes the
 * exact IMAGE+MASK operation and accepts byte equality. No provider/Billing port exists.
 */
export class LocalMaskedLevelsExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;
  readonly #results: MaskedLevelsResultAuthority;
  readonly #limits: LocalMaskedLevelsResourceLimits;

  constructor(private readonly dependencies: LocalMaskedLevelsServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
    this.#limits = normalizeResourceLimits(dependencies.limits);
    this.#results = new MaskedLevelsResultAuthority(dependencies, { capability: MASKED_LEVELS_CAPABILITY, stepId: STEP_ID });
  }

  async prepare(command: LocalMaskedLevelsPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = maskedLevelsExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = ticketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      assertTicketWithinCoreLimits(durable, this.#limits);
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.sourceArtifactId, normalized.maskArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Source IMAGE or MASK is outside the authenticated project scope');
    const artifacts = await this.hydrateExactInputs(scope, normalized.sourceArtifactId, normalized.maskArtifactId);
    assertArtifactsWithinCoreLimits(artifacts, normalized.sourceArtifactId, this.#limits);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, artifacts, normalized.clientRequestId, normalized.sourceArtifactId, normalized.maskArtifactId, normalized.inputBlack, normalized.inputMidpoint, normalized.inputWhite, normalized.outputBlack, normalized.outputWhite);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one Masked Levels local execution ticket');
    const ticket = tickets[0];
    assertMaskedLevelsTicket(ticket);
    assertTicketWithinCoreLimits(ticket, this.#limits);
    if (ticket.idempotencyKey !== idempotencyKey) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical deterministic ticket idempotency binding is invalid');
    assertExactCommandBinding(ticket, normalized);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    assertTicketWithinCoreLimits(ticket, this.#limits);
    if (input.bytes.byteLength > this.#limits.maxUploadBytes) throw serviceError(413, 'local_image_upload_too_large', 'Local Masked Levels image upload exceeds the Core image upload limit');
    const expected = ticket.expectedOutputs[0];
    if (ticket.expectedOutputs.length !== 1 || expected.kind !== 'image' || expected.role !== 'COMPOSITE' || expected.mimeTypes?.length !== 1 || expected.mimeTypes[0] !== 'image/png') throw serviceError(409, 'local_output_contract_error', 'Ticket is not a single PNG COMPOSITE output contract');
    const decoded = await decodePngRgba(input.bytes);
    if (decoded.width !== expected.width || decoded.height !== expected.height) throw serviceError(400, 'local_image_dimensions_mismatch', 'Uploaded image dimensions do not match the ticket');
    const upload = await this.dependencies.uploads.persist({
      ticketId: ticket.ticketId,
      scope: ticket.scope,
      kind: 'image',
      role: 'COMPOSITE',
      mimeType: 'image/png',
      width: decoded.width,
      height: decoded.height,
      bytes: input.bytes,
      expiresAt: ticket.expiresAt,
      now: this.#now(),
    });
    return Object.freeze({ uploadId: upload.uploadId, kind: 'image', role: 'COMPOSITE' as const, sha256: upload.sha256, sizeBytes: upload.sizeBytes, mimeType: upload.mimeType, width: upload.width, height: upload.height });
  }

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalMaskedLevelsSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    assertTicketWithinCoreLimits(ticket, this.#limits);
    return this.#results.submit({
      ticket,
      result: input.result,
      verify: async ({ ticket: admittedTicket, result, artifact }) => {
        const sourceBinding = admittedTicket.inputs.find(binding => binding.kind === 'image');
        const maskBinding = admittedTicket.inputs.find(binding => binding.kind === 'mask');
        if (!sourceBinding || !maskBinding) throw serviceError(409, 'local_execution_recovery_input', 'Durable deterministic ticket lacks IMAGE + MASK bindings');
        const artifacts = await this.hydrateExactInputs(admittedTicket.scope, sourceBinding.artifactId, maskBinding.artifactId);
        await this.ensurePlatformExecution(admittedTicket, artifacts);
        const existingOutcome = this.#platform.result(admittedTicket.requestId);
        return existingOutcome ?? await this.#platform.completeLocalExecution(admittedTicket.requestId, {
          ticketId: admittedTicket.ticketId,
          stepId: admittedTicket.stepId,
          artifact,
          latencyMs: result.metrics.latencyMs,
          memoryMb: result.metrics.memoryBytes === undefined ? undefined : result.metrics.memoryBytes / (1024 * 1024),
        });
      },
    });
  }

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    assertSameScope(ticket.scope, { ...auth, projectId });
    assertMaskedLevelsTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicketV2, command: LocalMaskedLevelsPrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertMaskedLevelsTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== ticketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another deterministic execution');
    assertExactCommandBinding(ticket, command);
    if (!await this.dependencies.ownsArtifacts(scope, [command.sourceArtifactId, command.maskArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical deterministic inputs are no longer authorized or available');
    const artifacts = await this.hydrateExactInputs(scope, command.sourceArtifactId, command.maskArtifactId);
    assertArtifactsWithinCoreLimits(artifacts, command.sourceArtifactId, this.#limits);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
  }

  private async hydrateExactInputs(scope: AuthenticatedScope & { projectId: string }, sourceArtifactId: string, maskArtifactId: string): Promise<readonly CreativeArtifact[]> {
    try {
      const artifacts = await this.dependencies.hydrateArtifacts(scope, sourceArtifactId, [maskArtifactId]);
      const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image');
      const mask = artifacts.find(artifact => artifact.id === maskArtifactId && artifact.kind === 'mask' && artifact.role === 'MASK');
      if (!source || !mask) throw new Error('Canonical source or mask was not hydrated');
      if (!source.image?.width || !source.image.height || source.image.width !== mask.image?.width || source.image.height !== mask.image?.height) throw new Error('Canonical deterministic input geometry mismatch');
      if (!artifactHash(source) || !artifactHash(mask)) throw new Error('Canonical deterministic input integrity hash is missing');
      return artifacts;
    } catch (error) {
      throw serviceError(409, 'local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical deterministic input lineage is unavailable');
    }
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    const sourceBinding = ticket.inputs.find(binding => binding.kind === 'image');
    const maskBinding = ticket.inputs.find(binding => binding.kind === 'mask');
    if (!sourceBinding || !maskBinding) throw serviceError(409, 'local_execution_recovery_input', 'Durable deterministic ticket lacks IMAGE + MASK bindings');
    const clientRequestId = clientRequestIdFromTicket(ticket);
    const parameters = levelsParametersFromTicket(ticket);
    this.createPlatformExecution(ticket.requestId, ticket.scope, artifacts, clientRequestId, sourceBinding.artifactId, maskBinding.artifactId, parameters.inputBlack, parameters.inputMidpoint, parameters.inputWhite, parameters.outputBlack, parameters.outputWhite);
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical deterministic execution does not match the durable ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, artifacts: readonly CreativeArtifact[], clientRequestId: string, sourceArtifactId: string, maskArtifactId: string, inputBlack: number, inputMidpoint: number, inputWhite: number, outputBlack: number, outputWhite: number): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'apply deterministic masked levels',
      scope,
      inputArtifacts: artifacts,
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: MASKED_LEVELS_OPERATION,
        sourceArtifactId,
        maskArtifactId,
        inputBlack,
        inputMidpoint,
        inputWhite,
        outputBlack,
        outputWhite,
        idempotencyKey: clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepare(command: LocalMaskedLevelsPrepareCommand): LocalMaskedLevelsPrepareCommand {
  const projectId = command?.projectId?.trim();
  const sourceArtifactId = command?.sourceArtifactId?.trim();
  const maskArtifactId = command?.maskArtifactId?.trim();
  const clientRequestId = command?.clientRequestId?.trim();
  if (!projectId || !sourceArtifactId || !maskArtifactId || !clientRequestId) throw serviceError(400, 'invalid_masked_levels_request', 'projectId, sourceArtifactId, maskArtifactId and clientRequestId are required');
  if (sourceArtifactId === maskArtifactId) throw serviceError(400, 'invalid_masked_levels_request', 'Source IMAGE and MASK identities must be distinct');
  let parameters: Readonly<{ inputBlack: number; inputMidpoint: number; inputWhite: number; outputBlack: number; outputWhite: number }>;
  try { parameters = normalizeMaskedLevelsParameters(command?.inputBlack, command?.inputMidpoint, command?.inputWhite, command?.outputBlack, command?.outputWhite); }
  catch (error) { throw serviceError(400, 'invalid_masked_levels_request', error instanceof Error ? error.message : 'Masked Levels parameters are invalid'); }
  return Object.freeze({ projectId, sourceArtifactId, maskArtifactId, ...parameters, clientRequestId });
}
function normalizeResourceLimits(value: LocalMaskedLevelsResourceLimits): LocalMaskedLevelsResourceLimits {
  if (!Number.isSafeInteger(value?.maxDimension) || value.maxDimension < 1
    || !Number.isSafeInteger(value?.maxPixels) || value.maxPixels < 1
    || !Number.isSafeInteger(value?.maxUploadBytes) || value.maxUploadBytes < 1) throw new Error('Masked Levels Core resource limits are invalid');
  return Object.freeze({ maxDimension: value.maxDimension, maxPixels: value.maxPixels, maxUploadBytes: value.maxUploadBytes });
}
function assertDimensionsWithinCoreLimits(width: number, height: number, limits: LocalMaskedLevelsResourceLimits): void {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > limits.maxDimension || height > limits.maxDimension || !Number.isSafeInteger(pixels) || pixels > limits.maxPixels) {
    throw serviceError(422, 'masked_levels_resource_limit_exceeded', 'Masked Levels source exceeds the current Core image resource limits');
  }
}
function assertArtifactsWithinCoreLimits(artifacts: readonly CreativeArtifact[], sourceArtifactId: string, limits: LocalMaskedLevelsResourceLimits): void {
  const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image');
  const width = source?.image?.width;
  const height = source?.image?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw serviceError(409, 'local_input_geometry_mismatch', 'Canonical Masked Levels source geometry is unavailable');
  assertDimensionsWithinCoreLimits(Number(width), Number(height), limits);
}
function assertTicketWithinCoreLimits(ticket: LocalExecutionTicketV2, limits: LocalMaskedLevelsResourceLimits): void {
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || !Number.isSafeInteger(output?.width) || !Number.isSafeInteger(output?.height)) throw serviceError(409, 'local_output_contract_error', 'Masked Levels ticket output geometry is invalid');
  assertDimensionsWithinCoreLimits(Number(output.width), Number(output.height), limits);
}
function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ type: string; id: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== MASKED_LEVELS_OPERATION || operations[0].id !== STEP_ID) throw serviceError(422, 'masked_levels_plan_blocked', `Canonical Masked Levels plan is ${status ?? 'invalid'}`);
}
function assertMaskedLevelsTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.operation.capability !== MASKED_LEVELS_CAPABILITY || ticket.operation.type !== MASKED_LEVELS_OPERATION || ticket.operation.id !== STEP_ID || ticket.stepId !== STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted Masked Levels contract');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw serviceError(409, 'local_ticket_cost_mismatch', 'Masked Levels ticket contains forbidden cloud cost authority');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Masked Levels must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== MASKED_LEVELS_TOOL_ID || executor.version !== MASKED_LEVELS_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Masked Levels executor binding is invalid');
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  const exact = TOOL.parameters.exact;
  const normalized = levelsParametersFromTicket(ticket);
  for (const [key, value] of Object.entries(exact)) if (parameters?.[key] !== value) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Masked Levels ticket semantic parameters are invalid');
  for (const value of [normalized.inputBlack, normalized.inputMidpoint, normalized.inputWhite, normalized.outputBlack, normalized.outputWhite]) if (!Number.isSafeInteger(value)) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Masked Levels ticket semantic parameters are invalid');
}
function assertExactCommandBinding(ticket: LocalExecutionTicketV2, command: LocalMaskedLevelsPrepareCommand): void {
  if (ticket.inputs.length !== 2) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable Masked Levels ticket input count changed');
  const source = ticket.inputs.find(binding => binding.kind === 'image');
  const mask = ticket.inputs.find(binding => binding.kind === 'mask');
  if (!source || !mask || source.artifactId !== command.sourceArtifactId || mask.artifactId !== command.maskArtifactId || !source.sha256 || !mask.sha256) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different Masked Levels inputs');
  const parameters = levelsParametersFromTicket(ticket);
  if (parameters.inputBlack !== command.inputBlack || parameters.inputMidpoint !== command.inputMidpoint || parameters.inputWhite !== command.inputWhite || parameters.outputBlack !== command.outputBlack || parameters.outputWhite !== command.outputWhite) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different Masked Levels values');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || !output.width || !output.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable Masked Levels output contract changed');
}
function levelsParametersFromTicket(ticket: LocalExecutionTicketV2): Readonly<{ inputBlack: number; inputMidpoint: number; inputWhite: number; outputBlack: number; outputWhite: number }> {
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  try { return normalizeMaskedLevelsParameters(Number(parameters?.inputBlack), Number(parameters?.inputMidpoint), Number(parameters?.inputWhite), Number(parameters?.outputBlack), Number(parameters?.outputWhite)); }
  catch { throw serviceError(409, 'local_ticket_parameter_mismatch', 'Masked Levels parameters are invalid'); }
}
async function decodePngRgba(bytes: Uint8Array): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Deterministic image output must be PNG');
    const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (!result.info.width || !result.info.height || result.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Deterministic PNG must decode to RGBA8');
    return Object.freeze({ width: result.info.width, height: result.info.height, data: new Uint8ClampedArray(result.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Deterministic PNG could not be decoded');
  }
}
function ticketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}${IDEMPOTENCY_SUFFIX}`; }
function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  if (!ticket.idempotencyKey.endsWith(IDEMPOTENCY_SUFFIX)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable deterministic ticket idempotency key is malformed');
  const value = ticket.idempotencyKey.slice(0, -IDEMPOTENCY_SUFFIX.length);
  if (!value) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable deterministic ticket lacks client request identity');
  return value;
}
function maskedLevelsExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-masked-levels-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function sameDurableTicket(a: LocalExecutionTicketV2, b: LocalExecutionTicketV2): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function artifactHash(artifact: CreativeArtifact): string | undefined { const value = artifact.metadata?.sha256; return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : undefined; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void { if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local execution scope denied'); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }

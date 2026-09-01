import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import { decodeGarmentTextureCompositeInputEnvelope } from '../../platform/creative/canonical/garmentTextureCompositeInputEnvelope';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import { garmentTextureCompositeRgba8 } from '../../platform/creative/deterministic/GarmentTextureComposite';
import {
  normalizeGarmentTextureCompositeProducerParameters,
  type GarmentTextureTransformQ16,
} from '../../platform/creative/deterministic/GarmentTextureCompositeParameters';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXECUTOR = Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION });

export type CoreGarmentTextureCompositeClient = Readonly<{
  prepareGarmentTextureComposite(payload: Readonly<{
    projectId: string;
    sourceArtifactId: string;
    garmentWarpLayerId: string;
    garmentWarpLayerSha256: string;
    textureTransform: GarmentTextureTransformQ16;
    featherRadius: number;
    clientRequestId: string;
  }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  loadGarmentTextureCompositeInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<Uint8Array>;
  uploadGarmentTextureCompositeImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitGarmentTextureComposite(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{
    executionId: string;
    status: string;
    artifactId?: string;
    verification?: Readonly<{ valid: boolean }>;
  }>>;
}>;

export type GarmentTextureCompositeRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  textureTransform: GarmentTextureTransformQ16;
  featherRadius: number;
}>;

export type GarmentTextureCompositePreparedRunInput = Readonly<{
  ticket: LocalExecutionTicketV2;
  sourceArtifactId: string;
}>;

export type GarmentTextureCompositeRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  artifactId: string;
  preview: PixelImage;
  latencyMs: number;
}>;

export type GarmentTextureCompositePreparedRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  status: 'SUCCESS';
  preview: PixelImage;
  latencyMs: number;
}>;

type TicketExecutionResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  status: 'SUCCESS';
  artifactId?: string;
  preview: PixelImage;
  latencyMs: number;
}>;

/**
 * Browser-side F4b.5b executor.
 *
 * The browser supplies only user intent. It accepts a Core-issued LOCAL_ONLY
 * ticket plus one purpose-bound BERSGTC1 snapshot, validates their immutable
 * Project/Fashion lineage against each other, executes the shared deterministic
 * pixel law and uploads one quarantined PNG. The returned artifact identity can
 * only come from Core after independent recomputation and FINAL persistence.
 */
export class CoreAuthorizedGarmentTextureComposite {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreGarmentTextureCompositeClient,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for garment texture composite');
  }

  async run(input: GarmentTextureCompositeRunInput): Promise<GarmentTextureCompositeRunResult> {
    assertRunInput(input);
    const expectedParameters = normalizeGarmentTextureCompositeProducerParameters({
      schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
      textureTransform: input.textureTransform,
      featherRadius: input.featherRadius,
      colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
    });
    const prepared = await this.core.prepareGarmentTextureComposite({
      projectId: this.projectId,
      sourceArtifactId: input.sourceArtifactId,
      garmentWarpLayerId: input.garmentWarpLayerId,
      garmentWarpLayerSha256: input.garmentWarpLayerSha256,
      textureTransform: expectedParameters.document.textureTransform,
      featherRadius: expectedParameters.document.featherRadius,
      clientRequestId: input.requestId,
    });
    const result = await this.executeTicket(prepared.ticket, input, expectedParameters.canonicalJson);
    if (!result.artifactId) throw new Error('Core rejected deterministic garment texture composite');
    return Object.freeze({ target: result.target, runtime: result.runtime, accelerator: result.accelerator, artifactId: result.artifactId, preview: result.preview, latencyMs: result.latencyMs });
  }

  /**
   * F4b.6 prepared-ticket path. Layer identity and producer parameters come only
   * from the Core ticket. Product code supplies no continuation evidence and does
   * not receive the committed FINAL artifact identity from this execution step.
   */
  async runPrepared(input: GarmentTextureCompositePreparedRunInput): Promise<GarmentTextureCompositePreparedRunResult> {
    if (!input.ticket || !input.sourceArtifactId) throw new Error('Prepared garment texture-composite request is incomplete');
    const derived = preparedIntent(input.ticket, input.sourceArtifactId);
    const expectedParameters = normalizeGarmentTextureCompositeProducerParameters({
      schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
      textureTransform: derived.textureTransform,
      featherRadius: derived.featherRadius,
      colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
    });
    const result = await this.executeTicket(input.ticket, derived, expectedParameters.canonicalJson);
    return Object.freeze({
      target: result.target,
      runtime: result.runtime,
      accelerator: result.accelerator,
      status: result.status,
      preview: result.preview,
      latencyMs: result.latencyMs,
    });
  }

  private async executeTicket(
    ticketInput: LocalExecutionTicketV2,
    input: GarmentTextureCompositeRunInput,
    expectedProducerJson: string,
  ): Promise<TicketExecutionResult> {
    const ticket = validateTicket(ticketInput, this.projectId, input, expectedProducerJson);
    const envelope = decodeGarmentTextureCompositeInputEnvelope(
      await this.core.loadGarmentTextureCompositeInput({ ticketId: ticket.ticketId, projectId: this.projectId }),
    );
    validateEnvelope(ticket, envelope.metadata, input, expectedProducerJson);

    const startedAt = this.clock();
    const p = envelope.metadata.producerParameters;
    const rgba = garmentTextureCompositeRgba8(
      envelope.projectRgba,
      envelope.metadata.outputWidth,
      envelope.metadata.outputHeight,
      envelope.garmentSourceRgba,
      envelope.metadata.garmentSourceWidth,
      envelope.metadata.garmentSourceHeight,
      {
        sourcePointsQ16: envelope.metadata.sourcePointsQ16,
        destinationPointsQ16: envelope.metadata.destinationPointsQ16,
        triangles: envelope.metadata.triangles,
        outputWidth: envelope.metadata.outputWidth,
        outputHeight: envelope.metadata.outputHeight,
      },
      {
        textureTransform: p.textureTransform,
        featherRadius: p.featherRadius,
        colorSpacePolicy: p.colorSpacePolicy,
      },
    );
    const preview: PixelImage = Object.freeze({
      width: envelope.metadata.outputWidth,
      height: envelope.metadata.outputHeight,
      data: rgba,
      format: 'RGBA8',
      orientation: 1,
      colorSpace: 'srgb',
    });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadGarmentTextureCompositeImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, preview.width, preview.height);
    const latencyMs = Math.max(0, this.clock() - startedAt);
    const result: LocalExecutionResultV2 = Object.freeze({
      ticketId: ticket.ticketId,
      ticketVersion: ticket.version,
      requestId: ticket.requestId,
      workflowId: ticket.workflowId,
      stepId: ticket.stepId,
      nonce: ticket.nonce,
      executor: EXECUTOR,
      runtime: 'BROWSER_JS',
      accelerator: 'cpu',
      outputs: Object.freeze([Object.freeze({ ...evidence })]),
      metrics: Object.freeze({ latencyMs }),
      benchmarkEvidence: Object.freeze({
        pixelCount: preview.width * preview.height,
        deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
        garmentWarpLayerSha256: envelope.metadata.garmentWarpLayerSha256,
        producerParametersSha256: envelope.metadata.producerParametersSha256,
      }),
    });
    const finalized = await this.core.submitGarmentTextureComposite({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false) throw new Error('Core rejected deterministic garment texture composite');
    return Object.freeze({
      target: 'LOCAL',
      runtime: 'BROWSER_JS',
      accelerator: 'cpu',
      status: 'SUCCESS',
      ...(finalized.artifactId ? { artifactId: finalized.artifactId } : {}),
      preview,
      latencyMs,
    });
  }
}

function preparedIntent(ticket: LocalExecutionTicketV2, sourceArtifactId: string): GarmentTextureCompositeRunInput {
  const p = parameters(ticket);
  const layerId = typeof p.garmentWarpLayerId === 'string' ? p.garmentWarpLayerId : '';
  const layerSha256 = typeof p.garmentWarpLayerSha256 === 'string' ? p.garmentWarpLayerSha256 : '';
  if (!UUID.test(layerId) || !SHA.test(layerSha256) || !ticket.requestId) throw new Error('Prepared garment texture-composite ticket is missing server-owned evidence');
  const normalized = normalizeGarmentTextureCompositeProducerParameters(p.producerParameters);
  return Object.freeze({
    requestId: ticket.requestId,
    sourceArtifactId,
    garmentWarpLayerId: layerId,
    garmentWarpLayerSha256: layerSha256,
    textureTransform: normalized.document.textureTransform,
    featherRadius: normalized.document.featherRadius,
  });
}

function assertRunInput(input: GarmentTextureCompositeRunInput): void {
  if (!input.requestId || !input.sourceArtifactId || !UUID.test(input.garmentWarpLayerId) || !SHA.test(input.garmentWarpLayerSha256)) {
    throw new Error('Garment texture-composite request is incomplete');
  }
}

function validateTicket(
  ticket: LocalExecutionTicketV2,
  projectId: string,
  input: GarmentTextureCompositeRunInput,
  expectedProducerJson: string,
): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core garment texture-composite ticket');
  if (ticket.scope.projectId !== projectId) throw new Error('Garment texture-composite ticket Project scope is invalid');
  if (
    ticket.operation.type !== GARMENT_TEXTURE_COMPOSITE_OPERATION
    || ticket.operation.capability !== GARMENT_TEXTURE_COMPOSITE_CAPABILITY
    || ticket.operation.id !== GARMENT_TEXTURE_COMPOSITE_STEP_ID
    || ticket.operation.version !== GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION
    || ticket.stepId !== GARMENT_TEXTURE_COMPOSITE_STEP_ID
  ) throw new Error('Core ticket does not authorize garment texture composite');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Garment texture-composite ticket contains forbidden cloud cost authority');
  if (ticket.allowedExecutors.length !== 1 || !sameExecutor(ticket.allowedExecutors[0])) throw new Error('Garment texture-composite ticket executor binding is invalid');
  if (
    ticket.inputs.length !== 1
    || ticket.inputs[0].kind !== 'image'
    || ticket.inputs[0].artifactId !== input.sourceArtifactId
    || typeof ticket.inputs[0].sha256 !== 'string'
    || !SHA.test(ticket.inputs[0].sha256)
  ) throw new Error('Garment texture-composite Project input binding is invalid');
  if (!ticket.managedInputs || ticket.managedInputs.length !== 2) throw new Error('Garment texture-composite managed input namespace is invalid');
  const view = ticket.managedInputs[0]; const representation = ticket.managedInputs[1];
  if (
    view.kind !== 'GARMENT_VIEW'
    || view.authority !== 'MANAGED_GARMENT'
    || !SHA.test(view.contentSha256)
    || representation.kind !== 'GARMENT_REPRESENTATION'
    || representation.authority !== 'MANAGED_GARMENT'
    || representation.tier !== 'PARAMETRIC'
    || representation.format !== 'BERS_PARAMETRIC_V1'
    || representation.garmentId !== view.garmentId
    || representation.basisViewId !== view.viewId
    || !SHA.test(representation.contentSha256)
  ) throw new Error('Garment texture-composite managed Garment bindings are invalid');
  const output = ticket.expectedOutputs[0];
  if (
    ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.count !== 1
    || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png'
    || !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height)
    || Number(output.width) < 1 || Number(output.height) < 1
    || Number(output.width) > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION || Number(output.height) > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION
    || Number(output.width) * Number(output.height) > GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS
  ) throw new Error('Garment texture-composite output contract is invalid');
  const p = parameters(ticket);
  const normalized = normalizeGarmentTextureCompositeProducerParameters(p.producerParameters);
  if (
    p.sourceArtifactId !== input.sourceArtifactId
    || p.projectImageSha256 !== ticket.inputs[0].sha256
    || p.garmentWarpLayerId !== input.garmentWarpLayerId
    || p.garmentWarpLayerSha256 !== input.garmentWarpLayerSha256
    || p.garmentId !== view.garmentId
    || p.viewId !== view.viewId
    || p.viewSha256 !== view.contentSha256
    || p.representationId !== representation.representationId
    || p.representationSha256 !== representation.contentSha256
    || p.deterministicTool !== `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`
    || p.maxDimension !== GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION
    || p.maxOutputPixels !== GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS
    || !SHA.test(String(p.producerParametersSha256 ?? ''))
    || normalized.sha256 !== p.producerParametersSha256
    || normalized.canonicalJson !== expectedProducerJson
  ) throw new Error('Garment texture-composite ticket lineage does not match requested intent');
  return ticket;
}

function validateEnvelope(
  ticket: LocalExecutionTicketV2,
  metadata: ReturnType<typeof decodeGarmentTextureCompositeInputEnvelope>['metadata'],
  input: GarmentTextureCompositeRunInput,
  expectedProducerJson: string,
): void {
  const p = parameters(ticket);
  const output = ticket.expectedOutputs[0];
  const view = ticket.managedInputs![0]; const representation = ticket.managedInputs![1];
  if (view.kind !== 'GARMENT_VIEW' || representation.kind !== 'GARMENT_REPRESENTATION') throw new Error('Garment texture-composite managed inputs changed shape');
  const normalized = normalizeGarmentTextureCompositeProducerParameters(metadata.producerParameters);
  if (
    metadata.ticketId !== ticket.ticketId
    || metadata.projectId !== ticket.scope.projectId
    || metadata.sourceArtifactId !== input.sourceArtifactId
    || metadata.projectImageStorageId !== p.projectImageStorageId
    || metadata.projectImageSha256 !== p.projectImageSha256
    || metadata.projectImageSha256 !== ticket.inputs[0].sha256
    || metadata.garmentWarpLayerId !== input.garmentWarpLayerId
    || metadata.garmentWarpLayerId !== p.garmentWarpLayerId
    || metadata.garmentWarpLayerSha256 !== input.garmentWarpLayerSha256
    || metadata.garmentWarpLayerSha256 !== p.garmentWarpLayerSha256
    || metadata.garmentId !== p.garmentId
    || metadata.garmentId !== view.garmentId
    || metadata.viewId !== p.viewId
    || metadata.viewId !== view.viewId
    || metadata.viewSha256 !== p.viewSha256
    || metadata.viewSha256 !== view.contentSha256
    || metadata.representationId !== p.representationId
    || metadata.representationId !== representation.representationId
    || metadata.representationSha256 !== p.representationSha256
    || metadata.representationSha256 !== representation.contentSha256
    || metadata.anchorSetId !== p.anchorSetId
    || metadata.anchorPayloadSha256 !== p.anchorPayloadSha256
    || metadata.destinationMeshSha256 !== p.destinationMeshSha256
    || metadata.outputWidth !== output.width
    || metadata.outputHeight !== output.height
    || metadata.garmentSourceWidth !== view.width
    || metadata.garmentSourceHeight !== view.height
    || metadata.producerParametersSha256 !== p.producerParametersSha256
    || normalized.sha256 !== metadata.producerParametersSha256
    || normalized.canonicalJson !== expectedProducerJson
  ) throw new Error('Garment texture-composite input envelope does not match the immutable Core ticket');
}

function parameters(ticket: LocalExecutionTicketV2): Record<string, any> {
  const value = ticket.operation.parameters;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Garment texture-composite ticket parameters are missing');
  return value as Record<string, any>;
}
function sameExecutor(executor: LocalExecutionTicketV2['allowedExecutors'][number]): boolean {
  return executor.kind === 'DETERMINISTIC_TOOL' && executor.toolId === GARMENT_TEXTURE_COMPOSITE_TOOL_ID && executor.version === GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION;
}
function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (
    !evidence.uploadId || evidence.kind !== 'image' || evidence.role !== 'COMPOSITE' || evidence.mimeType !== 'image/png'
    || evidence.width !== width || evidence.height !== height || !SHA.test(evidence.sha256)
    || !Number.isSafeInteger(evidence.sizeBytes) || evidence.sizeBytes < 1
  ) throw new Error('Core garment texture-composite upload evidence is invalid');
}

import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import { decodeGarmentMeshWarpInputEnvelope } from '../../platform/creative/canonical/garmentMeshWarpInputEnvelope';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import { garmentMeshWarpRgba8 } from '../../platform/creative/deterministic/GarmentMeshWarp';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL = GARMENT_MESH_WARP_TOOL_DEFINITION;
const SHA = /^[a-f0-9]{64}$/;

export type CoreGarmentMeshWarpClient = Readonly<{
  prepareGarmentMeshWarp(payload: Readonly<{
    projectId: string;
    sourceArtifactId: string;
    garmentId: string;
    representationId: string;
    anchorSetId: string;
    clientRequestId: string;
  }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  loadGarmentMeshWarpInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<Uint8Array>;
  uploadGarmentMeshWarpImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitGarmentMeshWarp(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{
    executionId: string;
    status: string;
    layerId?: string;
    contentSha256?: string;
    verification?: Readonly<{ valid: boolean }>;
  }>>;
}>;

export type GarmentMeshWarpRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  garmentId: string;
  representationId: string;
  anchorSetId: string;
}>;

export type GarmentMeshWarpRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  layerId: string;
  contentSha256: string;
  preview: PixelImage;
  latencyMs: number;
}>;

/**
 * Browser-side F4b.4 executor. Core owns all managed Garment evidence and mesh
 * derivation; the browser only executes the exact ticketed kernel over one
 * purpose-bound envelope and submits quarantined candidate bytes for Core
 * recomputation. A successful result is a Fashion WORKING layer, never Project FINAL.
 */
export class CoreAuthorizedGarmentMeshWarp {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreGarmentMeshWarpClient,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for garment mesh warp');
  }

  async run(input: GarmentMeshWarpRunInput): Promise<GarmentMeshWarpRunResult> {
    if (!input.requestId || !input.sourceArtifactId || !input.garmentId || !input.representationId || !input.anchorSetId) {
      throw new Error('Garment mesh-warp request is incomplete');
    }
    const prepared = await this.core.prepareGarmentMeshWarp({
      projectId: this.projectId,
      sourceArtifactId: input.sourceArtifactId,
      garmentId: input.garmentId,
      representationId: input.representationId,
      anchorSetId: input.anchorSetId,
      clientRequestId: input.requestId,
    });
    const ticket = validateTicket(prepared.ticket, this.projectId, input);
    const envelope = decodeGarmentMeshWarpInputEnvelope(await this.core.loadGarmentMeshWarpInput({ ticketId: ticket.ticketId, projectId: this.projectId }));
    validateEnvelope(ticket, envelope.metadata, input);

    const startedAt = this.clock();
    const rgba = garmentMeshWarpRgba8(
      envelope.basisViewRgba,
      envelope.metadata.basisViewWidth,
      envelope.metadata.basisViewHeight,
      {
        sourcePointsQ16: envelope.metadata.sourcePointsQ16,
        destinationPointsQ16: envelope.metadata.destinationPointsQ16,
        triangles: envelope.metadata.triangles,
        outputWidth: envelope.metadata.outputWidth,
        outputHeight: envelope.metadata.outputHeight,
      },
    );
    const preview: PixelImage = Object.freeze({
      width: envelope.metadata.outputWidth,
      height: envelope.metadata.outputHeight,
      data: rgba,
      format: 'RGBA8',
      orientation: TOOL.pixelContract.orientation,
      colorSpace: 'srgb',
    });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadGarmentMeshWarpImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, preview.width, preview.height);
    const latencyMs = Math.max(0, this.clock() - startedAt);
    const result: LocalExecutionResultV2 = Object.freeze({
      ticketId: ticket.ticketId,
      ticketVersion: ticket.version,
      requestId: ticket.requestId,
      workflowId: ticket.workflowId,
      stepId: ticket.stepId,
      nonce: ticket.nonce,
      executor: TOOL.executor,
      runtime: TOOL.browser.runtime,
      accelerator: TOOL.browser.accelerator,
      outputs: Object.freeze([Object.freeze({ ...evidence })]),
      metrics: Object.freeze({ latencyMs }),
      benchmarkEvidence: Object.freeze({
        pixelCount: preview.width * preview.height,
        deterministicTool: TOOL.parameters.exact.deterministicTool,
        destinationMeshSha256: envelope.metadata.destinationMeshSha256,
      }),
    });
    const finalized = await this.core.submitGarmentMeshWarp({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (
      finalized.status !== 'SUCCESS'
      || finalized.verification?.valid === false
      || !finalized.layerId
      || !finalized.contentSha256
      || !SHA.test(finalized.contentSha256)
    ) throw new Error('Core rejected deterministic garment mesh warp');
    return Object.freeze({
      target: 'LOCAL',
      runtime: TOOL.browser.runtime,
      accelerator: TOOL.browser.accelerator,
      layerId: finalized.layerId,
      contentSha256: finalized.contentSha256,
      preview,
      latencyMs,
    });
  }
}

function validateTicket(ticket: LocalExecutionTicketV2, projectId: string, input: GarmentMeshWarpRunInput): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core garment mesh-warp ticket');
  if (ticket.scope.projectId !== projectId) throw new Error('Garment mesh-warp ticket Project scope is invalid');
  if (
    ticket.operation.type !== TOOL.operation.type
    || ticket.operation.capability !== TOOL.capability
    || ticket.operation.id !== TOOL.operation.id
    || ticket.operation.version !== TOOL.operation.version
    || ticket.stepId !== TOOL.operation.id
  ) throw new Error('Core ticket does not authorize garment mesh warp');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Garment mesh-warp ticket contains forbidden cloud cost authority');
  if (ticket.allowedExecutors.length !== 1 || !sameExecutor(ticket.allowedExecutors[0])) throw new Error('Garment mesh-warp ticket executor binding is invalid');
  if (
    ticket.inputs.length !== 1
    || ticket.inputs[0].kind !== TOOL.inputs[0].kind
    || ticket.inputs[0].artifactId !== input.sourceArtifactId
    || !ticket.inputs[0].sha256
    || !SHA.test(ticket.inputs[0].sha256)
  ) throw new Error('Garment mesh-warp Project input binding is invalid');
  if (!ticket.managedInputs || ticket.managedInputs.length !== 2) throw new Error('Garment mesh-warp managed input namespace is invalid');
  const view = ticket.managedInputs[0]; const representation = ticket.managedInputs[1];
  if (
    view.kind !== 'GARMENT_VIEW'
    || view.authority !== 'MANAGED_GARMENT'
    || view.garmentId !== input.garmentId
    || !SHA.test(view.contentSha256)
    || representation.kind !== 'GARMENT_REPRESENTATION'
    || representation.authority !== 'MANAGED_GARMENT'
    || representation.garmentId !== input.garmentId
    || representation.representationId !== input.representationId
    || representation.tier !== 'PARAMETRIC'
    || representation.format !== 'BERS_PARAMETRIC_V1'
    || representation.basisViewId !== view.viewId
    || !SHA.test(representation.contentSha256)
  ) throw new Error('Garment mesh-warp managed Garment bindings are invalid');
  const output = ticket.expectedOutputs[0];
  if (
    ticket.expectedOutputs.length !== TOOL.output.count
    || output.kind !== TOOL.output.kind
    || output.role !== TOOL.output.role
    || output.count !== TOOL.output.count
    || output.mimeTypes?.length !== 1
    || output.mimeTypes[0] !== TOOL.output.mimeTypes[0]
    || !Number.isSafeInteger(output.width)
    || !Number.isSafeInteger(output.height)
    || Number(output.width) < 1
    || Number(output.height) < 1
  ) throw new Error('Garment mesh-warp output contract is invalid');
  const p = parameters(ticket);
  if (
    p.sourceArtifactId !== input.sourceArtifactId
    || p.garmentId !== input.garmentId
    || p.viewId !== view.viewId
    || p.representationId !== input.representationId
    || p.anchorSetId !== input.anchorSetId
    || p.viewSha256 !== view.contentSha256
    || p.representationSha256 !== representation.contentSha256
    || p.projectImageSha256 !== ticket.inputs[0].sha256
  ) throw new Error('Garment mesh-warp ticket lineage does not match requested intent');
  for (const [key, expected] of Object.entries(TOOL.parameters.exact)) if (p[key] !== expected) throw new Error(`Garment mesh-warp deterministic parameter drift: ${key}`);
  return ticket;
}

function validateEnvelope(ticket: LocalExecutionTicketV2, metadata: ReturnType<typeof decodeGarmentMeshWarpInputEnvelope>['metadata'], input: GarmentMeshWarpRunInput): void {
  const p = parameters(ticket); const output = ticket.expectedOutputs[0];
  const view = ticket.managedInputs![0]; const representation = ticket.managedInputs![1];
  if (view.kind !== 'GARMENT_VIEW' || representation.kind !== 'GARMENT_REPRESENTATION') throw new Error('Garment mesh-warp ticket managed inputs changed shape');
  if (
    metadata.ticketId !== ticket.ticketId
    || metadata.projectId !== ticket.scope.projectId
    || metadata.sourceArtifactId !== input.sourceArtifactId
    || metadata.projectImageStorageId !== p.projectImageStorageId
    || metadata.projectImageSha256 !== p.projectImageSha256
    || metadata.projectImageSha256 !== ticket.inputs[0].sha256
    || metadata.outputWidth !== output.width
    || metadata.outputHeight !== output.height
    || metadata.garmentId !== input.garmentId
    || metadata.viewId !== view.viewId
    || metadata.viewSha256 !== view.contentSha256
    || metadata.viewSha256 !== p.viewSha256
    || metadata.representationId !== input.representationId
    || metadata.representationId !== representation.representationId
    || metadata.representationSha256 !== representation.contentSha256
    || metadata.representationSha256 !== p.representationSha256
    || metadata.anchorSetId !== input.anchorSetId
    || metadata.anchorPayloadSha256 !== p.anchorPayloadSha256
    || metadata.destinationMeshSha256 !== p.destinationMeshSha256
    || metadata.basisViewWidth !== view.width
    || metadata.basisViewHeight !== view.height
  ) throw new Error('Garment mesh-warp input envelope does not match the immutable Core ticket');
}

function parameters(ticket: LocalExecutionTicketV2): Record<string, unknown> {
  const value = ticket.operation.parameters;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Garment mesh-warp ticket parameters are missing');
  return value as Record<string, unknown>;
}
function sameExecutor(executor: LocalExecutionTicketV2['allowedExecutors'][number]): boolean {
  return executor.kind === TOOL.executor.kind && executor.kind === 'DETERMINISTIC_TOOL' && executor.toolId === TOOL.executor.toolId && executor.version === TOOL.executor.version;
}
function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (
    !evidence.uploadId
    || evidence.kind !== TOOL.output.kind
    || evidence.role !== TOOL.output.role
    || evidence.mimeType !== TOOL.output.mimeTypes[0]
    || evidence.width !== width
    || evidence.height !== height
    || !SHA.test(evidence.sha256)
    || !Number.isSafeInteger(evidence.sizeBytes)
    || evidence.sizeBytes < 1
  ) throw new Error('Core garment mesh-warp upload evidence is invalid');
}

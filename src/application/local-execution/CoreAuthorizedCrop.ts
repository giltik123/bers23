import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import { cropRgba8, normalizeCropRect, type CropRect } from '../../platform/creative/deterministic/Crop';
import { CROP_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL = CROP_TOOL_DEFINITION;

export type CoreCropClient = Readonly<{
  prepareCrop(payload: Readonly<{ projectId: string; sourceArtifactId: string; clientRequestId: string; x: number; y: number; width: number; height: number }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadCropImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitCrop(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type LocalCropInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  sha256(artifactId: string): Promise<string>;
}>;

export type CropRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  rect: CropRect;
}>;

export type CropRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
}>;

/** Browser computes only the candidate authorized by one exact Core-issued Crop ticket. */
export class CoreAuthorizedCrop {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreCropClient,
    private readonly inputs: LocalCropInputPort,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for Crop');
  }

  async run(input: CropRunInput): Promise<CropRunResult> {
    if (!input.requestId || !input.sourceArtifactId) throw new Error('Crop request is incomplete');
    const rect = normalizeRequestRect(input.rect);
    const prepared = await this.core.prepareCrop({ projectId: this.projectId, sourceArtifactId: input.sourceArtifactId, clientRequestId: input.requestId, ...rect });
    const ticket = validateTicket(prepared.ticket, input.sourceArtifactId, rect);
    const sourceBinding = ticket.inputs[0];
    const [sourceHash, source] = await Promise.all([this.inputs.sha256(input.sourceArtifactId), this.inputs.loadImage(input.sourceArtifactId)]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase()) throw new Error('Crop source SHA-256 does not match the Core ticket');
    const bounded = normalizeCropRect(rect, source.width, source.height);
    const output = ticket.expectedOutputs[0];
    if (output.width !== bounded.width || output.height !== bounded.height) throw new Error('Crop source geometry does not match the Core output contract');

    const startedAt = this.clock();
    const rgba = cropRgba8(source.data, source.width, source.height, bounded);
    const preview: PixelImage = Object.freeze({ width: bounded.width, height: bounded.height, data: rgba, format: 'RGBA8', orientation: TOOL.pixelContract.orientation, colorSpace: 'srgb' });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadCropImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, bounded.width, bounded.height);
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
      benchmarkEvidence: Object.freeze({ pixelCount: bounded.width * bounded.height, deterministicTool: TOOL.parameters.exact.deterministicTool }),
    });
    const finalized = await this.core.submitCrop({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected deterministic Crop');
    return Object.freeze({ target: 'LOCAL', runtime: TOOL.browser.runtime, accelerator: TOOL.browser.accelerator, canonicalArtifactId: finalized.artifactId, preview, latencyMs });
  }
}

function normalizeRequestRect(rect: CropRect): CropRect {
  const x = rect?.x; const y = rect?.y; const width = rect?.width; const height = rect?.height;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || x < 0 || y < 0 || width < 1 || height < 1) throw new Error('Crop rectangle must use exact non-negative integer coordinates and positive dimensions');
  return Object.freeze({ x, y, width, height });
}

function validateTicket(ticket: LocalExecutionTicketV2, sourceArtifactId: string, rect: CropRect): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core Crop ticket');
  if (ticket.operation.type !== TOOL.operation.type || ticket.operation.capability !== TOOL.capability || ticket.operation.id !== TOOL.operation.id || ticket.stepId !== TOOL.operation.id) throw new Error('Core ticket does not authorize Crop');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Crop ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== TOOL.inputs[0].kind || ticket.inputs[0].artifactId !== sourceArtifactId || !ticket.inputs[0].sha256 || !/^[a-f0-9]{64}$/i.test(ticket.inputs[0].sha256)) throw new Error('Core Crop ticket source binding is invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== TOOL.output.count || output.kind !== TOOL.output.kind || output.role !== TOOL.output.role || output.mimeTypes?.length !== TOOL.output.mimeTypes.length || output.mimeTypes[0] !== TOOL.output.mimeTypes[0] || output.width !== rect.width || output.height !== rect.height) throw new Error('Core Crop ticket output contract is invalid');
  if (ticket.allowedExecutors.length !== 1) throw new Error('Core Crop ticket must authorize exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== TOOL.executor.kind || executor.toolId !== TOOL.executor.toolId || executor.version !== TOOL.executor.version) throw new Error('Core Crop executor binding is invalid');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.sourceArtifactId !== sourceArtifactId || parameters.x !== rect.x || parameters.y !== rect.y || parameters.width !== rect.width || parameters.height !== rect.height || parameters.deterministicTool !== TOOL.parameters.exact.deterministicTool || parameters.coordinateSpace !== TOOL.parameters.exact.coordinateSpace || parameters.rectangleSemantics !== TOOL.parameters.exact.rectangleSemantics) throw new Error('Core Crop ticket parameters do not match the requested rectangle');
  return ticket;
}

function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== TOOL.output.kind || evidence.role !== TOOL.output.role || evidence.mimeType !== TOOL.output.mimeTypes[0] || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core Crop upload evidence is invalid');
}

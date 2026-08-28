import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import { normalizeResizeDimensions, resizeRgba8, type ResizeDimensions } from '../../platform/creative/deterministic/Resize';
import { RESIZE_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL = RESIZE_TOOL_DEFINITION;

export type CoreResizeClient = Readonly<{
  prepareResize(payload: Readonly<{ projectId: string; sourceArtifactId: string; clientRequestId: string; width: number; height: number }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadResizeImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitResize(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type LocalResizeInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  sha256(artifactId: string): Promise<string>;
}>;

export type ResizeRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  target: ResizeDimensions;
}>;

export type ResizeRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
}>;

/** Browser computes only the candidate authorized by one exact Core-issued Resize ticket. */
export class CoreAuthorizedResize {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreResizeClient,
    private readonly inputs: LocalResizeInputPort,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for Resize');
  }

  async run(input: ResizeRunInput): Promise<ResizeRunResult> {
    if (!input.requestId || !input.sourceArtifactId) throw new Error('Resize request is incomplete');
    const target = normalizeRequestTarget(input.target);
    const prepared = await this.core.prepareResize({ projectId: this.projectId, sourceArtifactId: input.sourceArtifactId, clientRequestId: input.requestId, ...target });
    const ticket = validateTicket(prepared.ticket, input.sourceArtifactId, target);
    const sourceBinding = ticket.inputs[0];
    const [sourceHash, source] = await Promise.all([this.inputs.sha256(input.sourceArtifactId), this.inputs.loadImage(input.sourceArtifactId)]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase()) throw new Error('Resize source SHA-256 does not match the Core ticket');
    const bounded = normalizeResizeDimensions(target, source.width, source.height);
    const output = ticket.expectedOutputs[0];
    if (output.width !== bounded.width || output.height !== bounded.height) throw new Error('Resize target geometry does not match the Core output contract');

    const startedAt = this.clock();
    const rgba = resizeRgba8(source.data, source.width, source.height, bounded);
    const preview: PixelImage = Object.freeze({ width: bounded.width, height: bounded.height, data: rgba, format: 'RGBA8', orientation: TOOL.pixelContract.orientation, colorSpace: 'srgb' });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadResizeImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
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
    const finalized = await this.core.submitResize({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected deterministic Resize');
    return Object.freeze({ target: 'LOCAL', runtime: TOOL.browser.runtime, accelerator: TOOL.browser.accelerator, canonicalArtifactId: finalized.artifactId, preview, latencyMs });
  }
}

function normalizeRequestTarget(target: ResizeDimensions): ResizeDimensions {
  const width = target?.width; const height = target?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('Resize target must use exact positive integer dimensions');
  return Object.freeze({ width, height });
}

function validateTicket(ticket: LocalExecutionTicketV2, sourceArtifactId: string, target: ResizeDimensions): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core Resize ticket');
  if (ticket.operation.type !== TOOL.operation.type || ticket.operation.capability !== TOOL.capability || ticket.operation.id !== TOOL.operation.id || ticket.stepId !== TOOL.operation.id) throw new Error('Core ticket does not authorize Resize');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Resize ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== TOOL.inputs[0].kind || ticket.inputs[0].artifactId !== sourceArtifactId || !ticket.inputs[0].sha256 || !/^[a-f0-9]{64}$/i.test(ticket.inputs[0].sha256)) throw new Error('Core Resize ticket source binding is invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== TOOL.output.count || output.kind !== TOOL.output.kind || output.role !== TOOL.output.role || output.mimeTypes?.length !== TOOL.output.mimeTypes.length || output.mimeTypes[0] !== TOOL.output.mimeTypes[0] || output.width !== target.width || output.height !== target.height) throw new Error('Core Resize ticket output contract is invalid');
  if (ticket.allowedExecutors.length !== 1) throw new Error('Core Resize ticket must authorize exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== TOOL.executor.kind || executor.toolId !== TOOL.executor.toolId || executor.version !== TOOL.executor.version) throw new Error('Core Resize executor binding is invalid');
  const parameters = ticket.operation.parameters;
  const exact = TOOL.parameters.exact;
  if (!parameters || parameters.sourceArtifactId !== sourceArtifactId || parameters.width !== target.width || parameters.height !== target.height || parameters.deterministicTool !== exact.deterministicTool || parameters.coordinateSpace !== exact.coordinateSpace || parameters.interpolation !== exact.interpolation || parameters.fixedPointBits !== exact.fixedPointBits || parameters.rounding !== exact.rounding || parameters.borderPolicy !== exact.borderPolicy || parameters.alphaPolicy !== exact.alphaPolicy || parameters.maxOutputPixels !== exact.maxOutputPixels) throw new Error('Core Resize ticket parameters do not match the requested target');
  return ticket;
}

function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== TOOL.output.kind || evidence.role !== TOOL.output.role || evidence.mimeType !== TOOL.output.mimeTypes[0] || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core Resize upload evidence is invalid');
}

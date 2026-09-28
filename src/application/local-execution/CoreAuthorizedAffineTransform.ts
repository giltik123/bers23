import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import { affineTransformRgba8, normalizeAffineInverseMatrixQ16, type AffineInverseMatrixQ16 } from '../../platform/creative/deterministic/AffineTransform';
import { AFFINE_TRANSFORM_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL = AFFINE_TRANSFORM_TOOL_DEFINITION;

export type CoreAffineTransformClient = Readonly<{
  prepareAffineTransform(payload: Readonly<{ projectId: string; sourceArtifactId: string; clientRequestId: string; affineInverseMatrixQ16: AffineInverseMatrixQ16 }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadAffineTransformImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitAffineTransform(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type LocalAffineTransformInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  sha256(artifactId: string): Promise<string>;
}>;

export type AffineTransformRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  inverseMatrixQ16: AffineInverseMatrixQ16;
}>;

export type AffineTransformPreparedRunInput = Readonly<{
  ticket: LocalExecutionTicketV2;
  sourceArtifactId: string;
  inverseMatrixQ16: AffineInverseMatrixQ16;
}>;

export type AffineTransformPreparedRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  preview: PixelImage;
  latencyMs: number;
  result: LocalExecutionResultV2;
}>;

export type AffineTransformRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
}>;

/** Browser computes only the exact Affine candidate authorized by one Core-issued v2 ticket. */
export class CoreAuthorizedAffineTransform {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreAffineTransformClient,
    private readonly inputs: LocalAffineTransformInputPort,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for Affine transform');
  }

  async run(input: AffineTransformRunInput): Promise<AffineTransformRunResult> {
    if (!input.requestId || !input.sourceArtifactId) throw new Error('Affine transform request is incomplete');
    const inverseMatrixQ16 = normalizeAffineInverseMatrixQ16(input.inverseMatrixQ16);
    const prepared = await this.core.prepareAffineTransform({
      projectId: this.projectId,
      sourceArtifactId: input.sourceArtifactId,
      clientRequestId: input.requestId,
      affineInverseMatrixQ16: inverseMatrixQ16,
    });
    const candidate = await this.runPrepared({ ticket: prepared.ticket, sourceArtifactId: input.sourceArtifactId, inverseMatrixQ16 });
    const finalized = await this.core.submitAffineTransform({ ticketId: candidate.result.ticketId, projectId: this.projectId, result: candidate.result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected deterministic Affine transform');
    return Object.freeze({ target: candidate.target, runtime: candidate.runtime, accelerator: candidate.accelerator, canonicalArtifactId: finalized.artifactId, preview: candidate.preview, latencyMs: candidate.latencyMs });
  }

  async runPrepared(input: AffineTransformPreparedRunInput): Promise<AffineTransformPreparedRunResult> {
    if (!input.sourceArtifactId) throw new Error('Affine prepared request is incomplete');
    const matrix = normalizeAffineInverseMatrixQ16(input.inverseMatrixQ16);
    const ticket = validateTicket(input.ticket, input.sourceArtifactId, matrix);
    const sourceBinding = ticket.inputs[0];
    const [sourceHash, source] = await Promise.all([this.inputs.sha256(input.sourceArtifactId), this.inputs.loadImage(input.sourceArtifactId)]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase()) throw new Error('Affine source SHA-256 does not match the Core ticket');
    if (source.orientation !== 1 || source.colorSpace !== 'srgb') throw new Error('Affine source must use canonical orientation-1 sRGB geometry');
    const output = ticket.expectedOutputs[0];
    if (output.width !== source.width || output.height !== source.height) throw new Error('Affine output geometry must match canonical source');

    const startedAt = this.clock();
    const rgba = affineTransformRgba8(source.data, source.width, source.height, matrix);
    const preview: PixelImage = Object.freeze({ width: source.width, height: source.height, data: rgba, format: 'RGBA8', orientation: TOOL.pixelContract.orientation, colorSpace: 'srgb' });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadAffineTransformImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, source.width, source.height);
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
      benchmarkEvidence: Object.freeze({ pixelCount: source.width * source.height, deterministicTool: TOOL.parameters.exact.deterministicTool }),
    });
    return Object.freeze({ target: 'LOCAL', runtime: TOOL.browser.runtime, accelerator: TOOL.browser.accelerator, preview, latencyMs, result });
  }
}

function validateTicket(ticket: LocalExecutionTicketV2, sourceArtifactId: string, matrix: AffineInverseMatrixQ16): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core Affine ticket');
  if (ticket.operation.type !== TOOL.operation.type || ticket.operation.capability !== TOOL.capability || ticket.operation.id !== TOOL.operation.id || ticket.stepId !== TOOL.operation.id) throw new Error('Core ticket does not authorize Affine transform');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Affine ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== TOOL.inputs[0].kind || ticket.inputs[0].artifactId !== sourceArtifactId || !ticket.inputs[0].sha256 || !/^[a-f0-9]{64}$/i.test(ticket.inputs[0].sha256)) throw new Error('Affine ticket source binding is invalid');
  if (ticket.expectedOutputs.length !== 1 || ticket.expectedOutputs[0].kind !== TOOL.output.kind || ticket.expectedOutputs[0].role !== TOOL.output.role || ticket.expectedOutputs[0].mimeTypes?.[0] !== TOOL.output.mimeTypes[0]) throw new Error('Affine ticket output contract is invalid');
  if (ticket.allowedExecutors.length !== 1 || ticket.allowedExecutors[0].kind !== TOOL.executor.kind || ticket.allowedExecutors[0].toolId !== TOOL.executor.toolId || ticket.allowedExecutors[0].version !== TOOL.executor.version) throw new Error('Affine ticket executor binding is invalid');
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  const exact = TOOL.parameters.exact;
  if (
    parameters?.sourceArtifactId !== sourceArtifactId
    || parameters?.m00Q16 !== matrix.m00Q16 || parameters?.m01Q16 !== matrix.m01Q16 || parameters?.txQ16 !== matrix.txQ16
    || parameters?.m10Q16 !== matrix.m10Q16 || parameters?.m11Q16 !== matrix.m11Q16 || parameters?.tyQ16 !== matrix.tyQ16
    || parameters?.deterministicTool !== exact.deterministicTool || parameters?.coordinateSpace !== exact.coordinateSpace
    || parameters?.matrix !== exact.matrix || parameters?.fixedPointBits !== exact.fixedPointBits
    || parameters?.interpolation !== exact.interpolation || parameters?.rounding !== exact.rounding
    || parameters?.borderPolicy !== exact.borderPolicy || parameters?.alphaPolicy !== exact.alphaPolicy
    || parameters?.outputGeometry !== exact.outputGeometry || parameters?.maxOutputPixels !== exact.maxOutputPixels
  ) throw new Error('Core Affine ticket parameters do not match the requested matrix');
  return ticket;
}

function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== TOOL.output.kind || evidence.role !== TOOL.output.role || evidence.mimeType !== TOOL.output.mimeTypes[0] || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core Affine upload evidence is invalid');
}

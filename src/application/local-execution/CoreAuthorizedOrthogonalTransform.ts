import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import {
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  orthogonalTransformRgba8,
  type OrthogonalTransformMode,
} from '../../platform/creative/deterministic/OrthogonalTransform';
import { ORTHOGONAL_TRANSFORM_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION;

export type CoreOrthogonalTransformClient = Readonly<{
  prepareOrthogonalTransform(payload: Readonly<{ projectId: string; sourceArtifactId: string; clientRequestId: string; mode: OrthogonalTransformMode }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadOrthogonalTransformImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitOrthogonalTransform(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type LocalOrthogonalTransformInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  sha256(artifactId: string): Promise<string>;
}>;

export type OrthogonalTransformRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  mode: OrthogonalTransformMode;
}>;

export type OrthogonalTransformRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
  mode: OrthogonalTransformMode;
}>;

/** Browser computes only the byte-exact candidate authorized by one Core-issued orthogonal-transform ticket. */
export class CoreAuthorizedOrthogonalTransform {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreOrthogonalTransformClient,
    private readonly inputs: LocalOrthogonalTransformInputPort,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for orthogonal transform');
  }

  async run(input: OrthogonalTransformRunInput): Promise<OrthogonalTransformRunResult> {
    if (!input.requestId || !input.sourceArtifactId) throw new Error('Orthogonal transform request is incomplete');
    const mode = normalizeOrthogonalTransformMode(input.mode);
    const prepared = await this.core.prepareOrthogonalTransform({ projectId: this.projectId, sourceArtifactId: input.sourceArtifactId, clientRequestId: input.requestId, mode });
    const ticket = validateTicket(prepared.ticket, input.sourceArtifactId, mode);
    const sourceBinding = ticket.inputs[0];
    const [sourceHash, source] = await Promise.all([this.inputs.sha256(input.sourceArtifactId), this.inputs.loadImage(input.sourceArtifactId)]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase()) throw new Error('Orthogonal transform source SHA-256 does not match the Core ticket');
    if (source.format !== 'RGBA8' || source.orientation !== 1 || source.colorSpace !== 'srgb') throw new Error('Orthogonal transform source must be canonical orientation-1 RGBA8/sRGB');

    const geometry = orthogonalTransformOutputGeometry(source.width, source.height, mode);
    const output = ticket.expectedOutputs[0];
    if (output.width !== geometry.width || output.height !== geometry.height) throw new Error('Orthogonal transform geometry does not match the Core output contract');

    const startedAt = this.clock();
    const rgba = orthogonalTransformRgba8(source.data, source.width, source.height, mode);
    const preview: PixelImage = Object.freeze({ width: geometry.width, height: geometry.height, data: rgba, format: 'RGBA8', orientation: TOOL.pixelContract.orientation, colorSpace: 'srgb' });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadOrthogonalTransformImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, geometry.width, geometry.height);
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
      benchmarkEvidence: Object.freeze({ pixelCount: geometry.width * geometry.height, deterministicTool: TOOL.parameters.exact.deterministicTool, mode }),
    });
    const finalized = await this.core.submitOrthogonalTransform({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected deterministic orthogonal transform');
    return Object.freeze({ target: 'LOCAL', runtime: TOOL.browser.runtime, accelerator: TOOL.browser.accelerator, canonicalArtifactId: finalized.artifactId, preview, latencyMs, mode });
  }
}

function validateTicket(ticket: LocalExecutionTicketV2, sourceArtifactId: string, mode: OrthogonalTransformMode): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core orthogonal-transform ticket');
  if (ticket.operation.type !== TOOL.operation.type || ticket.operation.capability !== TOOL.capability || ticket.operation.id !== TOOL.operation.id || ticket.stepId !== TOOL.operation.id) throw new Error('Core ticket does not authorize orthogonal transform');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Orthogonal-transform ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== TOOL.inputs[0].kind || ticket.inputs[0].artifactId !== sourceArtifactId || !ticket.inputs[0].sha256 || !/^[a-f0-9]{64}$/i.test(ticket.inputs[0].sha256)) throw new Error('Core orthogonal-transform ticket source binding is invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== TOOL.output.count || output.kind !== TOOL.output.kind || output.role !== TOOL.output.role || output.mimeTypes?.length !== TOOL.output.mimeTypes.length || output.mimeTypes[0] !== TOOL.output.mimeTypes[0] || !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height) || Number(output.width) < 1 || Number(output.height) < 1) throw new Error('Core orthogonal-transform ticket output contract is invalid');
  if (ticket.allowedExecutors.length !== 1) throw new Error('Core orthogonal-transform ticket must authorize exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== TOOL.executor.kind || executor.toolId !== TOOL.executor.toolId || executor.version !== TOOL.executor.version) throw new Error('Core orthogonal-transform executor binding is invalid');
  const parameters = ticket.operation.parameters;
  const exact = TOOL.parameters.exact;
  if (!parameters || parameters.sourceArtifactId !== sourceArtifactId || parameters.mode !== mode || parameters.deterministicTool !== exact.deterministicTool || parameters.coordinateSpace !== exact.coordinateSpace || parameters.mapping !== exact.mapping || parameters.interpolation !== exact.interpolation || parameters.rounding !== exact.rounding || parameters.alphaPolicy !== exact.alphaPolicy) throw new Error('Core orthogonal-transform ticket parameters do not match the requested transform');
  return ticket;
}

function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== TOOL.output.kind || evidence.role !== TOOL.output.role || evidence.mimeType !== TOOL.output.mimeTypes[0] || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core orthogonal-transform upload evidence is invalid');
}

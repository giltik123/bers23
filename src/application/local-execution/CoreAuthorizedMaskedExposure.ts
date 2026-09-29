import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import { MASKED_EXPOSURE_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import {
  MASKED_EXPOSURE_OPERATION,
  maskedExposureRgba8,
  normalizeMaskedExposureEighthStops,
} from '../../platform/creative/deterministic/MaskedExposure';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL = MASKED_EXPOSURE_TOOL_DEFINITION;

export type CoreMaskedExposureClient = Readonly<{
  prepareMaskedExposure(payload: Readonly<{ projectId: string; sourceArtifactId: string; maskArtifactId: string; eighthStops: number; clientRequestId: string }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadMaskedExposureImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitMaskedExposure(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type MaskedExposureInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  loadMask(artifactId: string): Promise<Readonly<{ width: number; height: number; alpha: Uint8Array }>>;
  sha256(artifactId: string): Promise<string>;
}>;

export type MaskedExposureRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  maskArtifactId: string;
  eighthStops: number;
}>;

export type MaskedExposureRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
  eighthStops: number;
}>;

/** Browser executes only the exact IMAGE+MASK candidate authorized by one Core-issued ticket. */
export class CoreAuthorizedMaskedExposure {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreMaskedExposureClient,
    private readonly inputs: MaskedExposureInputPort,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for Masked Exposure');
  }

  async run(input: MaskedExposureRunInput): Promise<MaskedExposureRunResult> {
    if (!input.requestId || !input.sourceArtifactId || !input.maskArtifactId || input.sourceArtifactId === input.maskArtifactId) throw new Error('Masked Exposure request is incomplete');
    const eighthStops = normalizeMaskedExposureEighthStops(input.eighthStops);
    const prepared = await this.core.prepareMaskedExposure({
      projectId: this.projectId,
      sourceArtifactId: input.sourceArtifactId,
      maskArtifactId: input.maskArtifactId,
      eighthStops,
      clientRequestId: input.requestId,
    });
    const ticket = validateTicket(prepared.ticket, input, eighthStops);
    const sourceBinding = ticket.inputs.find(binding => binding.kind === TOOL.inputs[0].kind && binding.artifactId === input.sourceArtifactId)!;
    const maskBinding = ticket.inputs.find(binding => binding.kind === TOOL.inputs[1].kind && binding.artifactId === input.maskArtifactId)!;
    const [sourceHash, maskHash, source, mask] = await Promise.all([
      this.inputs.sha256(input.sourceArtifactId),
      this.inputs.sha256(input.maskArtifactId),
      this.inputs.loadImage(input.sourceArtifactId),
      this.inputs.loadMask(input.maskArtifactId),
    ]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase() || maskHash.toLowerCase() !== maskBinding.sha256!.toLowerCase()) throw new Error('Masked Exposure input SHA-256 does not match the Core ticket');
    if (source.format !== 'RGBA8' || source.orientation !== 1 || source.colorSpace !== 'srgb') throw new Error('Masked Exposure source must be canonical orientation-1 RGBA8/sRGB');
    if (source.width !== mask.width || source.height !== mask.height || mask.alpha.byteLength !== source.width * source.height) throw new Error('Masked Exposure IMAGE and MASK geometry mismatch');
    const output = ticket.expectedOutputs[0];
    if (source.width !== output.width || source.height !== output.height) throw new Error('Masked Exposure source geometry does not match the Core output contract');

    const startedAt = this.clock();
    const rgba = maskedExposureRgba8(source.data, mask.alpha, source.width, source.height, eighthStops);
    const preview: PixelImage = Object.freeze({ ...source, data: rgba, orientation: TOOL.pixelContract.orientation });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadMaskedExposureImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
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
      benchmarkEvidence: Object.freeze({ pixelCount: source.width * source.height, deterministicTool: TOOL.parameters.exact.deterministicTool, eighthStops }),
    });
    const finalized = await this.core.submitMaskedExposure({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected deterministic Masked Exposure');
    return Object.freeze({ target: 'LOCAL', runtime: TOOL.browser.runtime, accelerator: TOOL.browser.accelerator, canonicalArtifactId: finalized.artifactId, preview, latencyMs, eighthStops });
  }
}

function validateTicket(ticket: LocalExecutionTicketV2, input: MaskedExposureRunInput, eighthStops: number): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core Masked Exposure ticket');
  if (ticket.operation.type !== MASKED_EXPOSURE_OPERATION || ticket.operation.capability !== TOOL.capability || ticket.operation.id !== TOOL.operation.id || ticket.stepId !== TOOL.operation.id) throw new Error('Core ticket does not authorize Masked Exposure');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Masked Exposure ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== TOOL.inputs.length) throw new Error('Masked Exposure ticket must bind exactly IMAGE + MASK');
  const source = ticket.inputs.find(binding => binding.kind === TOOL.inputs[0].kind && binding.artifactId === input.sourceArtifactId);
  const mask = ticket.inputs.find(binding => binding.kind === TOOL.inputs[1].kind && binding.artifactId === input.maskArtifactId);
  if (!source?.sha256 || !mask?.sha256 || !/^[a-f0-9]{64}$/i.test(source.sha256) || !/^[a-f0-9]{64}$/i.test(mask.sha256)) throw new Error('Core Masked Exposure input bindings are invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== TOOL.output.count || output.kind !== TOOL.output.kind || output.role !== TOOL.output.role || output.width === undefined || output.height === undefined || output.mimeTypes?.length !== TOOL.output.mimeTypes.length || output.mimeTypes[0] !== TOOL.output.mimeTypes[0]) throw new Error('Core Masked Exposure output contract is invalid');
  if (ticket.allowedExecutors.length !== 1) throw new Error('Core Masked Exposure ticket must authorize exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== TOOL.executor.kind || executor.toolId !== TOOL.executor.toolId || executor.version !== TOOL.executor.version) throw new Error('Core Masked Exposure executor binding is invalid');
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  const exact = TOOL.parameters.exact;
  if (!parameters
      || parameters.sourceArtifactId !== input.sourceArtifactId
      || parameters.maskArtifactId !== input.maskArtifactId
      || parameters.eighthStops !== eighthStops
      || parameters.deterministicTool !== exact.deterministicTool
      || parameters.coordinateSpace !== exact.coordinateSpace
      || parameters.transferDomain !== exact.transferDomain
      || parameters.gainEncoding !== exact.gainEncoding
      || parameters.stopDenominator !== exact.stopDenominator
      || parameters.gainRounding !== exact.gainRounding
      || parameters.maskBlend !== exact.maskBlend
      || parameters.alphaPolicy !== exact.alphaPolicy) {
    throw new Error('Core Masked Exposure ticket parameters do not match the requested operation');
  }
  return ticket;
}

function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== TOOL.output.kind || evidence.role !== TOOL.output.role || evidence.mimeType !== TOOL.output.mimeTypes[0] || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core Masked Exposure upload evidence is invalid');
}

import type {
  LocalExecutionOutputEvidence,
  LocalExecutionResultV2,
  LocalExecutionRuntime,
  LocalExecutionTicketV2,
  LocalExecutionModelExecutorBinding,
} from '../../platform/creative/canonical';
import type { ExecutionProvider } from '../../platform/creative/local-ai/types';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';
import {
  MAX_SUPER_RESOLUTION_OUTPUT_PIXELS,
  REAL_ESRGAN_UPSCALE_CAPABILITY,
  SUPER_RESOLUTION_ALPHA_POLICY,
  SUPER_RESOLUTION_OPERATION,
  SUPER_RESOLUTION_SCALE,
  SUPER_RESOLUTION_STEP_ID,
} from '../../platform/creative/super-resolution/SuperResolutionContract';

export type CoreSuperResolutionClient = Readonly<{
  prepareSuperResolution(payload: Readonly<{ projectId: string; sourceArtifactId: string; clientRequestId: string }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitSuperResolution(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type LocalSuperResolutionInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  sha256(artifactId: string): Promise<string>;
}>;

export type LocalSuperResolutionModelRun = Readonly<{
  width: number;
  height: number;
  data: Float32Array;
  runtime: Exclude<LocalExecutionRuntime, 'BROWSER_JS'>;
  accelerator: ExecutionProvider | 'UNKNOWN';
  latencyMs: number;
  memoryBytes?: number;
  vramBytes?: number;
  energyEstimate?: number;
  benchmarkEvidence?: Readonly<Record<string, number | string | boolean>>;
}>;

/**
 * Port to an already trusted/installed local model runtime. The application adapter
 * cannot download, approve, select or promote model bytes. It passes the exact MODEL
 * binding authorized by the Core v2 ticket and receives only model output + metrics.
 */
export type LocalSuperResolutionModelPort = Readonly<{
  infer(input: Readonly<{
    requestId: string;
    model: LocalExecutionModelExecutorBinding;
    width: number;
    height: number;
    rgbNchw: Float32Array;
  }>): Promise<LocalSuperResolutionModelRun>;
}>;

export type SuperResolutionRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
}>;

export type SuperResolutionRunResult = Readonly<{
  target: 'LOCAL';
  model: Readonly<{ modelId: string; version: string }>;
  runtime: Exclude<LocalExecutionRuntime, 'BROWSER_JS'>;
  accelerator: ExecutionProvider | 'UNKNOWN';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
  memoryBytes?: number;
}>;

/**
 * Browser application adapter for Core-authorized model-backed x4 super-resolution.
 * Canonical identity, model allowlisting and final publication remain server-owned.
 * This adapter only performs preprocessing, invokes an already trusted model port,
 * materializes the candidate PNG and reports evidence against the Core ticket.
 */
export class CoreAuthorizedSuperResolution {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreSuperResolutionClient,
    private readonly inputs: LocalSuperResolutionInputPort,
    private readonly model: LocalSuperResolutionModelPort,
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for local super-resolution');
  }

  async run(input: SuperResolutionRunInput): Promise<SuperResolutionRunResult> {
    if (!input.requestId || !input.sourceArtifactId) throw new Error('Super-resolution request is incomplete');
    const prepared = await this.core.prepareSuperResolution({
      projectId: this.projectId,
      sourceArtifactId: input.sourceArtifactId,
      clientRequestId: input.requestId,
    });
    const ticket = validateTicket(prepared.ticket, input);
    const executor = ticket.allowedExecutors[0] as LocalExecutionModelExecutorBinding;
    const sourceBinding = ticket.inputs[0];

    const [sourceHash, source] = await Promise.all([
      this.inputs.sha256(input.sourceArtifactId),
      this.inputs.loadImage(input.sourceArtifactId),
    ]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase()) throw new Error('Local model input SHA-256 does not match the Core ticket');
    assertOpaqueSource(source);
    const expected = ticket.expectedOutputs[0];
    assertGeometry(source.width, source.height, expected.width!, expected.height!);

    const rgbNchw = rgba8ToRgbNchw(source);
    const inference = await this.model.infer({
      requestId: ticket.requestId,
      model: executor,
      width: source.width,
      height: source.height,
      rgbNchw,
    });
    if (inference.runtime === 'BROWSER_JS') throw new Error('Model-backed execution cannot claim deterministic browser runtime');
    if (!Number.isFinite(inference.latencyMs) || inference.latencyMs < 0) throw new Error('Local model latency evidence is invalid');
    if (inference.width !== expected.width || inference.height !== expected.height) throw new Error('Local model output geometry does not match the Core ticket');
    if (!(inference.data instanceof Float32Array) || inference.data.length !== expected.width! * expected.height! * 3) throw new Error('Local model output tensor is malformed');

    const preview = rgbNchwToOpaqueRgba8(inference.data, expected.width!, expected.height!);
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, expected.width!, expected.height!);

    const result: LocalExecutionResultV2 = Object.freeze({
      ticketId: ticket.ticketId,
      ticketVersion: ticket.version,
      requestId: ticket.requestId,
      workflowId: ticket.workflowId,
      stepId: ticket.stepId,
      nonce: ticket.nonce,
      executor: Object.freeze({ ...executor }),
      runtime: inference.runtime,
      accelerator: inference.accelerator,
      outputs: Object.freeze([Object.freeze({ ...evidence })]),
      metrics: Object.freeze({
        latencyMs: inference.latencyMs,
        memoryBytes: inference.memoryBytes,
        vramBytes: inference.vramBytes,
        energyEstimate: inference.energyEstimate,
      }),
      benchmarkEvidence: Object.freeze({
        ...(inference.benchmarkEvidence ?? {}),
        inputPixels: source.width * source.height,
        outputPixels: expected.width! * expected.height!,
        scale: SUPER_RESOLUTION_SCALE,
        postprocess: 'CLAMP_0_1',
        alphaPolicy: SUPER_RESOLUTION_ALPHA_POLICY,
      }),
    });
    const finalized = await this.core.submitSuperResolution({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected model-backed super-resolution');
    return Object.freeze({
      target: 'LOCAL',
      model: Object.freeze({ modelId: executor.modelId, version: executor.version }),
      runtime: inference.runtime,
      accelerator: inference.accelerator,
      canonicalArtifactId: finalized.artifactId,
      preview,
      latencyMs: inference.latencyMs,
      memoryBytes: inference.memoryBytes,
    });
  }
}

function validateTicket(ticket: LocalExecutionTicketV2, input: SuperResolutionRunInput): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core model local execution ticket');
  if (ticket.operation.type !== SUPER_RESOLUTION_OPERATION || ticket.operation.capability !== REAL_ESRGAN_UPSCALE_CAPABILITY || ticket.operation.id !== SUPER_RESOLUTION_STEP_ID || ticket.stepId !== SUPER_RESOLUTION_STEP_ID) throw new Error('Core ticket does not authorize super-resolution');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Local model ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== 1) throw new Error('Super-resolution ticket must bind exactly one canonical IMAGE');
  const source = ticket.inputs[0];
  if (source.kind !== 'image' || source.artifactId !== input.sourceArtifactId || !source.sha256 || !/^[a-f0-9]{64}$/i.test(source.sha256)) throw new Error('Core model ticket input binding is invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || !output.width || !output.height || !output.mimeTypes?.includes('image/png')) throw new Error('Core model ticket output contract is invalid');
  if (ticket.allowedExecutors.length !== 1 || ticket.allowedExecutors[0].kind !== 'MODEL') throw new Error('Core super-resolution ticket must authorize exactly one MODEL executor');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.sourceArtifactId !== input.sourceArtifactId || parameters.scale !== SUPER_RESOLUTION_SCALE || parameters.alphaPolicy !== SUPER_RESOLUTION_ALPHA_POLICY) throw new Error('Core model ticket parameters do not match the requested super-resolution operation');
  return ticket;
}

function assertOpaqueSource(source: PixelImage): void {
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1 || !(source.data instanceof Uint8ClampedArray) || source.data.length !== source.width * source.height * 4) throw new Error('Canonical source image is malformed');
  for (let offset = 3; offset < source.data.length; offset += 4) if (source.data[offset] !== 255) throw new Error('Super-resolution v1 accepts opaque source images only');
}

function assertGeometry(sourceWidth: number, sourceHeight: number, outputWidth: number, outputHeight: number): void {
  if (outputWidth !== sourceWidth * SUPER_RESOLUTION_SCALE || outputHeight !== sourceHeight * SUPER_RESOLUTION_SCALE) throw new Error('Core super-resolution ticket does not encode exact x4 geometry');
  const outputPixels = outputWidth * outputHeight;
  if (!Number.isSafeInteger(outputPixels) || outputPixels < 1 || outputPixels > MAX_SUPER_RESOLUTION_OUTPUT_PIXELS) throw new Error('Super-resolution output exceeds the safe full-frame pixel limit');
}

function rgba8ToRgbNchw(source: PixelImage): Float32Array {
  const pixels = source.width * source.height;
  const output = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    const rgba = index * 4;
    output[index] = source.data[rgba] / 255;
    output[pixels + index] = source.data[rgba + 1] / 255;
    output[pixels * 2 + index] = source.data[rgba + 2] / 255;
  }
  return output;
}

function rgbNchwToOpaqueRgba8(rgb: Float32Array, width: number, height: number): PixelImage {
  const pixels = width * height;
  const data = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    const rgba = index * 4;
    // Uint8ClampedArray applies ECMAScript ToUint8Clamp (nearest, ties-to-even),
    // matching NumPy round() used by the pinned upstream uint8 postprocess.
    data[rgba] = clamp01(rgb[index]) * 255;
    data[rgba + 1] = clamp01(rgb[pixels + index]) * 255;
    data[rgba + 2] = clamp01(rgb[pixels * 2 + index]) * 255;
    data[rgba + 3] = 255;
  }
  return Object.freeze({ width, height, data });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Local model output contains non-finite pixels');
  return Math.min(1, Math.max(0, value));
}

function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== 'image' || evidence.role !== 'COMPOSITE' || evidence.mimeType !== 'image/png' || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core model upload evidence is invalid');
}

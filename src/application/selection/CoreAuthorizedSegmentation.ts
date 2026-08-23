import type { LocalExecutionOutputEvidence, LocalExecutionResult, LocalExecutionTicket } from '../../platform/creative/canonical';
import type { DeviceExecutionAdmissionDecision, ModelManifest, PrivacyMode } from '../../platform/creative/local-ai';
import type { InteractiveSegmentationPort, InteractiveSegmentationResult, SelectionCandidate } from './contracts';

export type CoreLocalExecutionClient = Readonly<{
  prepareSegmentation(payload: Readonly<{ projectId: string; inputArtifactId: string; clientRequestId: string; analysis: unknown; points: unknown }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicket }>>;
  uploadMask(payload: Readonly<{ ticketId: string; projectId: string; width: number; height: number; alpha: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submit(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResult }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;
export type DeviceExecutionAdmissionPort = Readonly<{
  admit(model: ModelManifest, requiredCapabilities: readonly string[], privacyMode?: PrivacyMode): Promise<DeviceExecutionAdmissionDecision>;
}>;
export type LocalInputIntegrityPort = Readonly<{ sha256(artifactId: string): Promise<string> }>;

/**
 * Browser-side execution adapter for a Core-authorized ON_DEVICE segmentation step.
 * Core owns the ticket and canonical Artifact identity; this adapter only runs the
 * already-authorized computation after device/model/input admission.
 */
export class CoreAuthorizedSegmentation implements InteractiveSegmentationPort {
  readonly #cancelled = new Set<string>();
  constructor(
    private readonly projectId: string,
    private readonly local: InteractiveSegmentationPort,
    private readonly core: CoreLocalExecutionClient,
    private readonly deviceAdmission: DeviceExecutionAdmissionPort,
    private readonly model: ModelManifest,
    private readonly inputIntegrity: LocalInputIntegrityPort,
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for local segmentation');
  }

  cancel(requestId: string): void {
    if (!requestId) return;
    this.#cancelled.add(requestId);
    this.local.cancel(requestId);
  }

  async segment(input: Parameters<InteractiveSegmentationPort['segment']>[0]): Promise<InteractiveSegmentationResult> {
    if (input.privacyMode !== 'LOCAL_ONLY') throw new Error('Core-authorized interactive segmentation requires LOCAL_ONLY privacy mode');
    try {
      const prepared = await this.core.prepareSegmentation({ projectId: this.projectId, inputArtifactId: input.imageArtifactId, clientRequestId: input.requestId, analysis: input.analysis, points: input.points });
      this.assertCurrent(input.requestId);
      const ticket = validateTicket(prepared.ticket, input);
      if (!ticket.allowedModels.some(allowed => allowed.modelId === this.model.modelId && allowed.version === this.model.version)) throw new Error('Device model is not authorized by the Core ticket');
      const binding = ticket.inputs.find(candidate => candidate.artifactId === input.imageArtifactId && candidate.kind === 'image')!;
      const actualInputHash = await this.inputIntegrity.sha256(input.imageArtifactId);
      this.assertCurrent(input.requestId);
      if (actualInputHash.toLowerCase() !== binding.sha256!.toLowerCase()) throw new Error('Local execution input SHA-256 does not match the Core ticket');
      const admission = await this.deviceAdmission.admit(this.model, ['INTERACTIVE_SEGMENTATION'], 'LOCAL_ONLY');
      this.assertCurrent(input.requestId);
      if (!admission.allowed) throw new Error(`Local device/model admission blocked: ${admission.reasons.join('; ') || 'unsuitable device or model'}`);
      const local = await this.local.segment(input);
      this.assertCurrent(input.requestId);
      if (local.target !== 'LOCAL') throw new Error('Local segmentation runtime returned a non-local target');
      if (!local.runtime || !local.accelerator) throw new Error('Local segmentation runtime evidence is incomplete');
      if (local.modelId !== admission.model.modelId || local.modelVersion !== admission.model.version) throw new Error('Executed local model differs from the admitted device model');
      const candidate = bestCandidate(local.candidates, input.analysis.analysisWidth, input.analysis.analysisHeight);
      if (!candidate) throw new Error('Segmentation returned no valid mask');
      const originalAlpha = upscale(candidate.alpha, candidate.width, candidate.height, input.analysis.originalWidth, input.analysis.originalHeight);
      const evidence = await this.core.uploadMask({ ticketId: ticket.ticketId, projectId: this.projectId, width: input.analysis.originalWidth, height: input.analysis.originalHeight, alpha: originalAlpha });
      this.assertCurrent(input.requestId);
      const result: LocalExecutionResult = Object.freeze({
        ticketId: ticket.ticketId,
        ticketVersion: ticket.version,
        requestId: ticket.requestId,
        workflowId: ticket.workflowId,
        stepId: ticket.stepId,
        nonce: ticket.nonce,
        model: Object.freeze({ modelId: local.modelId, version: local.modelVersion }),
        runtime: local.runtime,
        accelerator: local.accelerator,
        outputs: Object.freeze([Object.freeze({ ...evidence })]),
        metrics: Object.freeze({ latencyMs: local.latencyMs, memoryBytes: local.memoryBytes }),
        benchmarkEvidence: Object.freeze({
          analysisWidth: input.analysis.analysisWidth,
          analysisHeight: input.analysis.analysisHeight,
          promptCount: input.points.length,
          deviceTier: admission.device.tier,
          runtimeWasm: admission.runtimes.WASM,
          runtimeWebgpu: admission.runtimes.WEBGPU,
        }),
      });
      const finalized = await this.core.submit({ ticketId: ticket.ticketId, projectId: this.projectId, result });
      this.assertCurrent(input.requestId);
      if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected the local segmentation outcome');
      return Object.freeze({ ...local, canonicalArtifactId: finalized.artifactId, candidates: Object.freeze([candidate]) });
    } finally {
      this.#cancelled.delete(input.requestId);
    }
  }

  private assertCurrent(requestId: string): void { if (this.#cancelled.has(requestId)) throw new Error('Inference cancelled'); }
}

function validateTicket(ticket: LocalExecutionTicket, input: Parameters<InteractiveSegmentationPort['segment']>[0]): LocalExecutionTicket {
  if (!ticket || ticket.version !== '1' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core local execution ticket');
  if (ticket.operation.type !== 'segment' || ticket.operation.capability !== 'local:mobilesam:segment:v1') throw new Error('Core ticket does not authorize interactive segmentation');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Local execution ticket contains forbidden cloud cost authority');
  const binding = ticket.inputs.find(candidate => candidate.artifactId === input.imageArtifactId && candidate.kind === 'image');
  if (!binding) throw new Error('Core ticket input binding does not match the selected image');
  if (!binding.sha256 || !/^[a-f0-9]{64}$/i.test(binding.sha256)) throw new Error('Core ticket is missing canonical input integrity evidence');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'mask' || output.role !== 'MASK' || output.width !== input.analysis.originalWidth || output.height !== input.analysis.originalHeight || !output.mimeTypes?.includes('application/octet-stream')) throw new Error('Core ticket MASK output contract does not match the source geometry');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.selectionRequestId !== input.requestId || JSON.stringify(parameters.analysis) !== JSON.stringify(input.analysis) || JSON.stringify(parameters.points) !== JSON.stringify(input.points)) throw new Error('Core ticket segmentation parameters do not match the requested operation');
  if (!Array.isArray(ticket.allowedModels) || ticket.allowedModels.length < 1) throw new Error('Core ticket has no approved local model');
  return ticket;
}

function bestCandidate(candidates: readonly SelectionCandidate[], width: number, height: number): SelectionCandidate | undefined {
  return [...candidates].filter(candidate => candidate.width === width && candidate.height === height && candidate.alpha.length === width * height).sort((a, b) => b.score - a.score)[0];
}
function upscale(alpha: Uint8Array, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Uint8Array {
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) output[y * targetWidth + x] = alpha[Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight)) * sourceWidth + Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth))];
  return output;
}

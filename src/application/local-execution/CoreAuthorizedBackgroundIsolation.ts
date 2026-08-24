import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical/index.ts';
import { BACKGROUND_ISOLATION_CAPABILITY, BACKGROUND_ISOLATION_TOOL_ID, BACKGROUND_ISOLATION_TOOL_VERSION, isolateBackgroundRgba } from '../../platform/creative/deterministic/BackgroundIsolation.ts';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng.ts';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit.ts';

export type CoreDeterministicImageClient = Readonly<{
  prepareBackgroundIsolation(payload: Readonly<{ projectId: string; sourceArtifactId: string; maskArtifactId: string; clientRequestId: string }>): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>>;
  uploadImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<LocalExecutionOutputEvidence>;
  submitBackgroundIsolation(payload: Readonly<{ ticketId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<Readonly<{ executionId: string; status: string; artifactId?: string; verification?: Readonly<{ valid: boolean }> }>>;
}>;

export type LocalDeterministicInputPort = Readonly<{
  loadImage(artifactId: string): Promise<PixelImage>;
  loadMask(artifactId: string): Promise<Readonly<{ width: number; height: number; alpha: Uint8Array }>>;
  sha256(artifactId: string): Promise<string>;
}>;

export type BackgroundIsolationRunInput = Readonly<{
  requestId: string;
  sourceArtifactId: string;
  maskArtifactId: string;
}>;

export type BackgroundIsolationRunResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  canonicalArtifactId: string;
  preview: PixelImage;
  latencyMs: number;
}>;

/**
 * Browser application adapter for Core-authorized deterministic background isolation.
 * No model is selected here: this capability is a local tool. Model-backed capabilities
 * continue through the separate device/model admission path.
 */
export class CoreAuthorizedBackgroundIsolation {
  constructor(
    private readonly projectId: string,
    private readonly core: CoreDeterministicImageClient,
    private readonly inputs: LocalDeterministicInputPort,
    private readonly clock: () => number = () => performance.now(),
  ) {
    if (!projectId) throw new Error('Canonical project identity is required for deterministic local execution');
  }

  async run(input: BackgroundIsolationRunInput): Promise<BackgroundIsolationRunResult> {
    if (!input.requestId || !input.sourceArtifactId || !input.maskArtifactId) throw new Error('Background isolation request is incomplete');
    const prepared = await this.core.prepareBackgroundIsolation({ projectId: this.projectId, sourceArtifactId: input.sourceArtifactId, maskArtifactId: input.maskArtifactId, clientRequestId: input.requestId });
    const ticket = validateTicket(prepared.ticket, input);

    const sourceBinding = ticket.inputs.find(binding => binding.kind === 'image' && binding.artifactId === input.sourceArtifactId)!;
    const maskBinding = ticket.inputs.find(binding => binding.kind === 'mask' && binding.artifactId === input.maskArtifactId)!;
    const [sourceHash, maskHash, source, mask] = await Promise.all([
      this.inputs.sha256(input.sourceArtifactId),
      this.inputs.sha256(input.maskArtifactId),
      this.inputs.loadImage(input.sourceArtifactId),
      this.inputs.loadMask(input.maskArtifactId),
    ]);
    if (sourceHash.toLowerCase() !== sourceBinding.sha256!.toLowerCase() || maskHash.toLowerCase() !== maskBinding.sha256!.toLowerCase()) throw new Error('Local deterministic input SHA-256 does not match the Core ticket');
    if (source.width !== mask.width || source.height !== mask.height) throw new Error('Local deterministic IMAGE and MASK geometry mismatch');
    const output = ticket.expectedOutputs[0];
    if (source.width !== output.width || source.height !== output.height) throw new Error('Local deterministic source geometry does not match the Core output contract');

    const startedAt = this.clock();
    const rgba = isolateBackgroundRgba(source.data, mask.alpha, source.width, source.height);
    const preview = Object.freeze({ ...source, data: rgba, orientation: 1 as const });
    const png = await encodeDeterministicRgbaPng(preview);
    const evidence = await this.core.uploadImage({ ticketId: ticket.ticketId, projectId: this.projectId, bytes: png });
    assertEvidence(evidence, output.width!, output.height!);
    const latencyMs = Math.max(0, this.clock() - startedAt);
    const result: LocalExecutionResultV2 = Object.freeze({
      ticketId: ticket.ticketId,
      ticketVersion: ticket.version,
      requestId: ticket.requestId,
      workflowId: ticket.workflowId,
      stepId: ticket.stepId,
      nonce: ticket.nonce,
      executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: BACKGROUND_ISOLATION_TOOL_ID, version: BACKGROUND_ISOLATION_TOOL_VERSION }),
      runtime: 'BROWSER_JS',
      accelerator: 'cpu',
      outputs: Object.freeze([Object.freeze({ ...evidence })]),
      metrics: Object.freeze({ latencyMs }),
      benchmarkEvidence: Object.freeze({ pixelCount: source.width * source.height, deterministicTool: `${BACKGROUND_ISOLATION_TOOL_ID}@${BACKGROUND_ISOLATION_TOOL_VERSION}` }),
    });
    const finalized = await this.core.submitBackgroundIsolation({ ticketId: ticket.ticketId, projectId: this.projectId, result });
    if (finalized.status !== 'SUCCESS' || finalized.verification?.valid === false || !finalized.artifactId) throw new Error('Core rejected deterministic background isolation');
    return Object.freeze({ target: 'LOCAL', runtime: 'BROWSER_JS', accelerator: 'cpu', canonicalArtifactId: finalized.artifactId, preview, latencyMs });
  }
}

function validateTicket(ticket: LocalExecutionTicketV2, input: BackgroundIsolationRunInput): LocalExecutionTicketV2 {
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Invalid Core deterministic local execution ticket');
  if (ticket.operation.type !== 'BACKGROUND_ISOLATION' || ticket.operation.capability !== BACKGROUND_ISOLATION_CAPABILITY || ticket.operation.id !== 'background-isolation' || ticket.stepId !== 'background-isolation') throw new Error('Core ticket does not authorize background isolation');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Deterministic local execution ticket contains forbidden cloud cost authority');
  if (ticket.inputs.length !== 2) throw new Error('Background isolation ticket must bind exactly IMAGE + MASK');
  const source = ticket.inputs.find(binding => binding.kind === 'image' && binding.artifactId === input.sourceArtifactId);
  const mask = ticket.inputs.find(binding => binding.kind === 'mask' && binding.artifactId === input.maskArtifactId);
  if (!source?.sha256 || !mask?.sha256 || !/^[a-f0-9]{64}$/i.test(source.sha256) || !/^[a-f0-9]{64}$/i.test(mask.sha256)) throw new Error('Core deterministic ticket input bindings are invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || !output.width || !output.height || !output.mimeTypes?.includes('image/png')) throw new Error('Core deterministic ticket output contract is invalid');
  if (ticket.allowedExecutors.length !== 1) throw new Error('Core deterministic ticket must authorize exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) throw new Error('Core deterministic executor binding is invalid');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.sourceArtifactId !== input.sourceArtifactId || parameters.maskArtifactId !== input.maskArtifactId || parameters.deterministicTool !== `${BACKGROUND_ISOLATION_TOOL_ID}@${BACKGROUND_ISOLATION_TOOL_VERSION}`) throw new Error('Core deterministic ticket parameters do not match the requested operation');
  return ticket;
}
function assertEvidence(evidence: LocalExecutionOutputEvidence, width: number, height: number): void {
  if (!evidence.uploadId || evidence.kind !== 'image' || evidence.role !== 'COMPOSITE' || evidence.mimeType !== 'image/png' || evidence.width !== width || evidence.height !== height || !/^[a-f0-9]{64}$/i.test(evidence.sha256) || !Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) throw new Error('Core deterministic upload evidence is invalid');
}

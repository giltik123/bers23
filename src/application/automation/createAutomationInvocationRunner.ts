import { automationClient } from '../../api/automationClient.js';
import { coreClient } from '../../api/coreClient.js';
import { CoreAuthorizedOrthogonalTransform } from '../local-execution/CoreAuthorizedOrthogonalTransform';
import { CoreAuthorizedResize } from '../local-execution/CoreAuthorizedResize';
import type { LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical/index.ts';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit.ts';

const DRIVE_GUARD = 4;

type AutomationInvocationView = Readonly<{
  invocationId: string;
  automationId: string;
  definitionRevision: number;
  projectId: string;
  revision: number;
  state: string;
  nextAction?: Readonly<{ type: string; operation: string; ticket: LocalExecutionTicketV2 }>;
  retryAvailable?: boolean;
  attemptStatus?: string;
  terminalArtifactId?: string;
  terminalImageUrl?: string;
  failureCode?: string;
}>;

type DeliveredImage = Readonly<{
  width: number;
  height: number;
  sourceSha256: string;
  sourceRgba: Uint8ClampedArray;
}>;

type AutomationBrowserClient = Readonly<{
  automation: Readonly<{
    invocations: Readonly<{
      start(payload: Readonly<{ automationId: string; definitionRevision: number; projectId: string; clientRequestId: string }>): Promise<AutomationInvocationView>;
      resume(invocationId: string): Promise<AutomationInvocationView>;
      submitResult(payload: Readonly<{ invocationId: string; result: LocalExecutionResultV2 }>): Promise<AutomationInvocationView>;
      retry(invocationId: string): Promise<AutomationInvocationView>;
      cancel(invocationId: string): Promise<AutomationInvocationView>;
    }>;
  }>;
  localExecution: Readonly<{
    loadOrthogonalTransformInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<DeliveredImage>;
    uploadOrthogonalTransformImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<any>;
    loadResizeInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<DeliveredImage>;
    uploadResizeImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<any>;
  }>;
}>;

export type AutomationInvocationDriveResult = Readonly<{
  view: AutomationInvocationView;
  preview?: PixelImage;
  localLatencyMs: number;
}>;

/**
 * Browser executor for one immutable Automation invocation.
 *
 * The runner never sees or addresses the delegated Agent executionId. It executes
 * only the current Core-issued local nextAction and returns evidence through the
 * C3b invocation endpoint. WorkflowContinuation + ExecutionRun remain server truth.
 */
export function createAutomationInvocationRunner(input: Readonly<{
  projectId: string;
  client?: AutomationBrowserClient;
  clock?: () => number;
}>) {
  const projectId = token(input.projectId, 'projectId');
  const client = input.client ?? ({ automation: automationClient, localExecution: coreClient.localExecution } as unknown as AutomationBrowserClient);
  const clock = input.clock ?? (() => performance.now());

  const drive = async (initial: AutomationInvocationView, onView?: (view: AutomationInvocationView) => void): Promise<AutomationInvocationDriveResult> => {
    let view = normalizeView(initial, projectId);
    let preview: PixelImage | undefined;
    let localLatencyMs = 0;
    for (let guard = 0; guard < DRIVE_GUARD; guard += 1) {
      onView?.(view);
      if (view.state === 'SUCCESS') return Object.freeze({ view, preview, localLatencyMs });
      if (isTerminal(view.state) || view.retryAvailable) return Object.freeze({ view, preview, localLatencyMs });
      const action = requireAction(view, projectId);
      const candidate = action.operation === 'ORTHOGONAL_TRANSFORM'
        ? await executeOrthogonal(action.ticket)
        : await executeResize(action.ticket);
      preview = candidate.preview;
      localLatencyMs += candidate.latencyMs;
      view = normalizeView(await client.automation.invocations.submitResult({ invocationId: view.invocationId, result: candidate.result }), projectId);
    }
    throw new Error('Automation invocation exceeded the browser action guard without reaching a durable stop state');
  };

  const executeOrthogonal = async (ticket: LocalExecutionTicketV2) => {
    const sourceArtifactId = sourceId(ticket);
    const mode = ticket.operation.parameters?.mode;
    if (typeof mode !== 'string') throw new Error('Automation orthogonal ticket is missing server-owned mode');
    const delivered = memo(() => client.localExecution.loadOrthogonalTransformInput({ ticketId: ticket.ticketId, projectId }));
    const executor = new CoreAuthorizedOrthogonalTransform(projectId, {
      prepareOrthogonalTransform: async () => { throw new Error('Automation must not prepare a second orthogonal ticket'); },
      uploadOrthogonalTransformImage: payload => client.localExecution.uploadOrthogonalTransformImage(payload),
      submitOrthogonalTransform: async () => { throw new Error('Automation must not finalize through standalone orthogonal transport'); },
    }, imageInputs(sourceArtifactId, delivered), clock);
    return executor.runPrepared({ ticket, sourceArtifactId, mode: mode as never });
  };

  const executeResize = async (ticket: LocalExecutionTicketV2) => {
    const sourceArtifactId = sourceId(ticket);
    const parameters = ticket.operation.parameters;
    const width = parameters?.width;
    const height = parameters?.height;
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
      throw new Error('Automation Resize ticket is missing server-owned target geometry');
    }
    const delivered = memo(() => client.localExecution.loadResizeInput({ ticketId: ticket.ticketId, projectId }));
    const executor = new CoreAuthorizedResize(projectId, {
      prepareResize: async () => { throw new Error('Automation must not prepare a second Resize ticket'); },
      uploadResizeImage: payload => client.localExecution.uploadResizeImage(payload),
      submitResize: async () => { throw new Error('Automation must not finalize through standalone Resize transport'); },
    }, imageInputs(sourceArtifactId, delivered), clock);
    return executor.runPrepared({ ticket, sourceArtifactId, target: { width, height } });
  };

  return Object.freeze({
    start: async (command: Readonly<{ automationId: string; definitionRevision: number; clientRequestId: string }>, onView?: (view: AutomationInvocationView) => void) => drive(
      await client.automation.invocations.start(Object.freeze({
        automationId: token(command.automationId, 'automationId'),
        definitionRevision: positiveRevision(command.definitionRevision),
        projectId,
        clientRequestId: token(command.clientRequestId, 'clientRequestId'),
      })),
      onView,
    ),
    resume: async (invocationId: string, onView?: (view: AutomationInvocationView) => void) => drive(
      await client.automation.invocations.resume(token(invocationId, 'invocationId')),
      onView,
    ),
    retry: async (invocationId: string, onView?: (view: AutomationInvocationView) => void) => drive(
      await client.automation.invocations.retry(token(invocationId, 'invocationId')),
      onView,
    ),
    cancel: async (invocationId: string) => normalizeView(
      await client.automation.invocations.cancel(token(invocationId, 'invocationId')),
      projectId,
    ),
  });
}

function requireAction(view: AutomationInvocationView, projectId: string): Readonly<{ operation: 'ORTHOGONAL_TRANSFORM' | 'RESIZE'; ticket: LocalExecutionTicketV2 }> {
  const action = view.nextAction;
  if (!action || action.type !== 'LOCAL_EXECUTION') throw new Error('Automation durable view has no admitted local nextAction');
  if (action.operation !== 'ORTHOGONAL_TRANSFORM' && action.operation !== 'RESIZE') throw new Error(`Automation browser does not admit operation ${String(action.operation)}`);
  const ticket = action.ticket;
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY') throw new Error('Automation nextAction ticket is outside canonical local authority');
  if (typeof ticket.workflowId !== 'string' || !ticket.workflowId.trim()) throw new Error('Automation nextAction ticket is missing its server workflow binding');
  if (ticket.scope?.projectId !== projectId || ticket.cost?.providerCalls !== 0 || ticket.cost?.paidCloudCredits !== 0) throw new Error('Automation nextAction ticket violates project or zero-cloud authority');
  if (ticket.operation?.type !== action.operation) throw new Error('Automation nextAction operation does not match its ticket');
  if (!Array.isArray(ticket.inputs) || ticket.inputs.length !== 1 || ticket.inputs[0]?.kind !== 'image') throw new Error('Automation nextAction must bind exactly one canonical IMAGE input');
  return Object.freeze({ operation: action.operation, ticket });
}

function sourceId(ticket: LocalExecutionTicketV2): string { return token(ticket.inputs[0]?.artifactId, 'ticket.inputs[0].artifactId'); }
function normalizeView(view: AutomationInvocationView, projectId: string): AutomationInvocationView {
  if (!view || typeof view !== 'object') throw new Error('Automation Core view is invalid');
  const invocationId = token(view.invocationId, 'invocationId');
  const automationId = token(view.automationId, 'automationId');
  if (view.projectId !== projectId) throw new Error('Automation invocation Project scope changed');
  if (!Number.isSafeInteger(view.definitionRevision) || view.definitionRevision < 1) throw new Error('Automation definition revision is invalid');
  if (!Number.isSafeInteger(view.revision) || view.revision < 0) throw new Error('Automation invocation revision is invalid');
  const state = token(view.state, 'state');
  return Object.freeze({ ...view, invocationId, automationId, state });
}
function imageInputs(sourceArtifactId: string, delivered: () => Promise<DeliveredImage>) {
  return Object.freeze({
    loadImage: async (artifactId: string) => {
      if (artifactId !== sourceArtifactId) throw new Error('Automation local input identity changed after Core ticket issuance');
      const value = await delivered();
      return Object.freeze({ width: value.width, height: value.height, data: new Uint8ClampedArray(value.sourceRgba), format: 'RGBA8' as const, orientation: 1 as const, colorSpace: 'srgb' as const });
    },
    sha256: async (artifactId: string) => {
      if (artifactId !== sourceArtifactId) throw new Error('Automation local input identity changed after Core ticket issuance');
      return (await delivered()).sourceSha256;
    },
  });
}
function memo<T>(load: () => Promise<T>): () => Promise<T> { let value: Promise<T> | undefined; return () => value ??= load(); }
function isTerminal(state: string): boolean { return state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN'; }
function positiveRevision(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('definitionRevision must be a positive safe integer'); return Number(value); }
function token(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`); return value.trim(); }

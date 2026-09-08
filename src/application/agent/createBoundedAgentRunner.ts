import { coreClient } from '../../api/coreClient.js';
import { CoreAuthorizedOrthogonalTransform } from '../local-execution/CoreAuthorizedOrthogonalTransform';
import { CoreAuthorizedResize } from '../local-execution/CoreAuthorizedResize';
import type { LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical/index.ts';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit.ts';

const DRIVE_GUARD = 4;

type BoundedAgentView = Readonly<{
  executionId: string;
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

type BoundedAgentBrowserClient = Readonly<{
  agent: Readonly<{
    startBoundedDeterministic(payload: Readonly<{ clientRequestId: string; projectId: string; sourceArtifactId: string; mode: string; width: number; height: number }>): Promise<BoundedAgentView>;
    resumeBoundedDeterministic(payload: Readonly<{ executionId: string; projectId: string }>): Promise<BoundedAgentView>;
    submitBoundedDeterministicResult(payload: Readonly<{ executionId: string; projectId: string; result: LocalExecutionResultV2 }>): Promise<BoundedAgentView>;
    retryBoundedDeterministic(payload: Readonly<{ executionId: string; projectId: string }>): Promise<BoundedAgentView>;
    cancelBoundedDeterministic(payload: Readonly<{ executionId: string; projectId: string }>): Promise<BoundedAgentView>;
  }>;
  localExecution: Readonly<{
    loadOrthogonalTransformInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<DeliveredImage>;
    uploadOrthogonalTransformImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<any>;
    loadResizeInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<DeliveredImage>;
    uploadResizeImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<any>;
  }>;
}>;

export type BoundedAgentDriveResult = Readonly<{
  view: BoundedAgentView;
  preview?: PixelImage;
  localLatencyMs: number;
}>;

/**
 * Browser executor for the fixed bounded Agent.
 *
 * It does not know a workflow plan. It executes only the current Core-issued
 * nextAction and asks Core for the next durable view after every local result.
 * No standalone prepare/finalize endpoint is used for workflow steps.
 */
export function createBoundedAgentRunner(input: Readonly<{
  projectId: string;
  client?: BoundedAgentBrowserClient;
  clock?: () => number;
}>) {
  const projectId = token(input.projectId, 'projectId');
  const client = input.client ?? (coreClient as unknown as BoundedAgentBrowserClient);
  const clock = input.clock ?? (() => performance.now());

  const drive = async (initial: BoundedAgentView, onView?: (view: BoundedAgentView) => void): Promise<BoundedAgentDriveResult> => {
    let view = normalizeView(initial);
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
      view = normalizeView(await client.agent.submitBoundedDeterministicResult({ executionId: view.executionId, projectId, result: candidate.result }));
    }
    throw new Error('Bounded Agent exceeded the browser action guard without reaching a durable stop state');
  };

  const executeOrthogonal = async (ticket: LocalExecutionTicketV2) => {
    const sourceArtifactId = sourceId(ticket);
    const mode = ticket.operation.parameters?.mode;
    if (typeof mode !== 'string') throw new Error('Bounded Agent orthogonal ticket is missing server-owned mode');
    const delivered = memo(() => client.localExecution.loadOrthogonalTransformInput({ ticketId: ticket.ticketId, projectId }));
    const executor = new CoreAuthorizedOrthogonalTransform(projectId, {
      prepareOrthogonalTransform: async () => { throw new Error('Bounded Agent must not prepare a second orthogonal ticket'); },
      uploadOrthogonalTransformImage: payload => client.localExecution.uploadOrthogonalTransformImage(payload),
      submitOrthogonalTransform: async () => { throw new Error('Bounded Agent must not finalize through standalone orthogonal transport'); },
    }, imageInputs(sourceArtifactId, delivered), clock);
    return executor.runPrepared({ ticket, sourceArtifactId, mode: mode as never });
  };

  const executeResize = async (ticket: LocalExecutionTicketV2) => {
    const sourceArtifactId = sourceId(ticket);
    const parameters = ticket.operation.parameters;
    const width = parameters?.width;
    const height = parameters?.height;
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error('Bounded Agent Resize ticket is missing server-owned target geometry');
    const delivered = memo(() => client.localExecution.loadResizeInput({ ticketId: ticket.ticketId, projectId }));
    const executor = new CoreAuthorizedResize(projectId, {
      prepareResize: async () => { throw new Error('Bounded Agent must not prepare a second Resize ticket'); },
      uploadResizeImage: payload => client.localExecution.uploadResizeImage(payload),
      submitResize: async () => { throw new Error('Bounded Agent must not finalize through standalone Resize transport'); },
    }, imageInputs(sourceArtifactId, delivered), clock);
    return executor.runPrepared({ ticket, sourceArtifactId, target: { width, height } });
  };

  return Object.freeze({
    start: async (command: Readonly<{ clientRequestId: string; sourceArtifactId: string; mode: string; width: number; height: number }>, onView?: (view: BoundedAgentView) => void) => {
      const initial = await client.agent.startBoundedDeterministic(Object.freeze({
        clientRequestId: token(command.clientRequestId, 'clientRequestId'),
        projectId,
        sourceArtifactId: token(command.sourceArtifactId, 'sourceArtifactId'),
        mode: token(command.mode, 'mode'),
        width: command.width,
        height: command.height,
      }));
      return drive(initial, onView);
    },
    resume: async (executionId: string, onView?: (view: BoundedAgentView) => void) => drive(await client.agent.resumeBoundedDeterministic({ executionId: token(executionId, 'executionId'), projectId }), onView),
    retry: async (executionId: string, onView?: (view: BoundedAgentView) => void) => drive(await client.agent.retryBoundedDeterministic({ executionId: token(executionId, 'executionId'), projectId }), onView),
    cancel: async (executionId: string) => normalizeView(await client.agent.cancelBoundedDeterministic({ executionId: token(executionId, 'executionId'), projectId })),
  });
}

function requireAction(view: BoundedAgentView, projectId: string): Readonly<{ operation: 'ORTHOGONAL_TRANSFORM' | 'RESIZE'; ticket: LocalExecutionTicketV2 }> {
  const action = view.nextAction;
  if (!action || action.type !== 'LOCAL_EXECUTION') throw new Error('Bounded Agent durable view has no admitted local nextAction');
  if (action.operation !== 'ORTHOGONAL_TRANSFORM' && action.operation !== 'RESIZE') throw new Error(`Bounded Agent browser does not admit operation ${String(action.operation)}`);
  const ticket = action.ticket;
  if (!ticket || ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.workflowId !== view.executionId) throw new Error('Bounded Agent nextAction ticket is outside the durable workflow authority');
  if (ticket.scope?.projectId !== projectId || ticket.cost?.providerCalls !== 0 || ticket.cost?.paidCloudCredits !== 0) throw new Error('Bounded Agent nextAction ticket violates project or zero-cloud authority');
  if (ticket.operation?.type !== action.operation) throw new Error('Bounded Agent nextAction operation does not match its ticket');
  if (!Array.isArray(ticket.inputs) || ticket.inputs.length !== 1 || ticket.inputs[0]?.kind !== 'image') throw new Error('Bounded Agent nextAction must bind exactly one canonical IMAGE input');
  return Object.freeze({ operation: action.operation, ticket });
}

function sourceId(ticket: LocalExecutionTicketV2): string { return token(ticket.inputs[0]?.artifactId, 'ticket.inputs[0].artifactId'); }
function normalizeView(view: BoundedAgentView): BoundedAgentView {
  if (!view || typeof view !== 'object') throw new Error('Bounded Agent Core view is invalid');
  const executionId = token(view.executionId, 'executionId');
  if (!Number.isSafeInteger(view.revision) || view.revision < 0) throw new Error('Bounded Agent Core revision is invalid');
  const state = token(view.state, 'state');
  return Object.freeze({ ...view, executionId, state });
}
function imageInputs(sourceArtifactId: string, delivered: () => Promise<DeliveredImage>) {
  return Object.freeze({
    loadImage: async (artifactId: string) => {
      if (artifactId !== sourceArtifactId) throw new Error('Bounded Agent local input identity changed after Core ticket issuance');
      const value = await delivered();
      return Object.freeze({ width: value.width, height: value.height, data: new Uint8ClampedArray(value.sourceRgba), format: 'RGBA8' as const, orientation: 1 as const, colorSpace: 'srgb' as const });
    },
    sha256: async (artifactId: string) => {
      if (artifactId !== sourceArtifactId) throw new Error('Bounded Agent local input identity changed after Core ticket issuance');
      return (await delivered()).sourceSha256;
    },
  });
}
function memo<T>(load: () => Promise<T>): () => Promise<T> { let value: Promise<T> | undefined; return () => value ??= load(); }
function isTerminal(state: string): boolean { return state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN'; }
function token(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`); return value.trim(); }

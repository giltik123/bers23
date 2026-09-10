import {
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  type OrthogonalTransformMode,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { normalizeResizeDimensions } from '../../../src/platform/creative/deterministic/Resize.ts';
import type { DurableResolvedArtifact } from '../artifacts/durableArtifactLineageResolver.ts';
import type { CanonicalProjectSourceContext } from '../projects/postgresProjectStore.ts';
import type { BoundedAgentStartCommand } from '../workflow/BoundedAgentExecutionPort.ts';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import { compileAeePlanV1, type AdmittedPlanGraphV1 } from './AeePlanCompilerV1.ts';
import {
  AGENT_INTENT_V1_SCHEMA,
  agentIntentV1Digest,
  normalizeAgentIntentV1,
} from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';

export const BOUNDED_AGENT_AEE_COMPATIBILITY_VERSION = '1' as const;
export const BOUNDED_AGENT_AEE_PARSER_VERSION = 'bounded-agent-compatibility-parser/1' as const;
export const BOUNDED_AGENT_AEE_PLANNER_VERSION = 'bounded-agent-compatibility-planner/1' as const;
export const BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID = 'bounded-orthogonal' as const;
export const BOUNDED_AGENT_AEE_RESIZE_NODE_ID = 'bounded-resize' as const;

export const BOUNDED_AGENT_AEE_EXECUTION = Object.freeze({
  policy: 'LOCAL_ONLY' as const,
  cloudAllowed: false as const,
  maxNodes: 2,
  maxRetries: 8,
  maxReplans: 0,
  maxCandidates: 1,
  maxPaidCredits: 0,
  maxWallClockMs: 86_400_000,
  // Compatibility sentinel only. Runtime peak-memory enforcement remains #548.
  maxMemoryBytes: 137_438_953_472,
});

type CompatibilitySourceAuthority = Readonly<{
  projectId: string;
  projectRevision: number;
  sourceRef: string;
  role: 'ORIGINAL' | 'COMPOSITE';
  width: number;
  height: number;
}>;

/**
 * Converts the accepted bounded Agent command into the exact generalized AEE
 * semantic graph. This is a deterministic server compatibility compiler, not
 * planner/model output and not execution authority.
 */
export function compileBoundedAgentAeeCompatibilityV1(
  commandInput: BoundedAgentStartCommand,
  project: CanonicalProjectSourceContext,
  source: DurableResolvedArtifact,
): AdmittedPlanGraphV1 {
  const command = normalizeCommand(commandInput, source.width, source.height);
  if (source.kind !== 'image' || (source.role !== 'ORIGINAL' && source.role !== 'COMPOSITE')) {
    throw conflict('bounded_aee_source_invalid', 'Bounded AEE compatibility source must be a canonical IMAGE');
  }
  if (project.projectId !== command.projectId || source.storageId !== project.currentImageStorageId
    || source.width !== project.width || source.height !== project.height) {
    throw conflict('bounded_aee_project_source_conflict', 'Bounded AEE source is not the exact current canonical Project IMAGE');
  }
  return compileFromAuthority(command, Object.freeze({
    projectId: project.projectId,
    projectRevision: project.revision,
    sourceRef: source.artifactId,
    role: source.role,
    width: source.width,
    height: source.height,
  }));
}

/**
 * Replay proof for an already durable compatibility graph. It deliberately
 * reconstructs expected bytes from the graph's immutable source revision rather
 * than consulting today's Project cursor/revision.
 */
export function assertBoundedAgentAeeCompatibilityReplayV1(
  graph: AdmittedPlanGraphV1,
  commandInput: BoundedAgentStartCommand,
): AdmittedPlanGraphV1 {
  if (graph.source.artifactRole !== 'ORIGINAL' && graph.source.artifactRole !== 'COMPOSITE') {
    throw conflict('bounded_aee_replay_source_invalid', 'Durable compatibility graph has an unsupported source Artifact role');
  }
  const command = normalizeCommand(commandInput, graph.source.width, graph.source.height);
  const expected = compileFromAuthority(command, Object.freeze({
    projectId: graph.source.projectId,
    projectRevision: graph.source.projectRevision,
    sourceRef: graph.source.sourceRef,
    role: graph.source.artifactRole,
    width: graph.source.width,
    height: graph.source.height,
  }));
  if (expected.digest !== graph.digest) {
    throw conflict('bounded_aee_replay_mismatch', 'Bounded command differs from the immutable admitted compatibility graph');
  }
  return graph;
}

function compileFromAuthority(command: BoundedAgentStartCommand, source: CompatibilitySourceAuthority): AdmittedPlanGraphV1 {
  if (command.projectId !== source.projectId || command.sourceArtifactId !== source.sourceRef) {
    throw conflict('bounded_aee_source_binding_mismatch', 'Bounded command source differs from compatibility source authority');
  }
  const intent = normalizeAgentIntentV1({
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: BOUNDED_AGENT_AEE_PARSER_VERSION,
    goal: Object.freeze({ capability: 'RESIZE', instruction: 'Execute the bounded deterministic orthogonal-transform then resize compatibility chain.' }),
    source: Object.freeze({ projectId: source.projectId, projectRevision: source.projectRevision, sourceRef: source.sourceRef }),
    targets: Object.freeze([]),
    mutable: Object.freeze([]),
    preserve: Object.freeze([]),
    constraints: Object.freeze({ quality: 'BALANCED', styleTags: Object.freeze([]) }),
    execution: BOUNDED_AGENT_AEE_EXECUTION,
    context: Object.freeze({ modalities: Object.freeze(['TOUCH']), uiReferences: Object.freeze([]) }),
    ambiguities: Object.freeze([]),
    evidence: Object.freeze([]),
    confidence: 1,
  });
  const proposal = Object.freeze({
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: BOUNDED_AGENT_AEE_PLANNER_VERSION,
    intentDigest: agentIntentV1Digest(intent),
    nodes: Object.freeze([
      Object.freeze({
        nodeId: BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID,
        capabilityId: AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
        capabilityVersion: 1,
        dependsOn: Object.freeze([]),
        inputs: Object.freeze([Object.freeze({ name: 'source', source: Object.freeze({ kind: 'INTENT_SOURCE' as const }) })]),
        parameters: Object.freeze({ mode: command.mode }),
      }),
      Object.freeze({
        nodeId: BOUNDED_AGENT_AEE_RESIZE_NODE_ID,
        capabilityId: AEE_CAPABILITY_RESIZE_V1,
        capabilityVersion: 1,
        dependsOn: Object.freeze([BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID]),
        inputs: Object.freeze([Object.freeze({
          name: 'source',
          source: Object.freeze({ kind: 'NODE_OUTPUT' as const, nodeId: BOUNDED_AGENT_AEE_ORTHOGONAL_NODE_ID }),
        })]),
        parameters: Object.freeze({ width: command.width, height: command.height }),
      }),
    ]),
  });
  return compileAeePlanV1(intent, proposal, Object.freeze({
    canonical: Object.freeze({ projectId: source.projectId, projectRevision: source.projectRevision, sourceRef: source.sourceRef }),
    sourceArtifact: Object.freeze({ role: source.role, width: source.width, height: source.height }),
  }));
}

function normalizeCommand(command: BoundedAgentStartCommand, sourceWidth: number, sourceHeight: number): BoundedAgentStartCommand {
  const clientRequestId = token(command?.clientRequestId, 'clientRequestId');
  const projectId = token(command?.projectId, 'projectId');
  const sourceArtifactId = token(command?.sourceArtifactId, 'sourceArtifactId');
  let mode: OrthogonalTransformMode;
  try { mode = normalizeOrthogonalTransformMode(command.mode); }
  catch { throw badRequest('bounded_agent_mode_invalid', 'Bounded orthogonal-transform mode is invalid'); }
  let target;
  try {
    const postOrthogonal = orthogonalTransformOutputGeometry(sourceWidth, sourceHeight, mode);
    target = normalizeResizeDimensions({ width: command.width, height: command.height }, postOrthogonal.width, postOrthogonal.height);
  } catch {
    throw badRequest('bounded_agent_resize_invalid', 'Bounded resize dimensions are invalid');
  }
  return Object.freeze({ clientRequestId, projectId, sourceArtifactId, mode, width: target.width, height: target.height });
}

function token(value: unknown, path: string): string {
  if (typeof value !== 'string') throw badRequest('bounded_agent_request_invalid', `${path} is required`);
  const normalized = value.trim();
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > 256 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw badRequest('bounded_agent_request_invalid', `${path} is invalid`);
  }
  return normalized;
}

function badRequest(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 400, code });
}
function conflict(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 409, code });
}

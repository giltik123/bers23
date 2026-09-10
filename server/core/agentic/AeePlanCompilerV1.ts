import { createHash } from 'node:crypto';
import type { CreativeArtifactRole } from '../../../src/platform/creative/canonical/contracts.ts';
import {
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { normalizeResizeDimensions } from '../../../src/platform/creative/deterministic/Resize.ts';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_REGISTRY_V1,
  AEE_CAPABILITY_RESIZE_V1,
  AeeCapabilityRegistryV1Error,
  requireAeeCapabilityDescriptorV1,
  type AeeCapabilityDescriptorV1,
  type AeeCapabilityEvaluatorHookV1,
  type AeeCapabilityPreconditionV1,
} from './AeeCapabilityRegistryV1.ts';
import {
  AgentIntentV1Error,
  agentIntentV1Digest,
  agentIntentV1RequiresClarification,
  assertAgentIntentV1CanonicalContext,
  normalizeAgentIntentV1,
  type AgentIntentCanonicalContextV1,
  type AgentIntentV1,
} from './AgentIntentV1.ts';
import {
  PlanProposalV1Error,
  normalizePlanProposalV1,
  planProposalV1Digest,
  type PlanProposalInputV1,
  type PlanProposalNodeV1,
  type PlanProposalParametersV1,
  type PlanProposalV1,
} from './PlanProposalV1.ts';

export const AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA = 'BERS_AEE_ADMITTED_PLAN_GRAPH_V1' as const;
export const AEE_PLAN_COMPILER_V1_VERSION = '1' as const;
export const AEE_ADMITTED_PLAN_GRAPH_V1_DIGEST_VERSION = '1' as const;
const DIGEST_DOMAIN = `bers:aee:admitted-plan-graph:v${AEE_ADMITTED_PLAN_GRAPH_V1_DIGEST_VERSION}\0`;
const MAX_SOURCE_REFERENCE_BYTES = 4096;

const ARTIFACT_ROLES: readonly CreativeArtifactRole[] = Object.freeze([
  'ORIGINAL', 'WORKING', 'MASK', 'ROI_INPUT', 'PATCH', 'VERIFIED_PATCH', 'COMPOSITE', 'PREVIEW',
]);
type ArtifactRole = CreativeArtifactRole;
type Geometry = Readonly<{ width: number; height: number }>;

export type AeePlanCompileContextV1 = Readonly<{
  canonical: AgentIntentCanonicalContextV1;
  sourceArtifact: Readonly<{
    role: ArtifactRole;
    width: number;
    height: number;
  }>;
}>;

export type AeeAdmittedPlanInputV1 = Readonly<{
  name: string;
  source: Readonly<{ kind: 'INTENT_SOURCE' }> | Readonly<{ kind: 'NODE_OUTPUT'; nodeId: string }>;
  artifactRole: ArtifactRole;
}>;

export type AeeAdmittedPlanNodeV1 = Readonly<{
  nodeId: string;
  capabilityId: string;
  capabilityVersion: number;
  semanticOperation: string;
  dependsOn: readonly string[];
  inputs: readonly AeeAdmittedPlanInputV1[];
  parameters: PlanProposalParametersV1;
  preconditions: readonly AeeCapabilityPreconditionV1[];
  output: Readonly<{ artifactRole: ArtifactRole; width: number; height: number }>;
  evaluatorHooks: readonly AeeCapabilityEvaluatorHookV1[];
  sideEffectClass: 'CANDIDATE_ARTIFACT_ONLY';
  resourceClass: 'BOUNDED_IMAGE_TRANSFORM';
  requiredEvidence: 'BYTE_EXACT_CORE_RECOMPUTE';
}>;

export type AdmittedPlanGraphV1 = Readonly<{
  schemaVersion: typeof AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA;
  compilerVersion: typeof AEE_PLAN_COMPILER_V1_VERSION;
  intentDigest: string;
  proposalDigest: string;
  capabilityRegistry: Readonly<{
    version: number;
    digest: string;
  }>;
  source: Readonly<{
    projectId: string;
    projectRevision: number;
    sourceRef: string;
    artifactRole: ArtifactRole;
    width: number;
    height: number;
  }>;
  effectiveExecution: Readonly<{
    policy: 'LOCAL_ONLY';
    cloudAllowed: false;
    maxPaidCredits: 0;
    maxNodes: number;
    maxRetries: number;
    maxReplans: number;
    maxCandidates: number;
    maxWallClockMs: number;
    maxMemoryBytes: number;
  }>;
  nodes: readonly AeeAdmittedPlanNodeV1[];
  terminal: Readonly<{
    nodeId: string;
    evaluatorHooks: readonly AeeCapabilityEvaluatorHookV1[];
  }>;
  digest: string;
}>;

export class AeePlanCompilerV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AeePlanCompilerV1Error';
    this.code = code;
  }
}

/**
 * Pure AE-3 admission/compiler boundary. It consumes advisory intent/proposal
 * plus caller-supplied canonical current-source context and emits semantic plan
 * authority only. It does not create tickets, runs, Artifacts or Project writes.
 */
export function compileAeePlanV1(
  rawIntent: unknown,
  rawProposal: unknown,
  rawContext: unknown,
): AdmittedPlanGraphV1 {
  const context = normalizeCompileContext(rawContext);
  const intent = normalizeIntent(rawIntent, context.canonical);
  if (agentIntentV1RequiresClarification(intent)) {
    fail('aee_plan_intent_requires_clarification', 'Ambiguous AgentIntentV1 cannot be compiled');
  }
  const proposal = normalizeProposal(rawProposal);
  const intentDigest = agentIntentV1Digest(intent);
  if (proposal.intentDigest !== intentDigest) {
    fail('aee_plan_intent_digest_mismatch', 'PlanProposalV1 is bound to a different AgentIntentV1');
  }
  if (proposal.nodes.length > intent.execution.maxNodes) {
    fail('aee_plan_node_budget_exceeded', 'PlanProposalV1 exceeds AgentIntentV1 maxNodes');
  }

  const descriptorByNode = new Map<string, AeeCapabilityDescriptorV1>();
  for (const node of proposal.nodes) {
    let descriptor: AeeCapabilityDescriptorV1;
    try {
      descriptor = requireAeeCapabilityDescriptorV1(node.capabilityId, node.capabilityVersion);
    } catch (error) {
      if (error instanceof AeeCapabilityRegistryV1Error) {
        fail('aee_plan_capability_unavailable', `Capability is not admitted by AE-2 V1: ${node.capabilityId}@${node.capabilityVersion}`);
      }
      throw error;
    }
    if (!descriptor.executionEligibility.deterministic || !descriptor.executionEligibility.local
      || descriptor.executionEligibility.cloud || descriptor.executionEligibility.hybrid) {
      fail('aee_plan_v1_realization_unsupported', `AE-3 V1 accepts deterministic local-only semantics: ${node.capabilityId}`);
    }
    descriptorByNode.set(node.nodeId, descriptor);
  }

  const topology = validateAndOrderDag(proposal);
  const terminalId = requireSingleTerminal(proposal);
  const terminalDescriptor = descriptorByNode.get(terminalId);
  if (!terminalDescriptor) fail('aee_plan_terminal_descriptor_missing', 'Terminal capability descriptor is unavailable');
  if (terminalDescriptor.semanticOperation !== intent.goal.capability) {
    fail('aee_plan_goal_mismatch', `Terminal operation ${terminalDescriptor.semanticOperation} does not satisfy AgentIntentV1 goal ${intent.goal.capability}`);
  }

  const compiledById = new Map<string, AeeAdmittedPlanNodeV1>();
  const admittedNodes: AeeAdmittedPlanNodeV1[] = [];
  for (const nodeId of topology) {
    const node = requireNode(proposal, nodeId);
    const descriptor = descriptorByNode.get(nodeId);
    if (!descriptor) fail('aee_plan_descriptor_missing', `Capability descriptor is unavailable for ${nodeId}`);
    const compiled = compileNode(node, descriptor, context, compiledById, intent);
    compiledById.set(nodeId, compiled);
    admittedNodes.push(compiled);
  }

  const terminal = compiledById.get(terminalId);
  if (!terminal) fail('aee_plan_terminal_missing', 'Terminal node did not compile');
  const proposalDigest = planProposalV1Digest(proposal);
  const effectiveExecution = deepFreeze({
    policy: 'LOCAL_ONLY' as const,
    cloudAllowed: false as const,
    maxPaidCredits: 0 as const,
    maxNodes: intent.execution.maxNodes,
    maxRetries: intent.execution.maxRetries,
    maxReplans: intent.execution.maxReplans,
    maxCandidates: intent.execution.maxCandidates,
    maxWallClockMs: intent.execution.maxWallClockMs,
    maxMemoryBytes: intent.execution.maxMemoryBytes,
  });
  const source = deepFreeze({
    projectId: context.canonical.projectId,
    projectRevision: context.canonical.projectRevision,
    sourceRef: context.canonical.sourceRef,
    artifactRole: context.sourceArtifact.role,
    width: context.sourceArtifact.width,
    height: context.sourceArtifact.height,
  });
  const authority = deepFreeze({
    schemaVersion: AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA,
    compilerVersion: AEE_PLAN_COMPILER_V1_VERSION,
    intentDigest,
    proposalDigest,
    capabilityRegistry: deepFreeze({ version: AEE_CAPABILITY_REGISTRY_V1.registryVersion, digest: AEE_CAPABILITY_REGISTRY_V1.digest }),
    source,
    effectiveExecution,
    nodes: Object.freeze(admittedNodes),
    terminal: deepFreeze({ nodeId: terminalId, evaluatorHooks: Object.freeze([...terminal.evaluatorHooks]) }),
  });
  const digest = createHash('sha256').update(DIGEST_DOMAIN).update(JSON.stringify(canonicalValue(authority))).digest('hex');
  return deepFreeze({ ...authority, digest });
}

function normalizeIntent(rawIntent: unknown, canonical: AgentIntentCanonicalContextV1): AgentIntentV1 {
  try {
    const intent = normalizeAgentIntentV1(rawIntent);
    return assertAgentIntentV1CanonicalContext(intent, canonical);
  } catch (error) {
    if (error instanceof AgentIntentV1Error) fail(`aee_plan_${error.code}`, error.message);
    throw error;
  }
}

function normalizeProposal(rawProposal: unknown): PlanProposalV1 {
  try {
    return normalizePlanProposalV1(rawProposal);
  } catch (error) {
    if (error instanceof PlanProposalV1Error) fail(`aee_plan_${error.code}`, error.message);
    throw error;
  }
}

function normalizeCompileContext(raw: unknown): AeePlanCompileContextV1 {
  const root = exactRecord(raw, ['canonical', 'sourceArtifact'], ['canonical', 'sourceArtifact'], 'compileContext');
  const canonicalRaw = exactRecord(root.canonical, ['projectId', 'projectRevision', 'sourceRef'], ['projectId', 'projectRevision', 'sourceRef'], 'compileContext.canonical');
  const sourceRaw = exactRecord(root.sourceArtifact, ['role', 'width', 'height'], ['role', 'width', 'height'], 'compileContext.sourceArtifact');
  return deepFreeze({
    canonical: {
      projectId: token(canonicalRaw.projectId, 'compileContext.canonical.projectId'),
      projectRevision: integer(canonicalRaw.projectRevision, 'compileContext.canonical.projectRevision', 0, Number.MAX_SAFE_INTEGER),
      sourceRef: sourceReference(canonicalRaw.sourceRef, 'compileContext.canonical.sourceRef'),
    },
    sourceArtifact: {
      role: artifactRole(sourceRaw.role, 'compileContext.sourceArtifact.role'),
      width: dimension(sourceRaw.width, 'compileContext.sourceArtifact.width'),
      height: dimension(sourceRaw.height, 'compileContext.sourceArtifact.height'),
    },
  });
}

function validateAndOrderDag(proposal: PlanProposalV1): readonly string[] {
  const byId = new Map(proposal.nodes.map(node => [node.nodeId, node]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of proposal.nodes) {
    indegree.set(node.nodeId, node.dependsOn.length);
    dependents.set(node.nodeId, []);
  }

  for (const node of proposal.nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) fail('aee_plan_unknown_dependency', `${node.nodeId} depends on unknown node ${dependency}`);
      if (dependency === node.nodeId) fail('aee_plan_self_dependency', `${node.nodeId} cannot depend on itself`);
      dependents.get(dependency)?.push(node.nodeId);
    }
    const inputDependencies = node.inputs
      .filter(input => input.source.kind === 'NODE_OUTPUT')
      .map(input => input.source.kind === 'NODE_OUTPUT' ? input.source.nodeId : '')
      .sort((a, b) => a.localeCompare(b));
    for (const inputDependency of inputDependencies) {
      if (!byId.has(inputDependency)) fail('aee_plan_unknown_input_node', `${node.nodeId} reads unknown node ${inputDependency}`);
      if (inputDependency === node.nodeId) fail('aee_plan_self_dependency', `${node.nodeId} cannot read its own output`);
    }
    if (!sameStringSet(node.dependsOn, inputDependencies)) {
      fail('aee_plan_dependency_input_mismatch', `${node.nodeId} dependencies must exactly match NODE_OUTPUT inputs`);
    }
  }

  const ready = [...proposal.nodes.filter(node => indegree.get(node.nodeId) === 0).map(node => node.nodeId)].sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];
  while (ready.length > 0) {
    const nodeId = ready.shift();
    if (!nodeId) break;
    ordered.push(nodeId);
    const children = [...(dependents.get(nodeId) ?? [])].sort((a, b) => a.localeCompare(b));
    for (const child of children) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) {
        ready.push(child);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }
  if (ordered.length !== proposal.nodes.length) fail('aee_plan_cycle', 'PlanProposalV1 contains a dependency cycle');
  return Object.freeze(ordered);
}

function requireSingleTerminal(proposal: PlanProposalV1): string {
  const dependedOn = new Set<string>();
  for (const node of proposal.nodes) for (const dependency of node.dependsOn) dependedOn.add(dependency);
  const sinks = proposal.nodes.filter(node => !dependedOn.has(node.nodeId)).map(node => node.nodeId);
  if (sinks.length !== 1) fail('aee_plan_terminal_count_invalid', 'AE-3 V1 requires exactly one terminal plan node');
  return sinks[0];
}

function compileNode(
  node: PlanProposalNodeV1,
  descriptor: AeeCapabilityDescriptorV1,
  context: AeePlanCompileContextV1,
  compiledById: ReadonlyMap<string, AeeAdmittedPlanNodeV1>,
  intent: AgentIntentV1,
): AeeAdmittedPlanNodeV1 {
  if (node.inputs.length !== descriptor.inputs.length) {
    fail('aee_plan_input_contract_mismatch', `${node.nodeId} input count differs from capability contract`);
  }
  const admittedInputs: AeeAdmittedPlanInputV1[] = [];
  const geometryByInput = new Map<string, Geometry>();
  for (const expected of descriptor.inputs) {
    const proposed = node.inputs.find(input => input.name === expected.name);
    if (!proposed) fail('aee_plan_input_contract_mismatch', `${node.nodeId} is missing input ${expected.name}`);
    const resolved = resolveInput(proposed, context, compiledById);
    if (!expected.artifactRoles.includes(resolved.role)) {
      fail('aee_plan_artifact_role_mismatch', `${node.nodeId}.${expected.name} cannot consume Artifact role ${resolved.role}`);
    }
    geometryByInput.set(expected.name, resolved.geometry);
    admittedInputs.push(deepFreeze({ name: expected.name, source: proposed.source, artifactRole: resolved.role }));
  }
  if (new Set(node.inputs.map(input => input.name)).size !== descriptor.inputs.length) {
    fail('aee_plan_input_contract_mismatch', `${node.nodeId} inputs differ from capability contract`);
  }

  const sourceGeometry = geometryByInput.get('source');
  if (!sourceGeometry) fail('aee_plan_source_geometry_missing', `${node.nodeId} has no source geometry`);
  const normalized = normalizeCapabilityParameters(node, sourceGeometry);
  const outputBytes = normalized.output.width * normalized.output.height * 4;
  if (!Number.isSafeInteger(outputBytes) || outputBytes > intent.execution.maxMemoryBytes) {
    fail('aee_plan_memory_floor_exceeded', `${node.nodeId} canonical RGBA output alone exceeds maxMemoryBytes`);
  }

  return deepFreeze({
    nodeId: node.nodeId,
    capabilityId: descriptor.capabilityId,
    capabilityVersion: descriptor.capabilityVersion,
    semanticOperation: descriptor.semanticOperation,
    dependsOn: Object.freeze([...node.dependsOn]),
    inputs: Object.freeze(admittedInputs),
    parameters: normalized.parameters,
    preconditions: Object.freeze([...descriptor.preconditions]),
    output: deepFreeze({ artifactRole: descriptor.outputArtifactRole, width: normalized.output.width, height: normalized.output.height }),
    evaluatorHooks: Object.freeze([...descriptor.evaluatorHooks]),
    sideEffectClass: descriptor.sideEffectClass,
    resourceClass: descriptor.resourceClass,
    requiredEvidence: descriptor.requiredEvidence,
  });
}

function resolveInput(
  input: PlanProposalInputV1,
  context: AeePlanCompileContextV1,
  compiledById: ReadonlyMap<string, AeeAdmittedPlanNodeV1>,
): Readonly<{ role: ArtifactRole; geometry: Geometry }> {
  if (input.source.kind === 'INTENT_SOURCE') {
    return deepFreeze({ role: context.sourceArtifact.role, geometry: { width: context.sourceArtifact.width, height: context.sourceArtifact.height } });
  }
  const upstream = compiledById.get(input.source.nodeId);
  if (!upstream) fail('aee_plan_upstream_not_compiled', `Upstream node ${input.source.nodeId} is unavailable in topological order`);
  return deepFreeze({ role: upstream.output.artifactRole, geometry: { width: upstream.output.width, height: upstream.output.height } });
}

function normalizeCapabilityParameters(
  node: PlanProposalNodeV1,
  source: Geometry,
): Readonly<{ parameters: PlanProposalParametersV1; output: Geometry }> {
  if (node.capabilityId === AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1) {
    requireParameterKeys(node.parameters, ['mode'], node.nodeId);
    let mode: ReturnType<typeof normalizeOrthogonalTransformMode>;
    try { mode = normalizeOrthogonalTransformMode(node.parameters.mode); }
    catch (error) { fail('aee_plan_orthogonal_parameters_invalid', error instanceof Error ? error.message : 'Orthogonal parameters are invalid'); }
    const output = orthogonalTransformOutputGeometry(source.width, source.height, mode);
    return deepFreeze({ parameters: { mode }, output });
  }
  if (node.capabilityId === AEE_CAPABILITY_RESIZE_V1) {
    requireParameterKeys(node.parameters, ['height', 'width'], node.nodeId);
    let target: ReturnType<typeof normalizeResizeDimensions>;
    try {
      target = normalizeResizeDimensions(
        { width: node.parameters.width as number, height: node.parameters.height as number },
        source.width,
        source.height,
      );
    } catch (error) { fail('aee_plan_resize_parameters_invalid', error instanceof Error ? error.message : 'Resize parameters are invalid'); }
    return deepFreeze({ parameters: { height: target.height, width: target.width }, output: target });
  }
  fail('aee_plan_parameter_contract_unavailable', `AE-3 V1 has no semantic parameter contract for ${node.capabilityId}`);
}

function requireParameterKeys(parameters: PlanProposalParametersV1, expected: readonly string[], nodeId: string): void {
  const actual = Object.keys(parameters).sort((a, b) => a.localeCompare(b));
  const wanted = [...expected].sort((a, b) => a.localeCompare(b));
  if (!sameStringSet(actual, wanted)) fail('aee_plan_parameter_contract_mismatch', `${nodeId} parameters must be exactly ${wanted.join(',')}`);
}

function requireNode(proposal: PlanProposalV1, nodeId: string): PlanProposalNodeV1 {
  const node = proposal.nodes.find(candidate => candidate.nodeId === nodeId);
  if (!node) fail('aee_plan_node_missing', `Plan node is unavailable: ${nodeId}`);
  return node;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort((x, y) => x.localeCompare(y));
  const b = [...right].sort((x, y) => x.localeCompare(y));
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('aee_plan_compile_context_invalid', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('aee_plan_compile_context_invalid', `${path} must be a plain object`);
  const record = raw as Record<string, unknown>;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) if (!allowedSet.has(key)) fail('aee_plan_compile_context_invalid', `${path} contains unsupported key ${key}`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(record, key)) fail('aee_plan_compile_context_invalid', `${path} is missing ${key}`);
  return record;
}

function artifactRole(raw: unknown, path: string): ArtifactRole {
  if (typeof raw !== 'string' || !ARTIFACT_ROLES.includes(raw as ArtifactRole)) fail('aee_plan_source_role_invalid', `${path} is unsupported`);
  return raw as ArtifactRole;
}

function dimension(raw: unknown, path: string): number {
  return integer(raw, path, 1, 1_000_000);
}

function integer(raw: unknown, path: string, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) fail('aee_plan_compile_context_invalid', `${path} must be a safe integer in range`);
  return raw;
}

function sourceReference(raw: unknown, path: string): string {
  if (typeof raw !== 'string') fail('aee_plan_compile_context_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || value !== raw || Buffer.byteLength(raw, 'utf8') > MAX_SOURCE_REFERENCE_BYTES
    || /[\u0000-\u001f\u007f]/u.test(raw)) {
    fail('aee_plan_compile_context_invalid', `${path} is outside the bounded opaque-reference contract`);
  }
  return raw;
}

function token(raw: unknown, path: string): string {
  if (typeof raw !== 'string') fail('aee_plan_compile_context_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) fail('aee_plan_compile_context_invalid', `${path} is invalid`);
  return value;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalValue(child)]));
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (!Object.isFrozen(value)) Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never { throw new AeePlanCompilerV1Error(code, message); }

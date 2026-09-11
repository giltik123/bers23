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
  AEE_ADMITTED_PLAN_GRAPH_V1_DIGEST_VERSION,
  AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA,
  AEE_PLAN_COMPILER_V1_VERSION,
  type AdmittedPlanGraphV1,
  type AeeAdmittedPlanInputV1,
  type AeeAdmittedPlanNodeV1,
} from './AeePlanCompilerV1.ts';

const DIGEST_DOMAIN = `bers:aee:admitted-plan-graph:v${AEE_ADMITTED_PLAN_GRAPH_V1_DIGEST_VERSION}\0`;
const MAX_SOURCE_REFERENCE_BYTES = 4096;
const ARTIFACT_ROLES: readonly CreativeArtifactRole[] = Object.freeze([
  'ORIGINAL', 'WORKING', 'MASK', 'ROI_INPUT', 'PATCH', 'VERIFIED_PATCH', 'COMPOSITE', 'PREVIEW',
]);
const ROOT_KEYS = [
  'schemaVersion', 'compilerVersion', 'intentDigest', 'proposalDigest', 'capabilityRegistry',
  'source', 'effectiveExecution', 'nodes', 'terminal', 'digest',
] as const;
const REGISTRY_KEYS = ['version', 'digest'] as const;
const SOURCE_KEYS = ['projectId', 'projectRevision', 'sourceRef', 'artifactRole', 'width', 'height'] as const;
const EXECUTION_KEYS = [
  'policy', 'cloudAllowed', 'maxPaidCredits', 'maxNodes', 'maxRetries', 'maxReplans',
  'maxCandidates', 'maxWallClockMs', 'maxMemoryBytes',
] as const;
const NODE_KEYS = [
  'nodeId', 'capabilityId', 'capabilityVersion', 'semanticOperation', 'dependsOn', 'inputs',
  'parameters', 'preconditions', 'output', 'evaluatorHooks', 'sideEffectClass', 'resourceClass',
  'requiredEvidence',
] as const;
const INPUT_KEYS = ['name', 'source', 'artifactRole'] as const;
const INTENT_SOURCE_KEYS = ['kind'] as const;
const NODE_SOURCE_KEYS = ['kind', 'nodeId'] as const;
const OUTPUT_KEYS = ['artifactRole', 'width', 'height'] as const;
const TERMINAL_KEYS = ['nodeId', 'evaluatorHooks'] as const;

type ArtifactRole = CreativeArtifactRole;
type Primitive = string | number | boolean;
type Parameters = Readonly<Record<string, Primitive>>;
type NodeShell = Readonly<{
  nodeId: string;
  capabilityId: string;
  capabilityVersion: number;
  descriptor: AeeCapabilityDescriptorV1;
  dependsOn: readonly string[];
  inputs: readonly AeeAdmittedPlanInputV1[];
  parameters: Parameters;
  output: Readonly<{ artifactRole: ArtifactRole; width: number; height: number }>;
}>;

export class AeeAdmittedPlanCodecV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AeeAdmittedPlanCodecV1Error';
    this.code = code;
  }
}

/**
 * AE-4 durable replay boundary. It accepts only the exact canonical graph shape
 * emitted by AE-3 and re-proves registry, DAG, artifact-flow, geometry and digest
 * invariants before persistence and after every durable load.
 */
export function normalizeAeeAdmittedPlanGraphV1(raw: unknown): AdmittedPlanGraphV1 {
  const root = exactRecord(raw, ROOT_KEYS, ROOT_KEYS, 'graph');
  if (root.schemaVersion !== AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA) {
    fail('aee_admitted_plan_schema_unsupported', `schemaVersion must be ${AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA}`);
  }
  if (root.compilerVersion !== AEE_PLAN_COMPILER_V1_VERSION) {
    fail('aee_admitted_plan_compiler_unsupported', `compilerVersion must be ${AEE_PLAN_COMPILER_V1_VERSION}`);
  }

  const capabilityRegistryRaw = exactRecord(root.capabilityRegistry, REGISTRY_KEYS, REGISTRY_KEYS, 'graph.capabilityRegistry');
  const capabilityRegistry = deepFreeze({
    version: integer(capabilityRegistryRaw.version, 'graph.capabilityRegistry.version', 1, 1_000_000),
    digest: sha256(capabilityRegistryRaw.digest, 'graph.capabilityRegistry.digest'),
  });
  if (capabilityRegistry.version !== AEE_CAPABILITY_REGISTRY_V1.registryVersion
    || capabilityRegistry.digest !== AEE_CAPABILITY_REGISTRY_V1.digest) {
    fail('aee_admitted_plan_registry_mismatch', 'Admitted graph is not bound to the accepted AE-2 V1 registry');
  }

  const sourceRaw = exactRecord(root.source, SOURCE_KEYS, SOURCE_KEYS, 'graph.source');
  const source = deepFreeze({
    projectId: token(sourceRaw.projectId, 'graph.source.projectId', 200),
    projectRevision: integer(sourceRaw.projectRevision, 'graph.source.projectRevision', 0, Number.MAX_SAFE_INTEGER),
    sourceRef: sourceReference(sourceRaw.sourceRef, 'graph.source.sourceRef'),
    artifactRole: artifactRole(sourceRaw.artifactRole, 'graph.source.artifactRole'),
    width: dimension(sourceRaw.width, 'graph.source.width'),
    height: dimension(sourceRaw.height, 'graph.source.height'),
  });

  const executionRaw = exactRecord(root.effectiveExecution, EXECUTION_KEYS, EXECUTION_KEYS, 'graph.effectiveExecution');
  if (executionRaw.policy !== 'LOCAL_ONLY' || executionRaw.cloudAllowed !== false || executionRaw.maxPaidCredits !== 0) {
    fail('aee_admitted_plan_execution_widened', 'AE-4 V1 durable plans must remain LOCAL_ONLY with zero cloud and paid-credit authority');
  }
  const effectiveExecution = deepFreeze({
    policy: 'LOCAL_ONLY' as const,
    cloudAllowed: false as const,
    maxPaidCredits: 0 as const,
    maxNodes: integer(executionRaw.maxNodes, 'graph.effectiveExecution.maxNodes', 1, 32),
    maxRetries: integer(executionRaw.maxRetries, 'graph.effectiveExecution.maxRetries', 0, 8),
    maxReplans: integer(executionRaw.maxReplans, 'graph.effectiveExecution.maxReplans', 0, 8),
    maxCandidates: integer(executionRaw.maxCandidates, 'graph.effectiveExecution.maxCandidates', 1, 16),
    maxWallClockMs: integer(executionRaw.maxWallClockMs, 'graph.effectiveExecution.maxWallClockMs', 1_000, 86_400_000),
    maxMemoryBytes: integer(executionRaw.maxMemoryBytes, 'graph.effectiveExecution.maxMemoryBytes', 1_048_576, 137_438_953_472),
  });

  const rawNodes = denseArray(root.nodes, 'graph.nodes', 1, 32);
  if (rawNodes.length > effectiveExecution.maxNodes) {
    fail('aee_admitted_plan_node_budget_exceeded', 'Durable admitted graph exceeds its own maxNodes authority');
  }
  const shells = rawNodes.map((node, index) => normalizeNodeShell(node, index));
  const byId = new Map<string, NodeShell>();
  for (const shell of shells) {
    if (byId.has(shell.nodeId)) fail('aee_admitted_plan_duplicate_node', `Duplicate admitted nodeId: ${shell.nodeId}`);
    byId.set(shell.nodeId, shell);
  }
  const topology = deterministicTopology(shells, byId);
  if (!sameArray(topology, shells.map(node => node.nodeId))) {
    fail('aee_admitted_plan_topology_noncanonical', 'Admitted graph nodes are not in the deterministic AE-3 topological order');
  }

  const compiledById = new Map<string, AeeAdmittedPlanNodeV1>();
  const nodes: AeeAdmittedPlanNodeV1[] = [];
  for (const shell of shells) {
    const node = normalizeNodeSemantics(shell, source, effectiveExecution.maxMemoryBytes, compiledById);
    compiledById.set(node.nodeId, node);
    nodes.push(node);
  }

  const sinks = singleSinks(nodes);
  if (sinks.length !== 1) fail('aee_admitted_plan_terminal_count_invalid', 'AE-4 V1 durable graph requires one terminal node');
  const terminalNode = compiledById.get(sinks[0]);
  if (!terminalNode) fail('aee_admitted_plan_terminal_missing', 'Terminal admitted node is unavailable');
  const terminalRaw = exactRecord(root.terminal, TERMINAL_KEYS, TERMINAL_KEYS, 'graph.terminal');
  const terminalId = nodeId(terminalRaw.nodeId, 'graph.terminal.nodeId');
  const terminalHooks = stringArray(terminalRaw.evaluatorHooks, 'graph.terminal.evaluatorHooks', 16);
  if (terminalId !== terminalNode.nodeId || !sameArray(terminalHooks, terminalNode.evaluatorHooks)) {
    fail('aee_admitted_plan_terminal_mismatch', 'Terminal binding differs from the canonical terminal admitted node');
  }
  const terminal = deepFreeze({ nodeId: terminalNode.nodeId, evaluatorHooks: Object.freeze([...terminalNode.evaluatorHooks]) });

  const authority = deepFreeze({
    schemaVersion: AEE_ADMITTED_PLAN_GRAPH_V1_SCHEMA,
    compilerVersion: AEE_PLAN_COMPILER_V1_VERSION,
    intentDigest: sha256(root.intentDigest, 'graph.intentDigest'),
    proposalDigest: sha256(root.proposalDigest, 'graph.proposalDigest'),
    capabilityRegistry,
    source,
    effectiveExecution,
    nodes: Object.freeze(nodes),
    terminal,
  });
  const expectedDigest = digestAuthority(authority);
  const digest = sha256(root.digest, 'graph.digest');
  if (digest !== expectedDigest) fail('aee_admitted_plan_digest_mismatch', 'Admitted graph body does not reproduce its AE-3 digest');
  const graph = deepFreeze({ ...authority, digest });

  if (JSON.stringify(canonicalValue(root)) !== JSON.stringify(canonicalValue(graph))) {
    fail('aee_admitted_plan_noncanonical', 'Admitted graph bytes are not the exact canonical AE-3 representation');
  }
  return graph;
}

export function serializeAeeAdmittedPlanGraphV1(raw: unknown): string {
  return JSON.stringify(canonicalValue(normalizeAeeAdmittedPlanGraphV1(raw)));
}

function normalizeNodeShell(raw: unknown, index: number): NodeShell {
  const path = `graph.nodes[${index}]`;
  const record = exactRecord(raw, NODE_KEYS, NODE_KEYS, path);
  const id = nodeId(record.nodeId, `${path}.nodeId`);
  const capabilityId = token(record.capabilityId, `${path}.capabilityId`, 160);
  const capabilityVersion = integer(record.capabilityVersion, `${path}.capabilityVersion`, 1, 1_000_000);
  let descriptor: AeeCapabilityDescriptorV1;
  try { descriptor = requireAeeCapabilityDescriptorV1(capabilityId, capabilityVersion); }
  catch (error) {
    if (error instanceof AeeCapabilityRegistryV1Error) fail('aee_admitted_plan_capability_unavailable', error.message);
    throw error;
  }
  if (!descriptor.executionEligibility.deterministic || !descriptor.executionEligibility.local
    || descriptor.executionEligibility.cloud || descriptor.executionEligibility.hybrid) {
    fail('aee_admitted_plan_capability_realization_invalid', `${capabilityId} is outside deterministic LOCAL_ONLY AE-4 V1`);
  }
  if (record.semanticOperation !== descriptor.semanticOperation
    || record.sideEffectClass !== descriptor.sideEffectClass
    || record.resourceClass !== descriptor.resourceClass
    || record.requiredEvidence !== descriptor.requiredEvidence) {
    fail('aee_admitted_plan_descriptor_mismatch', `${id} differs from its accepted AE-2 descriptor`);
  }
  const preconditions = stringArray(record.preconditions, `${path}.preconditions`, 16);
  const evaluatorHooks = stringArray(record.evaluatorHooks, `${path}.evaluatorHooks`, 16);
  if (!sameArray(preconditions, descriptor.preconditions) || !sameArray(evaluatorHooks, descriptor.evaluatorHooks)) {
    fail('aee_admitted_plan_descriptor_mismatch', `${id} descriptor hooks differ from AE-2`);
  }

  const dependsOn = nodeIdSet(record.dependsOn, `${path}.dependsOn`, 31);
  if (dependsOn.includes(id)) fail('aee_admitted_plan_self_dependency', `${id} cannot depend on itself`);
  const inputs = denseArray(record.inputs, `${path}.inputs`, 1, 8).map((value, inputIndex) => normalizeInput(value, `${path}.inputs[${inputIndex}]`));
  const outputRaw = exactRecord(record.output, OUTPUT_KEYS, OUTPUT_KEYS, `${path}.output`);
  return deepFreeze({
    nodeId: id,
    capabilityId,
    capabilityVersion,
    descriptor,
    dependsOn,
    inputs: Object.freeze(inputs),
    parameters: parameterRecord(record.parameters, `${path}.parameters`),
    output: deepFreeze({
      artifactRole: artifactRole(outputRaw.artifactRole, `${path}.output.artifactRole`),
      width: dimension(outputRaw.width, `${path}.output.width`),
      height: dimension(outputRaw.height, `${path}.output.height`),
    }),
  });
}

function normalizeInput(raw: unknown, path: string): AeeAdmittedPlanInputV1 {
  const record = exactRecord(raw, INPUT_KEYS, INPUT_KEYS, path);
  const sourceRaw = plainRecord(record.source, `${path}.source`);
  let source: AeeAdmittedPlanInputV1['source'];
  if (sourceRaw.kind === 'INTENT_SOURCE') {
    exactKeys(sourceRaw, INTENT_SOURCE_KEYS, INTENT_SOURCE_KEYS, `${path}.source`);
    source = Object.freeze({ kind: 'INTENT_SOURCE' as const });
  } else if (sourceRaw.kind === 'NODE_OUTPUT') {
    exactKeys(sourceRaw, NODE_SOURCE_KEYS, NODE_SOURCE_KEYS, `${path}.source`);
    source = Object.freeze({ kind: 'NODE_OUTPUT' as const, nodeId: nodeId(sourceRaw.nodeId, `${path}.source.nodeId`) });
  } else fail('aee_admitted_plan_input_source_invalid', `${path}.source.kind is unsupported`);
  return deepFreeze({
    name: token(record.name, `${path}.name`, 80),
    source,
    artifactRole: artifactRole(record.artifactRole, `${path}.artifactRole`),
  });
}

function normalizeNodeSemantics(
  shell: NodeShell,
  source: AdmittedPlanGraphV1['source'],
  maxMemoryBytes: number,
  compiledById: ReadonlyMap<string, AeeAdmittedPlanNodeV1>,
): AeeAdmittedPlanNodeV1 {
  const descriptor = shell.descriptor;
  if (shell.inputs.length !== descriptor.inputs.length) {
    fail('aee_admitted_plan_input_contract_mismatch', `${shell.nodeId} input count differs from AE-2`);
  }
  const admittedInputs: AeeAdmittedPlanInputV1[] = [];
  let sourceGeometry: Readonly<{ width: number; height: number }> | undefined;
  const dependencyIds: string[] = [];
  for (const expected of descriptor.inputs) {
    const input = shell.inputs.find(candidate => candidate.name === expected.name);
    if (!input) fail('aee_admitted_plan_input_contract_mismatch', `${shell.nodeId} is missing input ${expected.name}`);
    let resolvedRole: ArtifactRole;
    let geometry: Readonly<{ width: number; height: number }>;
    if (input.source.kind === 'INTENT_SOURCE') {
      resolvedRole = source.artifactRole;
      geometry = { width: source.width, height: source.height };
    } else {
      const upstream = compiledById.get(input.source.nodeId);
      if (!upstream) fail('aee_admitted_plan_upstream_unavailable', `${shell.nodeId} reads non-prior node ${input.source.nodeId}`);
      resolvedRole = upstream.output.artifactRole;
      geometry = { width: upstream.output.width, height: upstream.output.height };
      dependencyIds.push(input.source.nodeId);
    }
    if (input.artifactRole !== resolvedRole || !expected.artifactRoles.includes(resolvedRole)) {
      fail('aee_admitted_plan_artifact_role_mismatch', `${shell.nodeId}.${expected.name} has invalid durable Artifact role binding`);
    }
    if (expected.name === 'source') sourceGeometry = geometry;
    admittedInputs.push(deepFreeze({ name: expected.name, source: input.source, artifactRole: resolvedRole }));
  }
  if (new Set(shell.inputs.map(input => input.name)).size !== descriptor.inputs.length) {
    fail('aee_admitted_plan_input_contract_mismatch', `${shell.nodeId} inputs differ from AE-2`);
  }
  if (!sameArray([...new Set(dependencyIds)].sort(), shell.dependsOn)) {
    fail('aee_admitted_plan_dependency_input_mismatch', `${shell.nodeId} dependencies differ from NODE_OUTPUT inputs`);
  }
  if (!sourceGeometry) fail('aee_admitted_plan_source_geometry_missing', `${shell.nodeId} has no source geometry`);

  const normalized = normalizeParameters(shell, sourceGeometry);
  if (shell.output.artifactRole !== descriptor.outputArtifactRole
    || shell.output.width !== normalized.output.width || shell.output.height !== normalized.output.height) {
    fail('aee_admitted_plan_output_mismatch', `${shell.nodeId} output differs from deterministic AE-3 geometry`);
  }
  const outputBytes = shell.output.width * shell.output.height * 4;
  if (!Number.isSafeInteger(outputBytes) || outputBytes > maxMemoryBytes) {
    fail('aee_admitted_plan_memory_floor_exceeded', `${shell.nodeId} output exceeds admitted maxMemoryBytes`);
  }

  return deepFreeze({
    nodeId: shell.nodeId,
    capabilityId: descriptor.capabilityId,
    capabilityVersion: descriptor.capabilityVersion,
    semanticOperation: descriptor.semanticOperation,
    dependsOn: Object.freeze([...shell.dependsOn]),
    inputs: Object.freeze(admittedInputs),
    parameters: normalized.parameters,
    preconditions: Object.freeze([...descriptor.preconditions]) as readonly AeeCapabilityPreconditionV1[],
    output: deepFreeze({ artifactRole: descriptor.outputArtifactRole, width: normalized.output.width, height: normalized.output.height }),
    evaluatorHooks: Object.freeze([...descriptor.evaluatorHooks]) as readonly AeeCapabilityEvaluatorHookV1[],
    sideEffectClass: descriptor.sideEffectClass,
    resourceClass: descriptor.resourceClass,
    requiredEvidence: descriptor.requiredEvidence,
  });
}

function normalizeParameters(shell: NodeShell, source: Readonly<{ width: number; height: number }>) {
  if (shell.capabilityId === AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1) {
    exactParameterKeys(shell.parameters, ['mode'], shell.nodeId);
    let mode: ReturnType<typeof normalizeOrthogonalTransformMode>;
    try { mode = normalizeOrthogonalTransformMode(shell.parameters.mode); }
    catch (error) { fail('aee_admitted_plan_parameters_invalid', error instanceof Error ? error.message : 'Orthogonal parameters invalid'); }
    return deepFreeze({ parameters: deepFreeze({ mode }), output: orthogonalTransformOutputGeometry(source.width, source.height, mode) });
  }
  if (shell.capabilityId === AEE_CAPABILITY_RESIZE_V1) {
    exactParameterKeys(shell.parameters, ['height', 'width'], shell.nodeId);
    let target: ReturnType<typeof normalizeResizeDimensions>;
    try {
      target = normalizeResizeDimensions(
        { width: shell.parameters.width as number, height: shell.parameters.height as number },
        source.width,
        source.height,
      );
    } catch (error) { fail('aee_admitted_plan_parameters_invalid', error instanceof Error ? error.message : 'Resize parameters invalid'); }
    return deepFreeze({ parameters: deepFreeze({ height: target.height, width: target.width }), output: target });
  }
  fail('aee_admitted_plan_parameter_contract_unavailable', `No AE-4 V1 adapter parameter contract exists for ${shell.capabilityId}`);
}

function deterministicTopology(nodes: readonly NodeShell[], byId: ReadonlyMap<string, NodeShell>): readonly string[] {
  const indegree = new Map(nodes.map(node => [node.nodeId, node.dependsOn.length]));
  const dependents = new Map(nodes.map(node => [node.nodeId, [] as string[]]));
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) fail('aee_admitted_plan_unknown_dependency', `${node.nodeId} depends on unknown node ${dependency}`);
      dependents.get(dependency)?.push(node.nodeId);
    }
  }
  const ready = nodes.filter(node => indegree.get(node.nodeId) === 0).map(node => node.nodeId).sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    ordered.push(current);
    for (const child of [...(dependents.get(current) ?? [])].sort((a, b) => a.localeCompare(b))) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) { ready.push(child); ready.sort((a, b) => a.localeCompare(b)); }
    }
  }
  if (ordered.length !== nodes.length) fail('aee_admitted_plan_cycle', 'Durable admitted graph contains a dependency cycle');
  return Object.freeze(ordered);
}

function singleSinks(nodes: readonly AeeAdmittedPlanNodeV1[]): readonly string[] {
  const dependedOn = new Set<string>();
  for (const node of nodes) for (const dependency of node.dependsOn) dependedOn.add(dependency);
  return Object.freeze(nodes.filter(node => !dependedOn.has(node.nodeId)).map(node => node.nodeId));
}

function digestAuthority(authority: Omit<AdmittedPlanGraphV1, 'digest'>): string {
  return createHash('sha256').update(DIGEST_DOMAIN).update(JSON.stringify(canonicalValue(authority))).digest('hex');
}

function exactParameterKeys(parameters: Parameters, expected: readonly string[], node: string): void {
  const actual = Object.keys(parameters).sort((a, b) => a.localeCompare(b));
  const wanted = [...expected].sort((a, b) => a.localeCompare(b));
  if (!sameArray(actual, wanted)) fail('aee_admitted_plan_parameter_contract_mismatch', `${node} parameters must be exactly ${wanted.join(',')}`);
}

function parameterRecord(raw: unknown, path: string): Parameters {
  const record = plainRecord(raw, path);
  const entries = Object.entries(record);
  if (entries.length > 16) fail('aee_admitted_plan_parameters_too_large', `${path} exceeds 16 parameters`);
  const normalized: Record<string, Primitive> = {};
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-z][A-Za-z0-9_]{0,63}$/u.test(key)) fail('aee_admitted_plan_parameter_name_invalid', `${path}.${key} is invalid`);
    if (typeof value === 'string') normalized[key] = token(value, `${path}.${key}`, 256);
    else if (typeof value === 'number') normalized[key] = integer(value, `${path}.${key}`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    else if (typeof value === 'boolean') normalized[key] = value;
    else fail('aee_admitted_plan_parameter_value_invalid', `${path}.${key} is invalid`);
  }
  return deepFreeze(normalized);
}

function nodeIdSet(raw: unknown, path: string, max: number): readonly string[] {
  const values = denseArray(raw, path, 0, max).map((value, index) => nodeId(value, `${path}[${index}]`));
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  if (unique.length !== values.length) fail('aee_admitted_plan_set_duplicate', `${path} contains duplicates`);
  return Object.freeze(unique);
}

function stringArray(raw: unknown, path: string, max: number): readonly string[] {
  return Object.freeze(denseArray(raw, path, 0, max).map((value, index) => token(value, `${path}[${index}]`, 160)));
}

function denseArray(raw: unknown, path: string, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) fail('aee_admitted_plan_array_invalid', `${path} must contain ${min}..${max} items`);
  for (let index = 0; index < raw.length; index += 1) if (!Object.prototype.hasOwnProperty.call(raw, index)) fail('aee_admitted_plan_array_invalid', `${path} must be dense`);
  return raw;
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  const record = plainRecord(raw, path);
  exactKeys(record, allowed, required, path);
  return record;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) if (!allowedSet.has(key)) fail('aee_admitted_plan_exact_schema_violation', `${path} contains unsupported key ${key}`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(record, key)) fail('aee_admitted_plan_exact_schema_violation', `${path} is missing ${key}`);
}

function plainRecord(raw: unknown, path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('aee_admitted_plan_exact_schema_violation', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('aee_admitted_plan_exact_schema_violation', `${path} must be a plain object`);
  return raw as Record<string, unknown>;
}

function artifactRole(raw: unknown, path: string): ArtifactRole {
  if (typeof raw !== 'string' || !ARTIFACT_ROLES.includes(raw as ArtifactRole)) fail('aee_admitted_plan_artifact_role_invalid', `${path} is unsupported`);
  return raw as ArtifactRole;
}

function nodeId(raw: unknown, path: string): string {
  const value = token(raw, path, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) fail('aee_admitted_plan_node_id_invalid', `${path} is invalid`);
  return value;
}

function dimension(raw: unknown, path: string): number { return integer(raw, path, 1, 1_000_000); }

function integer(raw: unknown, path: string, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) fail('aee_admitted_plan_integer_invalid', `${path} must be a safe integer in range`);
  return raw;
}

function sourceReference(raw: unknown, path: string): string {
  if (typeof raw !== 'string') fail('aee_admitted_plan_source_ref_invalid', `${path} must be a string`);
  const normalized = raw.trim();
  if (!normalized || normalized !== raw || Buffer.byteLength(raw, 'utf8') > MAX_SOURCE_REFERENCE_BYTES
    || /[\u0000-\u001f\u007f]/u.test(raw)) {
    fail('aee_admitted_plan_source_ref_invalid', `${path} is outside the bounded opaque-reference contract`);
  }
  return raw;
}

function token(raw: unknown, path: string, max: number): string {
  if (typeof raw !== 'string') fail('aee_admitted_plan_text_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail('aee_admitted_plan_text_invalid', `${path} is invalid`);
  return value;
}

function sha256(raw: unknown, path: string): string {
  const value = token(raw, path, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(value)) fail('aee_admitted_plan_sha256_invalid', `${path} must be SHA-256 hex`);
  return value;
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never { throw new AeeAdmittedPlanCodecV1Error(code, message); }

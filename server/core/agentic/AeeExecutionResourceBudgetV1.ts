import { requireDeterministicToolByCapability } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  DeterministicExecutionResourceModelV1Error,
  estimateDeterministicExecutionResourcesV1,
  type DeterministicExecutionResourceEstimateV1,
} from '../localExecution/DeterministicExecutionResourceModelV1.ts';
import { requireAeeAdmittedNodeExecutionAdapterV1 } from './AeeCapabilityExecutionAdapterRegistryV1.ts';
import type { AdmittedPlanGraphV1, AeeAdmittedPlanNodeV1 } from './AeePlanCompilerV1.ts';

export const AEE_EXECUTION_RESOURCE_BUDGET_V1_SCHEMA = 'BERS_AEE_EXECUTION_RESOURCE_BUDGET_V1' as const;
export const AEE_EXECUTION_RESOURCE_BUDGET_V1_VERSION = 1 as const;

type Geometry = Readonly<{ width: number; height: number }>;

export type AeeNodeExecutionResourceEstimateV1 = Readonly<{
  schemaVersion: typeof AEE_EXECUTION_RESOURCE_BUDGET_V1_SCHEMA;
  version: typeof AEE_EXECUTION_RESOURCE_BUDGET_V1_VERSION;
  nodeId: string;
  capabilityId: string;
  capabilityVersion: number;
  estimate: DeterministicExecutionResourceEstimateV1;
}>;

export class AeeExecutionResourceBudgetV1Error extends Error {
  readonly code: string;
  readonly status: number;
  readonly nodeId?: string;
  readonly requiredBytes?: number;
  readonly admittedBytes?: number;

  constructor(
    code: string,
    message: string,
    details: Readonly<{ status?: number; nodeId?: string; requiredBytes?: number; admittedBytes?: number }> = {},
  ) {
    super(message);
    this.name = 'AeeExecutionResourceBudgetV1Error';
    this.code = code;
    this.status = details.status ?? 409;
    this.nodeId = details.nodeId;
    this.requiredBytes = details.requiredBytes;
    this.admittedBytes = details.admittedBytes;
  }
}

/**
 * Resolve resource estimates only from immutable admitted graph semantics and
 * Core-owned exact deterministic executor registrations. No browser/planner
 * memory claim is accepted as input to this authority.
 */
export function estimateAeeAdmittedGraphExecutionResourcesV1(
  graph: AdmittedPlanGraphV1,
): readonly AeeNodeExecutionResourceEstimateV1[] {
  validateGraphBudget(graph);
  const byNode = new Map<string, AeeAdmittedPlanNodeV1>();
  const estimates: AeeNodeExecutionResourceEstimateV1[] = [];

  for (const node of graph.nodes) {
    const source = sourceGeometry(graph, node, byNode);
    const adapter = requireAeeAdmittedNodeExecutionAdapterV1(node);
    let tool;
    try {
      tool = requireDeterministicToolByCapability(adapter.toolCapability);
    } catch (error) {
      throw budgetError('aee_resource_executor_unavailable', `AEE node ${node.nodeId} has no canonical deterministic tool resource authority`, node.nodeId, error);
    }
    if (tool.capability !== adapter.toolCapability || tool.operation.type !== node.semanticOperation) {
      throw budgetError('aee_resource_executor_binding_mismatch', `AEE node ${node.nodeId} differs from its deterministic execution adapter`, node.nodeId);
    }

    let estimate: DeterministicExecutionResourceEstimateV1;
    try {
      estimate = estimateDeterministicExecutionResourcesV1(tool, source, node.output);
    } catch (error) {
      if (error instanceof DeterministicExecutionResourceModelV1Error) {
        throw budgetError('aee_resource_profile_unavailable', `AEE node ${node.nodeId} cannot be admitted under a claimed memory budget: ${error.message}`, node.nodeId, error);
      }
      throw error;
    }

    estimates.push(deepFreeze({
      schemaVersion: AEE_EXECUTION_RESOURCE_BUDGET_V1_SCHEMA,
      version: AEE_EXECUTION_RESOURCE_BUDGET_V1_VERSION,
      nodeId: node.nodeId,
      capabilityId: node.capabilityId,
      capabilityVersion: node.capabilityVersion,
      estimate,
    }));
    byNode.set(node.nodeId, node);
  }

  return Object.freeze(estimates);
}

/**
 * Enforce the immutable graph-wide memory envelope before an execution attempt
 * is allowed to enter the local deterministic ticket path.
 */
export function assertAeeAdmittedGraphMemoryBudgetV1(
  graph: AdmittedPlanGraphV1,
): readonly AeeNodeExecutionResourceEstimateV1[] {
  const estimates = estimateAeeAdmittedGraphExecutionResourcesV1(graph);
  const admittedBytes = graph.effectiveExecution.maxMemoryBytes;
  for (const binding of estimates) {
    const requiredBytes = binding.estimate.requiredPeakMemoryBytes;
    if (requiredBytes > admittedBytes) {
      throw new AeeExecutionResourceBudgetV1Error(
        'aee_execution_memory_budget_exceeded',
        `AEE node ${binding.nodeId} requires ${requiredBytes} bytes but the admitted graph allows ${admittedBytes}`,
        { status: 422, nodeId: binding.nodeId, requiredBytes, admittedBytes },
      );
    }
  }
  return estimates;
}

function sourceGeometry(
  graph: AdmittedPlanGraphV1,
  node: AeeAdmittedPlanNodeV1,
  byNode: ReadonlyMap<string, AeeAdmittedPlanNodeV1>,
): Geometry {
  if (node.inputs.length !== 1 || node.inputs[0].name !== 'source') {
    throw budgetError('aee_resource_input_surface_unsupported', `AEE node ${node.nodeId} does not expose the single-source V1 resource surface`, node.nodeId);
  }
  const input = node.inputs[0];
  if (input.source.kind === 'INTENT_SOURCE') {
    if (node.dependsOn.length !== 0 || input.artifactRole !== graph.source.artifactRole) {
      throw budgetError('aee_resource_source_binding_invalid', `AEE node ${node.nodeId} has an invalid admitted root resource binding`, node.nodeId);
    }
    return geometry(graph.source.width, graph.source.height, node.nodeId);
  }

  const upstream = byNode.get(input.source.nodeId);
  if (!upstream || node.dependsOn.length !== 1 || node.dependsOn[0] !== upstream.nodeId
    || input.artifactRole !== upstream.output.artifactRole) {
    throw budgetError('aee_resource_dependency_binding_invalid', `AEE node ${node.nodeId} has an invalid admitted dependency resource binding`, node.nodeId);
  }
  return geometry(upstream.output.width, upstream.output.height, node.nodeId);
}

function validateGraphBudget(graph: AdmittedPlanGraphV1): void {
  const value = graph?.effectiveExecution?.maxMemoryBytes;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw budgetError('aee_resource_budget_invalid', 'Admitted AEE maxMemoryBytes must be a positive safe integer');
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 1) {
    throw budgetError('aee_resource_graph_invalid', 'Admitted AEE graph must contain at least one node');
  }
}

function geometry(width: number, height: number, nodeId: string): Geometry {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw budgetError('aee_resource_geometry_invalid', `AEE node ${nodeId} has invalid resource geometry`, nodeId);
  }
  return Object.freeze({ width, height });
}

function budgetError(code: string, message: string, nodeId?: string, cause?: unknown): AeeExecutionResourceBudgetV1Error {
  const error = new AeeExecutionResourceBudgetV1Error(code, message, { status: 409, nodeId });
  if (cause !== undefined) Object.defineProperty(error, 'cause', { value: cause, enumerable: false });
  return error;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

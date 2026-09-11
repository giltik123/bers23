import type { LocalExecutionTicketIssueRequestV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import { requireDeterministicToolByCapability } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import type { WorkflowContinuationStore } from '../workflow/WorkflowContinuationStore.ts';
import type { WorkflowBoundLocalExecutionTicketV2IssueGuard } from '../workflow/WorkflowBoundLocalExecutionTicketV2Issuer.ts';
import { requireAeeAdmittedNodeExecutionAdapterV1 } from './AeeCapabilityExecutionAdapterRegistryV1.ts';
import { assertAeeAdmittedGraphMemoryBudgetV1 } from './AeeExecutionResourceBudgetV1.ts';
import { AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID } from './AeeSerialAdmittedGraphDriverV1.ts';
import type { PostgresAeeAdmittedPlanStore } from './PostgresAeeAdmittedPlanStore.ts';

type ContinuationReader = Pick<WorkflowContinuationStore, 'get'>;
type PlanReader = Pick<PostgresAeeAdmittedPlanStore, 'get'>;
type Snapshot = NonNullable<Awaited<ReturnType<ContinuationReader['get']>>>;
type DurablePlan = NonNullable<Awaited<ReturnType<PlanReader['get']>>>;

export class AeeWorkflowTicketResourceAdmissionV1Error extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = 'AeeWorkflowTicketResourceAdmissionV1Error';
    this.code = code;
    this.status = status;
  }
}

/**
 * #548 resource admission at the last server-owned seam before a genuinely-new
 * local execution ticket is issued.
 *
 * It is intentionally subordinate to WorkflowContinuation + immutable
 * AdmittedPlanGraph authority. Non-AEE workflow bindings are ignored. Existing
 * durable tickets are replayed by WorkflowBoundLocalExecutionTicketV2Issuer
 * before this guard is consulted, so profile changes cannot retroactively revoke
 * an already-issued attempt or prevent submission of its result.
 */
export class AeeWorkflowTicketResourceAdmissionV1 implements WorkflowBoundLocalExecutionTicketV2IssueGuard {
  private readonly continuations: ContinuationReader;
  private readonly plans: PlanReader;

  constructor(input: Readonly<{ continuations: ContinuationReader; plans: PlanReader }>) {
    this.continuations = input.continuations;
    this.plans = input.plans;
  }

  async beforeIssue(input: LocalExecutionTicketIssueRequestV2): Promise<void> {
    const snapshot = await this.continuations.get(input.workflowId, input.scope);
    if (!snapshot || snapshot.plan.planId !== AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID) return;
    if (isTerminal(snapshot.state)) {
      throw admissionError('aee_resource_ticket_terminal_workflow', `AEE workflow ${snapshot.executionId} is already ${snapshot.state}`);
    }

    const durable = await this.plans.get(snapshot.scope, snapshot.plan.planDigest);
    if (!durable || durable.graph.digest !== snapshot.plan.planDigest) {
      throw admissionError('aee_resource_plan_unavailable', 'AEE resource admission cannot resolve the immutable admitted graph');
    }
    const graph = durable.graph;
    if (graph.source.projectId !== snapshot.scope.projectId) {
      throw admissionError('aee_resource_plan_scope_mismatch', 'AEE resource graph project scope differs from the durable workflow');
    }

    const nodeIndex = snapshot.completedSteps.length;
    const node = graph.nodes[nodeIndex];
    if (!node) throw admissionError('aee_resource_node_unavailable', 'AEE workflow has no admitted node for a new local ticket');
    if (snapshot.state === 'WAITING_FOR_LOCAL_RESULT' && snapshot.currentStepId !== node.nodeId) {
      throw admissionError('aee_resource_node_state_mismatch', 'AEE retry resource admission is not bound to the current admitted node');
    }
    if (snapshot.state !== 'READY' && snapshot.state !== 'WAITING_FOR_LOCAL_RESULT') {
      throw admissionError('aee_resource_workflow_state_invalid', `AEE workflow state ${snapshot.state} cannot issue a local ticket`);
    }

    assertIssueMatchesNode(input, snapshot, durable, nodeIndex);
    assertAeeAdmittedGraphMemoryBudgetV1(graph);
  }
}

function assertIssueMatchesNode(
  input: LocalExecutionTicketIssueRequestV2,
  snapshot: Snapshot,
  durable: DurablePlan,
  nodeIndex: number,
): void {
  const graph = durable.graph;
  const node = graph.nodes[nodeIndex];
  if (!node) throw admissionError('aee_resource_node_unavailable', 'AEE resource node is unavailable');
  const adapter = requireAeeAdmittedNodeExecutionAdapterV1(node);
  const tool = requireDeterministicToolByCapability(adapter.toolCapability);

  if (input.ticketVersion !== '2'
    || input.workflowId !== snapshot.executionId
    || input.scope.tenantId !== snapshot.scope.tenantId
    || input.scope.userId !== snapshot.scope.userId
    || input.scope.projectId !== snapshot.scope.projectId
    || input.policy !== 'LOCAL_ONLY'
    || input.stepId !== tool.operation.id
    || input.operation.id !== tool.operation.id
    || input.operation.type !== tool.operation.type
    || input.operation.version !== tool.operation.version
    || input.operation.capability !== tool.capability) {
    throw admissionError('aee_resource_ticket_contract_mismatch', `Local ticket request differs from admitted AEE node ${node.nodeId}`);
  }

  if (input.inputs.length !== 1 || node.inputs.length !== 1 || node.inputs[0].name !== 'source' || tool.inputs.length !== 1 || tool.inputs[0].name !== 'source') {
    throw admissionError('aee_resource_ticket_input_mismatch', `AEE node ${node.nodeId} must issue exactly one canonical source input`);
  }
  const expectedSourceArtifactId = sourceArtifactIdFor(snapshot, graph, nodeIndex);
  const ticketInput = input.inputs[0];
  if (ticketInput.artifactId !== expectedSourceArtifactId
    || ticketInput.kind !== tool.inputs[0].kind
    || ticketInput.role !== node.inputs[0].artifactRole
    || !tool.inputs[0].roles.includes(node.inputs[0].artifactRole)) {
    throw admissionError('aee_resource_ticket_input_mismatch', `Local ticket source differs from admitted AEE node ${node.nodeId}`);
  }

  assertExactOperationParameters(input, node.parameters, tool.parameters.exact, tool.parameters.artifactIdBindings, expectedSourceArtifactId, node.nodeId);

  if (input.expectedOutputs.length !== 1) {
    throw admissionError('aee_resource_ticket_output_mismatch', `AEE node ${node.nodeId} must issue exactly one output`);
  }
  const output = input.expectedOutputs[0];
  if (output.kind !== tool.output.kind
    || output.role !== node.output.artifactRole
    || output.role !== tool.output.role
    || output.count !== tool.output.count
    || !sameStrings(output.mimeTypes, tool.output.mimeTypes)
    || output.width !== node.output.width
    || output.height !== node.output.height) {
    throw admissionError('aee_resource_ticket_output_mismatch', `Local ticket output differs from admitted AEE node ${node.nodeId}`);
  }
}

function assertExactOperationParameters(
  input: LocalExecutionTicketIssueRequestV2,
  nodeParameters: Readonly<Record<string, string | number | boolean>>,
  exactParameters: Readonly<Record<string, string | number | boolean>>,
  artifactBindings: readonly Readonly<{ parameter: string; input: string }>[],
  sourceArtifactId: string,
  nodeId: string,
): void {
  const parameters = input.operation.parameters;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw admissionError('aee_resource_ticket_parameter_mismatch', `Local ticket parameters are unavailable for admitted AEE node ${nodeId}`);
  }
  const expected = new Map<string, unknown>();
  for (const [key, value] of Object.entries(exactParameters)) expected.set(key, value);
  for (const binding of artifactBindings) {
    if (binding.input !== 'source') throw admissionError('aee_resource_ticket_parameter_mismatch', `AEE node ${nodeId} has an unsupported ticket artifact binding`);
    expected.set(binding.parameter, sourceArtifactId);
  }
  for (const [key, value] of Object.entries(nodeParameters)) expected.set(key, value);

  const actualKeys = Object.keys(parameters).sort();
  const expectedKeys = [...expected.keys()].sort();
  if (!sameStrings(actualKeys, expectedKeys)) {
    throw admissionError('aee_resource_ticket_parameter_mismatch', `Local ticket parameter surface differs from admitted AEE node ${nodeId}`);
  }
  for (const [key, value] of expected) {
    if (parameters[key] !== value) {
      throw admissionError('aee_resource_ticket_parameter_mismatch', `Local ticket parameter ${key} differs from admitted AEE node ${nodeId}`);
    }
  }
}

function sourceArtifactIdFor(snapshot: Snapshot, graph: DurablePlan['graph'], nodeIndex: number): string {
  const node = graph.nodes[nodeIndex];
  if (!node || node.inputs.length !== 1) throw admissionError('aee_resource_source_binding_invalid', 'AEE resource node source binding is invalid');
  const source = node.inputs[0].source;
  if (source.kind === 'INTENT_SOURCE') {
    if (node.dependsOn.length !== 0) throw admissionError('aee_resource_source_binding_invalid', 'AEE root resource node has dependencies');
    return graph.source.sourceRef;
  }
  if (node.dependsOn.length !== 1 || node.dependsOn[0] !== source.nodeId) {
    throw admissionError('aee_resource_source_binding_invalid', 'AEE dependency resource binding is invalid');
  }
  const dependencyIndex = graph.nodes.findIndex(candidate => candidate.nodeId === source.nodeId);
  if (dependencyIndex < 0 || dependencyIndex >= nodeIndex) {
    throw admissionError('aee_resource_source_binding_invalid', 'AEE dependency is not a prior admitted node');
  }
  const completed = snapshot.completedSteps[dependencyIndex];
  if (!completed || completed.stepId !== source.nodeId || completed.artifactIds.length !== 1) {
    throw admissionError('aee_resource_source_binding_invalid', 'AEE dependency has no exact completed Artifact');
  }
  return completed.artifactIds[0];
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function isTerminal(state: string): boolean {
  return state === 'SUCCESS' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN';
}

function admissionError(code: string, message: string): AeeWorkflowTicketResourceAdmissionV1Error {
  return new AeeWorkflowTicketResourceAdmissionV1Error(code, message);
}

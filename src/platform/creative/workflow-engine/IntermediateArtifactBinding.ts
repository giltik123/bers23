import type { Artifact, CompiledWorkflow, Scope, WorkflowOperation, WorkflowOutputBinding } from './types';

const RESERVED_LINEAGE_KEYS = new Set([
  'artifactRole',
  'canonicalArtifactId',
  'consumerOperationIds',
  'lifecycle',
  'logicalOutputId',
  'outputSlot',
  'parentArtifactIds',
  'producerOperationId',
  'producerStepId',
  'scope',
  'workflowId',
]);

/**
 * Deterministic ephemeral workflow identity. This is not persistent Artifact Authority.
 * Planner logical output references are inputs to this derivation, never authoritative IDs.
 */
export function canonicalIntermediateArtifactId(workflowId: string, producerOperationId: string, slot: number, logicalId: string): string {
  return `workflow:${encodeURIComponent(workflowId)}:step:${encodeURIComponent(producerOperationId)}:output:${slot}:${encodeURIComponent(logicalId)}`;
}

/** Compile planner logical output references into workflow-owned canonical bindings. */
export function compileIntermediateArtifactBindings(workflowId: string, operations: readonly WorkflowOperation[]): readonly WorkflowOperation[] {
  const logicalOwners = new Map<string, Readonly<{ operationId: string; binding: WorkflowOutputBinding }>>();

  for (const operation of operations) {
    const logicalOutputs = operation.outputArtifacts ?? [];
    if (!logicalOutputs.length) continue;
    const kinds = operation.produces ?? [];
    if (logicalOutputs.length !== kinds.length) throw new Error(`Declared output contract mismatch for ${operation.id}`);
    logicalOutputs.forEach((logicalId, slot) => {
      if (!logicalId) throw new Error(`Declared output ${slot} for ${operation.id} requires a logical ID`);
      if (logicalOwners.has(logicalId)) throw new Error(`Duplicate logical output artifact ${logicalId}`);
      logicalOwners.set(logicalId, {
        operationId: operation.id,
        binding: Object.freeze({
          logicalId,
          artifactId: canonicalIntermediateArtifactId(workflowId, operation.id, slot, logicalId),
          kind: kinds[slot],
          slot,
        }),
      });
    });
  }

  return Object.freeze(operations.map(operation => {
    const bindings = (operation.outputArtifacts ?? []).map(logicalId => logicalOwners.get(logicalId)!.binding);
    const requiredArtifacts = (operation.requiredArtifacts ?? []).map(logicalId => {
      const owned = logicalOwners.get(logicalId);
      if (!owned) return logicalId;
      if (!(operation.dependencies ?? []).includes(owned.operationId)) throw new Error(`Illegal intermediate artifact dependency ${logicalId} for ${operation.id}`);
      return owned.binding.artifactId;
    });
    return Object.freeze({
      ...operation,
      requiredArtifacts: Object.freeze(requiredArtifacts),
      outputBindings: bindings.length ? Object.freeze(bindings) : undefined,
    });
  }));
}

/** Seed data cannot impersonate either a logical output reference or its canonical binding. */
export function assertIntermediateSeedIsolation(workflow: CompiledWorkflow, seeds: readonly Artifact[]): void {
  const seedIds = new Set(seeds.map(seed => seed.id));
  for (const operation of workflow.operations) for (const binding of operation.outputBindings ?? []) {
    if (seedIds.has(binding.logicalId) || seedIds.has(binding.artifactId)) throw new Error(`Seed artifact collides with declared intermediate output ${binding.logicalId}`);
  }
}

/**
 * Bind unprivileged runtime payloads to compiled output slots before ArtifactRouter.
 * Runtime IDs/scope/producer/lineage metadata are never copied into canonical identity.
 */
export function bindIntermediateRuntimeOutputs(
  workflow: CompiledWorkflow,
  operation: WorkflowOperation,
  inputs: readonly Artifact[],
  outputs: readonly Readonly<{ id?: string; kind: string; value: unknown; scope?: Scope; producerStepId?: string; metadata?: Readonly<Record<string, unknown>> }>[],
): readonly Artifact[] {
  const bindings = operation.outputBindings ?? [];
  if (!bindings.length) throw new Error(`Operation ${operation.id} has no compiled output bindings`);
  if (outputs.length !== bindings.length) throw new Error(`Runtime output count does not satisfy declared output contract for ${operation.id}`);

  const parentArtifactIds = Object.freeze(inputs.map(input => input.id));
  return Object.freeze(bindings.map((binding, index) => {
    const output = outputs[index];
    if (output.kind !== binding.kind) throw new Error(`Runtime output kind does not satisfy declared output ${binding.logicalId}`);
    const consumerOperationIds = Object.freeze(workflow.operations.filter(candidate => (candidate.requiredArtifacts ?? []).includes(binding.artifactId)).map(candidate => candidate.id));
    return Object.freeze({
      id: binding.artifactId,
      kind: binding.kind,
      value: output.value,
      producerStepId: operation.id,
      scope: workflow.scope,
      metadata: Object.freeze({
        ...sanitizeProviderMetadata(output.metadata),
        workflowId: workflow.id,
        canonicalArtifactId: binding.artifactId,
        producerOperationId: operation.id,
        lifecycle: 'AVAILABLE',
        artifactRole: 'WORKING',
        logicalOutputId: binding.logicalId,
        outputSlot: binding.slot,
        parentArtifactIds,
        consumerOperationIds,
      }),
    });
  }));
}

function sanitizeProviderMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !RESERVED_LINEAGE_KEYS.has(key)));
}

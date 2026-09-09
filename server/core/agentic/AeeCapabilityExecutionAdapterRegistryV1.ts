import {
  AEE_CAPABILITY_REGISTRY_V1,
  AeeCapabilityRegistryV1Error,
  listAeeCapabilityRegistrationsV1,
  requireAeeCapabilityDescriptorV1,
} from './AeeCapabilityRegistryV1.ts';
import type { AeeAdmittedPlanNodeV1 } from './AeePlanCompilerV1.ts';

export const AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1_SCHEMA = 'BERS_AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1' as const;
export const AEE_CAPABILITY_EXECUTION_ADAPTER_V1_SCHEMA = 'BERS_AEE_CAPABILITY_EXECUTION_ADAPTER_V1' as const;
export const AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1_VERSION = 1 as const;

export type AeeCapabilityExecutionAdapterV1 = Readonly<{
  schemaVersion: typeof AEE_CAPABILITY_EXECUTION_ADAPTER_V1_SCHEMA;
  capabilityId: string;
  capabilityVersion: number;
  semanticOperation: string;
  adapterKind: 'LOCAL_DETERMINISTIC_TOOL';
  toolCapability: string;
  sideEffectClass: 'CANDIDATE_ARTIFACT_ONLY';
  requiredEvidence: 'BYTE_EXACT_CORE_RECOMPUTE';
}>;

export type AeeCapabilityExecutionAdapterRegistryV1 = Readonly<{
  schemaVersion: typeof AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1_SCHEMA;
  registryVersion: typeof AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1_VERSION;
  capabilityRegistryVersion: number;
  capabilityRegistryDigest: string;
  adapters: readonly AeeCapabilityExecutionAdapterV1[];
}>;

export class AeeCapabilityExecutionAdapterRegistryV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AeeCapabilityExecutionAdapterRegistryV1Error';
    this.code = code;
  }
}

const adapters = listAeeCapabilityRegistrationsV1()
  .map(({ descriptor, binding }) => {
    if (!descriptor.executionEligibility.deterministic || !descriptor.executionEligibility.local
      || descriptor.executionEligibility.cloud || descriptor.executionEligibility.hybrid
      || binding.kind !== 'DETERMINISTIC_TOOL') {
      fail('aee_execution_adapter_realization_invalid', `${descriptor.capabilityId} is outside deterministic LOCAL_ONLY AE-4 V1`);
    }
    return deepFreeze({
      schemaVersion: AEE_CAPABILITY_EXECUTION_ADAPTER_V1_SCHEMA,
      capabilityId: descriptor.capabilityId,
      capabilityVersion: descriptor.capabilityVersion,
      semanticOperation: descriptor.semanticOperation,
      adapterKind: 'LOCAL_DETERMINISTIC_TOOL' as const,
      toolCapability: binding.toolCapability,
      sideEffectClass: descriptor.sideEffectClass,
      requiredEvidence: descriptor.requiredEvidence,
    });
  })
  .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));

const byId = new Map(adapters.map(adapter => [adapter.capabilityId, adapter]));

export const AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1: AeeCapabilityExecutionAdapterRegistryV1 = deepFreeze({
  schemaVersion: AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1_SCHEMA,
  registryVersion: AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1_VERSION,
  capabilityRegistryVersion: AEE_CAPABILITY_REGISTRY_V1.registryVersion,
  capabilityRegistryDigest: AEE_CAPABILITY_REGISTRY_V1.digest,
  adapters: Object.freeze(adapters),
});

export function listAeeCapabilityExecutionAdaptersV1(): readonly AeeCapabilityExecutionAdapterV1[] {
  return AEE_CAPABILITY_EXECUTION_ADAPTER_REGISTRY_V1.adapters;
}

/**
 * Server-owned AE-4 execution seam. Resolution is subordinate to the accepted
 * AE-2 descriptor/binding and cannot widen an admitted semantic capability.
 */
export function requireAeeCapabilityExecutionAdapterV1(
  capabilityId: string,
  capabilityVersion = 1,
): AeeCapabilityExecutionAdapterV1 {
  try {
    const descriptor = requireAeeCapabilityDescriptorV1(capabilityId, capabilityVersion);
    const adapter = byId.get(descriptor.capabilityId);
    if (!adapter || adapter.capabilityVersion !== descriptor.capabilityVersion) {
      fail('aee_execution_adapter_unavailable', `No AE-4 V1 adapter exists for ${descriptor.capabilityId}@${descriptor.capabilityVersion}`);
    }
    if (adapter.semanticOperation !== descriptor.semanticOperation
      || adapter.sideEffectClass !== descriptor.sideEffectClass
      || adapter.requiredEvidence !== descriptor.requiredEvidence) {
      fail('aee_execution_adapter_descriptor_mismatch', `${descriptor.capabilityId} adapter differs from AE-2 authority`);
    }
    return adapter;
  } catch (error) {
    if (error instanceof AeeCapabilityRegistryV1Error) {
      fail('aee_execution_adapter_not_admitted', `Capability is not admitted by AE-2 V1: ${capabilityId}@${capabilityVersion}`);
    }
    throw error;
  }
}

export function requireAeeAdmittedNodeExecutionAdapterV1(node: AeeAdmittedPlanNodeV1): AeeCapabilityExecutionAdapterV1 {
  const adapter = requireAeeCapabilityExecutionAdapterV1(node.capabilityId, node.capabilityVersion);
  if (adapter.semanticOperation !== node.semanticOperation
    || adapter.sideEffectClass !== node.sideEffectClass
    || adapter.requiredEvidence !== node.requiredEvidence) {
    fail('aee_execution_adapter_node_mismatch', `${node.nodeId} does not match its server-owned AE-4 adapter`);
  }
  return adapter;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new AeeCapabilityExecutionAdapterRegistryV1Error(code, message);
}

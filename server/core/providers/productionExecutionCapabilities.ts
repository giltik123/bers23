import type {
  ExecutionCapabilityDecision,
  ExecutionCapabilityPort,
  ExecutionTarget,
} from '../../../src/platform/creative/canonical/contracts.ts';

export const PRODUCTION_EXECUTION_CAPABILITY_VERSION = '6.41A.1';

type CapabilityRule = Readonly<{
  capabilityId: string;
  operationType: string;
  target: Exclude<ExecutionTarget, 'BLOCKED'>;
  providerId: string;
}>;

const RULES: readonly CapabilityRule[] = Object.freeze([
  Object.freeze({ capabilityId: 'fal:image-edit:v1', operationType: 'image-edit', target: 'CLOUD', providerId: 'fal' }),
  Object.freeze({ capabilityId: 'fal:controlled-local-edit:v1', operationType: 'CONTROLLED_LOCAL_EDIT', target: 'CLOUD', providerId: 'fal' }),
]);

/**
 * Pure production Execution Fabric admission. This proves only that a concrete
 * operation/target/provider contract exists; it grants no scope, budget,
 * persistence, authentication or provider-credential authority.
 */
export class ProductionExecutionCapabilityRegistry implements ExecutionCapabilityPort {
  admit(input: Parameters<ExecutionCapabilityPort['admit']>[0]): ExecutionCapabilityDecision {
    const { operation, target } = input;
    if (target === 'BLOCKED') return denied('TARGET_BLOCKED');

    const operationRules = RULES.filter(rule => rule.operationType === operation.type);
    if (!operationRules.length) return denied('UNSUPPORTED_OPERATION');

    const targetRules = operationRules.filter(rule => rule.target === target);
    if (!targetRules.length) return denied('UNSUPPORTED_TARGET');

    if (!operation.providerId) return denied('PROVIDER_REQUIRED');
    const matched = targetRules.find(rule => rule.providerId === operation.providerId);
    if (!matched) return denied('UNSUPPORTED_PROVIDER');

    return Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: matched.capabilityId });
  }
}

export const productionExecutionCapabilities: ExecutionCapabilityPort = Object.freeze(new ProductionExecutionCapabilityRegistry());

function denied(reasonCode: ExecutionCapabilityDecision['reasonCode']): ExecutionCapabilityDecision {
  return Object.freeze({ allowed: false, reasonCode });
}

import type { ProviderSelectionDecision, ProviderSelectorPort } from '../../../src/platform/creative/canonical/providerSelection.ts';
import type { ExecutionTarget } from '../../../src/platform/creative/canonical/contracts.ts';

export const PRODUCTION_PROVIDER_SELECTION_VERSION = '6.41C1.1';

type ProviderRule = Readonly<{
  selectionId: string;
  operationType: string;
  target: Exclude<ExecutionTarget, 'BLOCKED'>;
  providerId: string;
}>;

const RULES: readonly ProviderRule[] = Object.freeze([
  Object.freeze({ selectionId: 'provider:fal:image-edit:cloud:v1', operationType: 'image-edit', target: 'CLOUD', providerId: 'fal' }),
  Object.freeze({ selectionId: 'provider:fal:controlled-local-edit:cloud:v1', operationType: 'CONTROLLED_LOCAL_EDIT', target: 'CLOUD', providerId: 'fal' }),
]);

/**
 * Pure production provider-selection policy. Planner provider IDs are ignored.
 * This selects only provider identity; it grants no scope, budget, persistence,
 * authentication, credential or provider-call authority.
 */
export class ProductionProviderSelector implements ProviderSelectorPort {
  select(input: Parameters<ProviderSelectorPort['select']>[0]): ProviderSelectionDecision {
    const { operation, target } = input;
    if (target === 'BLOCKED') return denied('TARGET_BLOCKED');

    const operationRules = RULES.filter(rule => rule.operationType === operation.type);
    if (!operationRules.length) return denied('UNSUPPORTED_OPERATION');

    const targetRules = operationRules.filter(rule => rule.target === target);
    if (!targetRules.length) return denied('UNSUPPORTED_TARGET');

    const selected = [...targetRules].sort((left, right) => left.selectionId.localeCompare(right.selectionId))[0];
    if (!selected) return denied('NO_PROVIDER_AVAILABLE');
    return Object.freeze({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: selected.providerId, selectionId: selected.selectionId });
  }
}

export const productionProviderSelection: ProviderSelectorPort = Object.freeze(new ProductionProviderSelector());

function denied(reasonCode: Exclude<ProviderSelectionDecision['reasonCode'], 'PROVIDER_SELECTED'>): ProviderSelectionDecision {
  return Object.freeze({ allowed: false, reasonCode });
}

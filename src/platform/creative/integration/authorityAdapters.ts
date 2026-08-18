import type { CostEstimate } from '../cost';
import type { CreativeOperationDefinition } from '../operations';

export type MigrationClassification = 'CANONICAL' | 'ADAPTER' | 'DUPLICATE' | 'DEPRECATED' | 'DELETE_AFTER_MIGRATION';
export const AUTHORITY_MIGRATION_INVENTORY = Object.freeze({
  operationDefinitions: { owner: 'operations/CreativeOperationDefinition', classification: 'CANONICAL' },
  legacyOperationDescriptors: { owner: 'operations/OperationDescriptor', classification: 'ADAPTER' },
  costEstimates: { owner: 'cost/CreativeCostAuthority', classification: 'CANONICAL' },
  decisionCostPredictions: { owner: 'decision/intelligence', classification: 'DEPRECATED' },
  providerCostCalculations: { owner: 'provider/ProviderCostReport', classification: 'ADAPTER' },
  billingMutations: { owner: 'server/transactions', classification: 'CANONICAL' },
  executionAuthorization: { owner: 'authority/ExecutionAuthorizationPolicy', classification: 'CANONICAL' },
} as const);

export function adaptLegacyCost(credits: number, providerCost = 0, currency = 'USD'): CostEstimate {
  return Object.freeze({ estimatedCredits: credits, estimatedProviderCost: Object.freeze({ amount: providerCost, currency }), estimatedDeviceCost: 0, estimatedEnergyCost: 0, estimatedLatency: 0, estimatedRetries: 0, estimatedFallbackCost: Object.freeze({ amount: 0, currency }), worstCaseCredits: credits });
}
export function adaptLegacyOperation(d: Readonly<{ operationId: string; version: string; category: string; requiredCapabilities: readonly string[]; inputArtifacts: readonly string[]; outputArtifacts: readonly string[]; parameters: Readonly<Record<string, unknown>>; executionPolicy: string; verificationRequirements: readonly string[]; resources: Readonly<Record<string, number>> }>): CreativeOperationDefinition {
  return Object.freeze({ operationId: d.operationId, version: d.version, family: d.category, capabilities: d.requiredCapabilities, inputArtifacts: d.inputArtifacts, outputArtifacts: d.outputArtifacts, parametersSchema: d.parameters, executionPolicy: Object.freeze({ mode: d.executionPolicy }), verificationPolicy: Object.freeze({ requirements: d.verificationRequirements }), resourceProfile: d.resources, costModel: Object.freeze({ source: 'legacy-resource-profile' }), riskProfile: Object.freeze({ source: 'legacy-descriptor' }), billable: (d.resources.credits ?? 0) > 0 });
}

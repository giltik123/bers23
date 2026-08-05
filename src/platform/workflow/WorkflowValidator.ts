import type { WorkflowBudget, WorkflowDefinition, WorkflowRiskLevel } from './WorkflowDefinition';
import { WorkflowGraphBuilder } from './WorkflowGraph';

export interface WorkflowValidationPolicy { readonly budget?: WorkflowBudget; readonly maxRiskLevel?: WorkflowRiskLevel; readonly allowedCapabilities?: readonly string[]; }
export interface WorkflowValidationResult { readonly valid: boolean; readonly errors: readonly string[]; readonly warnings: readonly string[]; }

const riskRank: Record<WorkflowRiskLevel, number> = { low: 1, medium: 2, high: 3 };

export class WorkflowValidator {
  private readonly graphBuilder = new WorkflowGraphBuilder();

  validate(definition: WorkflowDefinition, policy: WorkflowValidationPolicy = {}): WorkflowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!definition.id) errors.push('Workflow id is required.');
    if (!definition.name?.trim()) errors.push('Workflow name is required.');
    if (!definition.description?.trim()) errors.push('Workflow description is required.');
    if (!definition.steps.length) errors.push('Workflow must include at least one step.');
    const ids = new Set<string>();
    for (const step of definition.steps) {
      if (ids.has(step.id)) errors.push(`Duplicate workflow step id: ${step.id}.`);
      ids.add(step.id);
      if (!step.name?.trim()) errors.push(`Workflow step ${step.id} is missing a name.`);
      if (!step.capability?.trim()) errors.push(`Workflow step ${step.id} is missing a capability.`);
      for (const dependency of step.dependsOn) if (!definition.steps.some((candidate) => candidate.id === dependency)) errors.push(`Workflow step ${step.id} depends on missing step ${dependency}.`);
      if (policy.allowedCapabilities && !policy.allowedCapabilities.includes(step.capability)) errors.push(`Capability ${step.capability} is not allowed.`);
    }
    try { this.graphBuilder.build(definition); } catch (error) { errors.push((error as Error).message); }
    if (policy.budget?.maxCredits != null && (definition.budget.maxCredits ?? 0) > policy.budget.maxCredits) errors.push('Workflow budget exceeds max credits policy.');
    if (policy.budget?.maxDurationMs != null && (definition.budget.maxDurationMs ?? 0) > policy.budget.maxDurationMs) errors.push('Workflow budget exceeds max duration policy.');
    if (policy.budget?.maxProviderCalls != null && definition.steps.length > policy.budget.maxProviderCalls) errors.push('Workflow budget exceeds max provider calls policy.');
    if (policy.maxRiskLevel && riskRank[definition.riskLevel] > riskRank[policy.maxRiskLevel]) errors.push('Workflow risk level exceeds policy.');
    if (!definition.capabilities.length) warnings.push('Workflow has no declared capabilities.');
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
  }

  assertValid(definition: WorkflowDefinition, policy: WorkflowValidationPolicy = {}): void {
    const result = this.validate(definition, policy);
    if (!result.valid) throw new Error(result.errors.join(' '));
  }
}

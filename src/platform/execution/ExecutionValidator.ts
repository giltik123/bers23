import type { ExecutionPlan } from './ExecutionPlan';
import { ExecutionDependencyMissing, ExecutionPlanRejected, ExecutionProviderUnavailable, type ExecutionPlanningError } from './ExecutionErrors';

/** Provider availability seam owned by runtime infrastructure. */
export type ExecutionProviderAvailability = (providerId: string) => boolean | Promise<boolean>;
export interface ExecutionValidationResult { readonly valid: boolean; readonly fallbackRequired: boolean; readonly errors: readonly string[]; readonly issues: readonly ExecutionPlanningError[]; readonly unavailableProviders: readonly string[]; }

/** Validates execution plans immediately before an executor accepts them. */
export class ExecutionValidator {
  constructor(private readonly providerAvailable: ExecutionProviderAvailability = () => true) {}

  async validate(plan: ExecutionPlan): Promise<ExecutionValidationResult> {
    const errors: string[] = [];
    const issues: ExecutionPlanningError[] = [];
    const ids = new Set(plan.steps.map((step) => step.id));
    for (const step of plan.steps) for (const dependency of step.dependencies) if (!ids.has(dependency)) { const issue = new ExecutionDependencyMissing(step.id, dependency); issues.push(issue); errors.push(issue.message); }
    const modules = new Set(plan.steps.map((step) => step.module));
    if (modules.has('editing-engine') && !modules.has('image-pipeline')) { const issue = new ExecutionDependencyMissing('editing-engine', 'image-pipeline'); issues.push(issue); errors.push(issue.message); }
    const tryOn = plan.steps.find((step) => step.capability === 'virtual-try-on');
    if (tryOn && (!plan.steps.some((step) => step.capability === 'person-analysis') || !plan.steps.some((step) => step.capability === 'garment-processing'))) { const issue = new ExecutionPlanRejected(['Virtual Try-On requires person-analysis and garment-processing.']); issues.push(issue); errors.push(issue.message); }
    if (tryOn && tryOn.provider !== 'fashn') { const issue = new ExecutionProviderUnavailable('fashn'); issues.push(issue); errors.push(issue.message); }
    const providers = [...new Set(plan.steps.flatMap((step) => step.provider ? [step.provider] : []))];
    const checks = await Promise.all(providers.map(async (provider) => ({ provider, available: await this.providerAvailable(provider) })));
    const unavailableProviders = checks.filter((item) => !item.available).map((item) => item.provider);
    for (const provider of unavailableProviders) { const issue = new ExecutionProviderUnavailable(provider); issues.push(issue); errors.push(issue.message); }
    return Object.freeze({ valid: errors.length === 0, fallbackRequired: unavailableProviders.length > 0, errors: Object.freeze(errors), issues: Object.freeze(issues), unavailableProviders: Object.freeze(unavailableProviders) });
  }
}

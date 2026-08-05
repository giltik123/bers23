/** Base typed error for execution planning failures. */
export class ExecutionPlanningError extends Error {
  constructor(readonly code: string, message: string, readonly metadata: Readonly<Record<string, unknown>> = {}) {
    super(message); this.name = new.target.name;
  }
}
export class ExecutionDependencyMissing extends ExecutionPlanningError {
  constructor(readonly stepId: string, readonly dependencyId: string) {
    super('EXECUTION_DEPENDENCY_MISSING', `Step "${stepId}" requires missing dependency "${dependencyId}".`, { stepId, dependencyId });
  }
}
export class ExecutionProviderUnavailable extends ExecutionPlanningError {
  constructor(readonly providerId: string) { super('EXECUTION_PROVIDER_UNAVAILABLE', `Required provider "${providerId}" is unavailable.`, { providerId }); }
}
export class ExecutionGraphCycle extends ExecutionPlanningError {
  constructor(readonly path: readonly string[]) { super('EXECUTION_GRAPH_CYCLE', `Execution graph cycle detected: ${path.join(' -> ')}.`, { path }); }
}
export class ExecutionPlanRejected extends ExecutionPlanningError {
  constructor(readonly reasons: readonly string[]) { super('EXECUTION_PLAN_REJECTED', `Execution plan rejected: ${reasons.join(' ')}`, { reasons }); }
}

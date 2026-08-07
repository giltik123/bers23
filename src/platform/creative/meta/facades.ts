import { deepImmutable } from './immutable';
import { HeuristicGovernanceModel, HeuristicReflectionModel } from './models';
import type { CoverageResult, GovernanceModel, MetaInput, MetaResult, QualityMetrics, ReflectionModel, ResourceShare, Scope } from './types';

export class CognitiveGovernance {
  constructor(private readonly model: GovernanceModel = new HeuristicGovernanceModel()) {}
  select(input: MetaInput, coverage: CoverageResult) { return this.model.select(input, coverage); }
}
export class ExecutiveReflection {
  constructor(private readonly model: ReflectionModel = new HeuristicReflectionModel()) {}
  reflect(input: MetaInput, metrics: QualityMetrics, allocation: readonly ResourceShare[]) { return this.model.reflect(input, metrics, allocation); }
}
export class MetaReplay {
  replay(result: MetaResult, scope: Scope): MetaResult { if (result.tenantId !== scope.tenantId || result.projectId !== scope.projectId || result.userId !== scope.userId) throw new Error('Meta scope violation'); return deepImmutable(structuredClone(result)); }
}
export class MetaDebuggerV7 {
  snapshot(result: MetaResult, scope: Scope): string { if (result.tenantId !== scope.tenantId || result.projectId !== scope.projectId || result.userId !== scope.userId) throw new Error('Meta scope violation'); return result.debugSnapshot; }
}

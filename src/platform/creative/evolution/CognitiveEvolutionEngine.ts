import { immutable, rounded } from './immutable';
import type { ArchitectureVersion, EvolutionDependencies, EvolutionDomain, EvolutionScope, PerformanceVector, VersionComparison } from './types';

const metricKeys: readonly (keyof PerformanceVector)[] = ['quality', 'reasoning', 'planning', 'creativity', 'cost', 'brand', 'composition', 'stability'];
const scoped = (left: EvolutionScope, right: EvolutionScope) => left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId;

export class CognitiveEvolutionEngine {
  private readonly versions = new Map<string, ArchitectureVersion & EvolutionScope>();
  constructor(private readonly dependencies: EvolutionDependencies) {}

  register(scope: EvolutionScope, domain: EvolutionDomain, metrics: PerformanceVector, change: string, parentId?: string): ArchitectureVersion {
    const parent = parentId ? this.require(parentId, scope) : undefined;
    if (parent && parent.domain !== domain) throw new Error('Evolution parent must use the same domain');
    const version = immutable({ ...scope, id: this.dependencies.nextId(), domain, version: (parent?.version ?? 0) + 1, parentId, createdAt: this.dependencies.now(), metrics: structuredClone(metrics), status: 'CANDIDATE' as const, change });
    this.versions.set(version.id, version); return this.public(version);
  }
  compare(baselineId: string, candidateId: string, scope: EvolutionScope, tolerance = -.01): VersionComparison { const baseline = this.require(baselineId, scope); const candidate = this.require(candidateId, scope); if (baseline.domain !== candidate.domain) throw new Error('Cannot compare different evolution domains'); const deltas = Object.fromEntries(metricKeys.map((key) => [key, rounded(candidate.metrics[key] - baseline.metrics[key])])) as unknown as PerformanceVector; const aggregateDelta = rounded(metricKeys.reduce((sum, key) => sum + deltas[key], 0) / metricKeys.length); const regressed = metricKeys.some((key) => deltas[key] < tolerance); return immutable({ baselineId, candidateId, deltas, aggregateDelta, regressed, verdict: regressed ? 'REJECT' : aggregateDelta > .005 ? 'PROMOTE' : 'HOLD' }); }
  evaluate(baselineId: string, candidateId: string, scope: EvolutionScope): ArchitectureVersion { const comparison = this.compare(baselineId, candidateId, scope); const candidate = this.require(candidateId, scope); const next = immutable({ ...candidate, status: comparison.verdict === 'REJECT' ? 'REJECTED' as const : comparison.verdict === 'PROMOTE' ? 'ACTIVE' as const : 'CANDIDATE' as const }); this.versions.set(candidateId, next); return this.public(next); }
  history(domain: EvolutionDomain, scope: EvolutionScope): readonly ArchitectureVersion[] { return immutable([...this.versions.values()].filter((item) => item.domain === domain && scoped(item, scope)).sort((a, b) => a.version - b.version).map(this.public)); }
  private require(id: string, scope: EvolutionScope) { const value = this.versions.get(id); if (!value) throw new Error(`Unknown evolution version ${id}`); if (!scoped(value, scope)) throw new Error('Evolution scope violation'); return value; }
  private public = (value: ArchitectureVersion & EvolutionScope): ArchitectureVersion => { const { tenantId: _t, projectId: _p, userId: _u, ...version } = value; return immutable(version); };
}

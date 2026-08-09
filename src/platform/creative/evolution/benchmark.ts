import { immutable, rounded } from './immutable';
import type { BenchmarkResult, BenchmarkScenario, EvolutionDependencies, PerformanceVector, RegressionFinding } from './types';
const keys: readonly (keyof PerformanceVector)[] = ['quality', 'reasoning', 'planning', 'creativity', 'cost', 'brand', 'composition', 'stability'];
export class IntelligenceBenchmarkPlatform {
  constructor(private readonly dependencies: EvolutionDependencies) {}
  run(versionId: string, scenarios: readonly BenchmarkScenario[], evaluator: (scenario: BenchmarkScenario) => PerformanceVector): BenchmarkResult { if (!scenarios.length) throw new Error('Benchmark requires scenarios'); const vectors = scenarios.map(evaluator); const scores = Object.fromEntries(keys.map((key) => [key, rounded(vectors.reduce((sum, value) => sum + value[key], 0) / vectors.length)])) as unknown as PerformanceVector; return immutable({ id: this.dependencies.nextId(), versionId, scenarioCount: scenarios.length, scores, creativeIQ: Math.round(scores.creativity * 100), reasoningIQ: Math.round(scores.reasoning * 100), planningIQ: Math.round(scores.planning * 100), costIQ: Math.round(scores.cost * 100), brandIQ: Math.round(scores.brand * 100), compositionIQ: Math.round(scores.composition * 100), createdAt: this.dependencies.now() }); }
}
export class CognitiveRegressionDetector {
  detect(baseline: BenchmarkResult, candidate: BenchmarkResult, warning = -.01, blocking = -.03): readonly RegressionFinding[] { return immutable(keys.map((metric) => { const delta = rounded(candidate.scores[metric] - baseline.scores[metric]); return { metric, delta, severity: delta <= blocking ? 'BLOCKING' as const : delta <= warning ? 'WARNING' as const : 'NONE' as const }; })); }
  acceptable(findings: readonly RegressionFinding[]): boolean { return !findings.some((item) => item.severity === 'BLOCKING'); }
}

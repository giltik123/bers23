import { CostAnalyzer } from './CostAnalyzer';
import { ExecutionMetricsStore } from './ExecutionMetricsStore';
import type { ExecutionMetric } from './ExecutionMetricsTypes';
import { FailureAnalyzer } from './FailureAnalyzer';
import { FailurePatternDetector } from './FailurePatternDetector';
import { PerformanceAnalyzer } from './PerformanceAnalyzer';

/** Facade for recording and analyzing execution intelligence. */
export class ExecutionAnalytics {
  readonly performance: PerformanceAnalyzer; readonly cost: CostAnalyzer; readonly failures: FailureAnalyzer; readonly patterns: FailurePatternDetector;
  constructor(readonly metrics = new ExecutionMetricsStore()) { this.performance = new PerformanceAnalyzer(metrics); this.cost = new CostAnalyzer(metrics); this.failures = new FailureAnalyzer(metrics); this.patterns = new FailurePatternDetector(metrics); }
  record(metric: ExecutionMetric): ExecutionMetric { return this.metrics.record(metric); }
}

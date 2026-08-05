/** Execution outcome accepted by the routing feedback loop. */
export type RoutingOutcome = 'success' | 'failure' | 'cancel' | 'user-rejected';
export interface RoutingFeedbackEntry { readonly routeId: string; readonly outcome: RoutingOutcome; readonly durationMs?: number; readonly recordedAt: string; }
export interface RoutingFeedbackStats { readonly attempts: number; readonly successRate: number; readonly rejectionRate: number; readonly averageDurationMs: number; }

/** In-memory feedback collector designed for a future persistent analytics adapter. */
export class RoutingFeedback {
  private readonly entries: RoutingFeedbackEntry[] = [];

  record(routeId: string, outcome: RoutingOutcome, durationMs?: number): RoutingFeedbackEntry {
    const entry = Object.freeze({ routeId, outcome, durationMs, recordedAt: new Date().toISOString() });
    this.entries.push(entry);
    return entry;
  }

  getStats(routeId: string): RoutingFeedbackStats {
    const entries = this.entries.filter((entry) => entry.routeId === routeId);
    const completed = entries.filter((entry) => entry.durationMs !== undefined);
    return Object.freeze({
      attempts: entries.length,
      successRate: entries.length === 0 ? 0 : entries.filter((entry) => entry.outcome === 'success').length / entries.length,
      rejectionRate: entries.length === 0 ? 0 : entries.filter((entry) => entry.outcome === 'user-rejected').length / entries.length,
      averageDurationMs: completed.length === 0 ? 0 : completed.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0) / completed.length,
    });
  }
}

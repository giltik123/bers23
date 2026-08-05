import type { GatewayResponse } from './GatewayResponse';

export interface GatewayMetricsSnapshot { readonly requestsCount: number; readonly successRate: number; readonly failureRate: number; readonly averageDuration: number; readonly averageCost: number; readonly cancelledExecutions: number; readonly rejectedRequests: number; }

export class GatewayMetrics {
  private responses: GatewayResponse[] = [];
  record(response: GatewayResponse): void { this.responses.push(response); }
  snapshot(): GatewayMetricsSnapshot {
    const total = this.responses.length;
    const completed = this.responses.filter((response) => response.status === 'COMPLETED').length;
    const failed = this.responses.filter((response) => response.status === 'FAILED').length;
    const cancelled = this.responses.filter((response) => response.status === 'CANCELLED').length;
    const rejected = this.responses.filter((response) => response.status === 'REJECTED').length;
    return { requestsCount: total, successRate: total ? completed / total : 0, failureRate: total ? failed / total : 0, averageDuration: total ? Math.round(this.responses.reduce((sum, response) => sum + response.duration, 0) / total) : 0, averageCost: total ? this.responses.reduce((sum, response) => sum + response.cost.credits, 0) / total : 0, cancelledExecutions: cancelled, rejectedRequests: rejected };
  }
  clear(): void { this.responses = []; }
}

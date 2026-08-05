import type { OperationExecution, OperationStatus, OperationType } from './OperationType';

export interface CreativeOperation {
  readonly id: string;
  readonly type: OperationType;
  readonly source: OperationExecution;
  readonly targetLayer: string | null;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly reversible: boolean;
  readonly cost: number;
  readonly status: OperationStatus;
  readonly workflow?: string;
  readonly createdAt: number;
}

export interface EditRequest {
  readonly tenantId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly canvasId: string;
  readonly prompt?: string;
  readonly type?: OperationType;
  readonly targetLayer?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface EditDecision {
  readonly mode: OperationExecution;
  readonly type: OperationType;
  readonly credits: number;
  readonly estimatedCost: number;
  readonly workflow?: string;
  readonly reason: string;
}

export interface EditResult {
  readonly success: boolean;
  readonly operation: CreativeOperation;
  readonly decision: EditDecision;
  readonly previewAvailable: boolean;
}

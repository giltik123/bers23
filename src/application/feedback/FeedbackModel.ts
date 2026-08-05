export type FeedbackType =
  | 'SUCCESS'
  | 'FAILURE'
  | 'USER_REJECTED'
  | 'QUALITY_ISSUE'
  | 'PREFERENCE_UPDATE'
  | 'STYLE_CORRECTION'
  | 'WORKFLOW_IMPROVEMENT';

export type FeedbackSignalType = 'preference' | 'quality' | 'rejection' | 'correction' | 'workflow';
export type MemoryProposalCategory = 'STYLE_MEMORY' | 'WORKFLOW_MEMORY' | 'QUALITY_MEMORY' | 'PREFERENCE_MEMORY';

export interface FeedbackSecurityScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
}

export interface FeedbackContext extends FeedbackSecurityScope {
  readonly interactionId: string;
  readonly experienceId: string;
  readonly workflowId: string;
  readonly executionId: string;
  readonly userAction: string;
  readonly executionResult?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FeedbackRequest {
  readonly id?: string;
  readonly context: FeedbackContext;
  readonly type: FeedbackType;
  readonly rating?: number;
  readonly comment?: string;
  readonly corrections?: Readonly<Record<string, unknown>>;
}

export interface FeedbackSignal {
  readonly id: string;
  readonly type: FeedbackSignalType;
  readonly key: string;
  readonly value: unknown;
  readonly confidenceDelta: number;
  readonly reason: string;
}

export interface FeedbackRecord extends FeedbackSecurityScope {
  readonly id: string;
  readonly interactionId: string;
  readonly experienceId: string;
  readonly workflowId: string;
  readonly executionId: string;
  readonly type: FeedbackType;
  readonly rating: number | null;
  readonly comment: string;
  readonly signals: readonly FeedbackSignal[];
  readonly createdAt: string;
}

export interface FeedbackAnalysis {
  readonly workflowId: string;
  readonly total: number;
  readonly successes: number;
  readonly failures: number;
  readonly rejectionReasons: readonly string[];
  readonly repeatedCorrections: readonly FeedbackSignal[];
  readonly dissatisfactionPatterns: readonly string[];
  readonly qualityIssues: readonly string[];
  readonly successRate: number;
}

export interface MemoryUpdateProposal {
  readonly id: string;
  readonly category: MemoryProposalCategory;
  readonly key: string;
  readonly value: unknown;
  readonly reason: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface FeedbackDebugSnapshot {
  readonly userAction: string;
  readonly feedback: FeedbackRecord;
  readonly signals: readonly FeedbackSignal[];
  readonly recommendation: string;
  readonly memoryProposals: readonly MemoryUpdateProposal[];
}

export const createFeedbackId = () => `feedback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createFeedbackSignalId = () => `feedback_signal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createMemoryProposalId = () => `memory_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function assertFeedbackAccess(record: FeedbackSecurityScope, scope: FeedbackSecurityScope): void {
  if (record.userId !== scope.userId || record.tenantId !== scope.tenantId || record.projectId !== scope.projectId) {
    throw new Error('Feedback access denied: userId, tenantId and projectId are required to match.');
  }
}

export function immutable<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    immutable((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}

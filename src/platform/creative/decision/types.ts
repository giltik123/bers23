export type DecisionMode = 'LOCAL' | 'AI' | 'HYBRID' | 'ASK_USER';
export type DecisionReasonCategory = 'QUALITY' | 'COST' | 'PREFERENCE' | 'CAPABILITY' | 'CONFIRMATION';
export type DecisionEventType = 'decision.created' | 'decision.local_selected' | 'decision.ai_selected' | 'decision.hybrid_selected' | 'decision.optimized' | 'decision.confirmation_required';

export interface DecisionReason { id: string; category: DecisionReasonCategory; message: string }
export interface DecisionRecord { id: string; userId: string; tenantId: string; projectId: string; mode: DecisionMode; createdAt: number }
export interface DecisionContext { userId: string; tenantId: string; projectId: string; prompt: string; availableOperations: readonly string[]; preferences?: { styles: readonly string[]; workflows: readonly string[]; confidence: number }; budget?: { availableCredits: number }; quality?: { expectedQuality: number; minimumQuality: number }; previousDecisions?: readonly DecisionRecord[]; metadata?: Readonly<Record<string, unknown>> }
export interface CreativeDecision { id: string; mode: DecisionMode; operations: readonly string[]; estimatedCredits: number; confidence: number; reasons: readonly DecisionReason[]; requiresConfirmation: boolean; createdAt: number; savedCredits: number }
export interface DecisionExplanation { decisionId: string; mode: DecisionMode; explanation: string; reasons: readonly DecisionReason[]; estimatedCredits: number; savedCredits: number }
export interface DecisionHistoryEvent { type: DecisionEventType; decisionId: string; userId: string; tenantId: string; projectId: string; createdAt: number; message: string }
export interface DecisionInspection { context: DecisionContext; decision: CreativeDecision; explanation: DecisionExplanation; events: readonly DecisionHistoryEvent[] }
export interface DecisionDebugTrace { decisionId: string; trace: string }

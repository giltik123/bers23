export type AIExperienceState = 'CREATED' | 'UNDERSTANDING' | 'WAITING_USER' | 'EXECUTING' | 'REVIEWING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ExperienceDecisionType = 'CONFIRMATION' | 'CHOICE' | 'CLARIFICATION';
export type ExperienceHistoryType = 'request' | 'decision' | 'workflow' | 'progress' | 'result' | 'feedback';

export interface ExperienceDecisionOption { readonly id: string; readonly label: string; readonly value: unknown; }
export interface ExperienceDecision { readonly id: string; readonly type: ExperienceDecisionType; readonly message: string; readonly options: readonly ExperienceDecisionOption[]; readonly answer?: unknown; readonly submittedAt?: string; }
export interface ExperienceProgressStep { readonly id: string; readonly label: string; readonly status: 'PENDING' | 'ACTIVE' | 'DONE' | 'FAILED'; readonly technicalStep?: string; readonly updatedAt: string; }
export interface ExperienceExplanation { readonly workflow?: string; readonly provider?: string; }
export interface ExperienceFeedback { readonly rating: 'GOOD' | 'IMPROVE' | number; readonly comment?: string; readonly workflowId?: string; readonly executionId?: string; readonly createdAt: string; }
export interface ExperienceHistorySnapshot { readonly id: string; readonly type: ExperienceHistoryType; readonly timestamp: string; readonly data: unknown; }

export interface AIExperienceSessionSnapshot {
  readonly id: string;
  readonly commandId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly state: AIExperienceState;
  readonly intent: unknown;
  readonly workflow: unknown;
  readonly progress: readonly ExperienceProgressStep[];
  readonly decisions: readonly ExperienceDecision[];
  readonly suggestions: readonly unknown[];
  readonly result: unknown;
  readonly explanations: ExperienceExplanation;
  readonly feedback: readonly ExperienceFeedback[];
  readonly history: readonly ExperienceHistorySnapshot[];
  readonly createdAt: string;
}

export interface AIExperienceSessionInput {
  readonly id?: string;
  readonly commandId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly intent?: unknown;
  readonly workflow?: unknown;
  readonly suggestions?: readonly unknown[];
  readonly request?: unknown;
}

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) freezeDeep(item);
  }
  return value;
};
const snapshotId = () => `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class AIExperienceSession {
  private snapshot: AIExperienceSessionSnapshot;

  constructor(input: AIExperienceSessionInput, now = new Date().toISOString()) {
    this.snapshot = this.freeze({
      id: input.id ?? `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      commandId: input.commandId,
      userId: input.userId,
      projectId: input.projectId,
      state: 'CREATED',
      intent: clone(input.intent ?? null),
      workflow: clone(input.workflow ?? null),
      progress: [],
      decisions: [],
      suggestions: clone(input.suggestions ?? []),
      result: null,
      explanations: {},
      feedback: [],
      history: [],
      createdAt: now,
    });
    if (input.request !== undefined) this.record('request', input.request, now);
  }

  inspect(): AIExperienceSessionSnapshot { return this.freeze(clone(this.snapshot)); }
  transition(state: AIExperienceState, at = new Date().toISOString()): void { this.snapshot = this.freeze({ ...this.snapshot, state }); this.record(state === 'COMPLETED' || state === 'FAILED' ? 'result' : 'workflow', { state }, at); }
  setWorkflow(workflow: unknown, explanation?: string, at = new Date().toISOString()): void { this.snapshot = this.freeze({ ...this.snapshot, workflow: clone(workflow), explanations: { ...this.snapshot.explanations, workflow: explanation ?? this.snapshot.explanations.workflow } }); this.record('workflow', { workflow, explanation }, at); }
  setProviderExplanation(explanation: string, at = new Date().toISOString()): void { this.snapshot = this.freeze({ ...this.snapshot, explanations: { ...this.snapshot.explanations, provider: explanation } }); this.record('workflow', { providerExplanation: explanation }, at); }
  setProgress(progress: readonly ExperienceProgressStep[], at = new Date().toISOString()): void { this.snapshot = this.freeze({ ...this.snapshot, progress: clone(progress) }); this.record('progress', progress, at); }
  addDecision(decision: ExperienceDecision, at = new Date().toISOString()): void { this.snapshot = this.freeze({ ...this.snapshot, state: 'WAITING_USER', decisions: [...this.snapshot.decisions, clone(decision)] }); this.record('decision', decision, at); }
  submitDecision(decisionId: string, answer: unknown, at = new Date().toISOString()): ExperienceDecision {
    let submitted: ExperienceDecision | undefined;
    const decisions = this.snapshot.decisions.map((decision) => decision.id === decisionId ? (submitted = { ...decision, answer: clone(answer), submittedAt: at }) : decision);
    if (!submitted) throw new Error(`Experience decision not found: ${decisionId}`);
    this.snapshot = this.freeze({ ...this.snapshot, state: 'EXECUTING', decisions });
    this.record('decision', submitted, at);
    return this.freeze(clone(submitted));
  }
  setResult(result: unknown, state: AIExperienceState, at = new Date().toISOString()): void { this.snapshot = this.freeze({ ...this.snapshot, state, result: clone(result) }); this.record('result', result, at); }
  addFeedback(feedback: Omit<ExperienceFeedback, 'createdAt'>, at = new Date().toISOString()): ExperienceFeedback { const stored = { ...feedback, createdAt: at }; this.snapshot = this.freeze({ ...this.snapshot, feedback: [...this.snapshot.feedback, stored] }); this.record('feedback', stored, at); return this.freeze(clone(stored)); }

  private record(type: ExperienceHistoryType, data: unknown, timestamp: string): void { this.snapshot = this.freeze({ ...this.snapshot, history: [...this.snapshot.history, this.freeze({ id: snapshotId(), type, timestamp, data: clone(data) })] }); }
  private freeze<T>(value: T): T { return freezeDeep(value); }
}

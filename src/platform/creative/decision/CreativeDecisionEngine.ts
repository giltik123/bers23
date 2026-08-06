import { CostAwareDecision } from './CostAwareDecision';
import { DecisionContext as DecisionContextFactory } from './DecisionContext';
import { DecisionDebugger } from './DecisionDebugger';
import { DecisionExplanation } from './DecisionExplanation';
import { DecisionHistory } from './DecisionHistory';
import { DecisionRules } from './DecisionRules';
import { PreferenceAwareDecision } from './PreferenceAwareDecision';
import { QualityAwareDecision } from './QualityAwareDecision';
import type { CreativeDecision, DecisionContext, DecisionExplanation as DecisionExplanationShape, DecisionInspection } from './types';

export class CreativeDecisionEngine {
  private readonly contexts = new Map<string, DecisionContext>();
  private readonly decisions = new Map<string, CreativeDecision>();
  private readonly historyStore = new DecisionHistory();
  private readonly contextFactory = new DecisionContextFactory();
  private readonly rules = new DecisionRules();
  private readonly preferences = new PreferenceAwareDecision();
  private readonly quality = new QualityAwareDecision();
  private readonly cost = new CostAwareDecision();
  private readonly explanations = new DecisionExplanation();
  private readonly debugger = new DecisionDebugger();

  decide(contextInput: DecisionContext): CreativeDecision {
    const context = this.contextFactory.create(contextInput);
    const reasons = this.rules.reasons('ASK_USER', []);
    let operations = this.rules.detectOperations(context.prompt, context.availableOperations);
    operations = this.preferences.apply(context, operations, reasons);
    operations = this.quality.apply(context, operations, reasons);
    const optimized = this.cost.optimize(operations, reasons);
    const mode = this.rules.classify(optimized.operations);
    const createdAt = Date.now();
    const decision = Object.freeze({ id: `decision:${context.tenantId}:${context.projectId}:${context.userId}:${context.prompt.length}:${createdAt}`, mode, operations: Object.freeze(optimized.operations), estimatedCredits: optimized.estimatedCredits, confidence: this.confidence(context, mode), reasons: Object.freeze(reasons), requiresConfirmation: mode === 'AI' || mode === 'HYBRID' || mode === 'ASK_USER', createdAt, savedCredits: optimized.savedCredits });
    this.contexts.set(decision.id, context);
    this.decisions.set(decision.id, decision);
    this.historyStore.record(decision, context);
    return decision;
  }

  explain(decisionId: string): DecisionExplanationShape { return this.explanations.explain(this.requireDecision(decisionId)); }
  inspect(decisionId: string): DecisionInspection { const decision = this.requireDecision(decisionId); return Object.freeze({ context: this.requireContext(decisionId), decision, explanation: this.explain(decisionId), events: this.historyStore.forDecision(decisionId) }); }
  history(): readonly ReturnType<DecisionHistory['all']>[number][] { return this.historyStore.all(); }
  debug(decisionId: string): string { return this.debugger.debug(this.requireContext(decisionId), this.requireDecision(decisionId)); }

  private confidence(context: DecisionContext, mode: string): number { return mode === 'ASK_USER' ? 0.45 : Number(Math.min(0.95, 0.7 + (context.preferences?.confidence ?? 0) * 0.15).toFixed(2)); }
  private requireDecision(decisionId: string): CreativeDecision { const decision = this.decisions.get(decisionId); if (!decision) throw new Error(`Unknown decision ${decisionId}`); return decision; }
  private requireContext(decisionId: string): DecisionContext { const context = this.contexts.get(decisionId); if (!context) throw new Error(`Unknown context ${decisionId}`); return context; }
}

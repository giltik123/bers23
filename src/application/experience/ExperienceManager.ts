import { AIExperienceSession, type AIExperienceSessionInput, type AIExperienceSessionSnapshot, type ExperienceDecision, type ExperienceFeedback, type ExperienceProgressStep } from './AIExperienceSession';

const HUMAN_PROGRESS: Record<string, readonly string[]> = {
  'virtual-try-on': ['Анализ изображения', 'Подготовка одежды', 'Примерка одежды', 'Проверка качества', 'Финальная обработка'],
  'hair-color-edit': ['Анализ портрета', 'Определение области волос', 'Изменение цвета', 'Проверка естественности', 'Финальная обработка'],
  'background-replacement': ['Анализ изображения', 'Выделение объекта', 'Подготовка фона', 'Соединение изображения', 'Финальная проверка'],
};

const TECHNICAL_TRANSLATIONS: Record<string, { readonly label: string; readonly step: number }> = {
  'SAM3 mask generation': { label: 'Анализирую объект на изображении', step: 1 },
  'FASHN try-on': { label: 'Примеряю одежду', step: 3 },
  'Reve final render': { label: 'Финальная обработка изображения', step: 5 },
};

export class ExperienceManager {
  private readonly sessions = new Map<string, AIExperienceSession>();

  create(input: AIExperienceSessionInput): AIExperienceSessionSnapshot {
    const session = new AIExperienceSession(input);
    this.sessions.set(session.inspect().id, session);
    return session.inspect();
  }

  start(sessionId: string, details: { workflow?: unknown; workflowId?: string; provider?: string } = {}): AIExperienceSessionSnapshot {
    const session = this.get(sessionId);
    session.transition('UNDERSTANDING');
    if (details.workflow || details.workflowId) session.setWorkflow(details.workflow ?? { id: details.workflowId }, this.explainWorkflow(details.workflowId ?? this.workflowId(details.workflow), session.inspect().intent));
    if (details.provider) session.setProviderExplanation(this.explainProvider(details.provider));
    session.transition('EXECUTING');
    return session.inspect();
  }

  updateProgress(sessionId: string, update: { workflowId?: string; currentStep?: string | number; completedSteps?: readonly (string | number)[]; failedStep?: string | number } = {}): AIExperienceSessionSnapshot {
    const workflowId = update.workflowId ?? this.workflowId(this.get(sessionId).inspect().workflow);
    const labels = HUMAN_PROGRESS[workflowId] ?? ['Понимание запроса', 'Подготовка результата', 'Выполнение операции', 'Проверка качества', 'Завершение'];
    const completed = new Set((update.completedSteps ?? []).map(String));
    const technicalProgress = typeof update.currentStep === 'string' ? TECHNICAL_TRANSLATIONS[update.currentStep] : undefined;
    const current = technicalProgress ? String(technicalProgress.step) : update.currentStep === undefined ? undefined : String(update.currentStep);
    const failed = update.failedStep === undefined ? undefined : String(update.failedStep);
    const progress: ExperienceProgressStep[] = labels.map((label, index) => {
      const key = String(index + 1);
      const technicalStep = technicalProgress?.step === index + 1 ? String(update.currentStep) : undefined;
      const visibleLabel = technicalStep ? technicalProgress?.label ?? label : label;
      return { id: key, label: visibleLabel, status: failed === key || failed === label ? 'FAILED' : completed.has(key) || completed.has(label) ? 'DONE' : current === key || current === label ? 'ACTIVE' : 'PENDING', technicalStep, updatedAt: new Date().toISOString() };
    });
    this.get(sessionId).setProgress(progress);
    return this.get(sessionId).inspect();
  }

  requestDecision(sessionId: string, decision: ExperienceDecision): AIExperienceSessionSnapshot { this.get(sessionId).addDecision(decision); return this.get(sessionId).inspect(); }
  submitDecision(sessionId: string, decisionId: string, answer: unknown): AIExperienceSessionSnapshot { this.get(sessionId).submitDecision(decisionId, answer); return this.get(sessionId).inspect(); }
  complete(sessionId: string, result: unknown, feedback?: Omit<ExperienceFeedback, 'createdAt'>): AIExperienceSessionSnapshot { const s = this.get(sessionId); s.transition('REVIEWING'); s.setResult(result, 'COMPLETED'); if (feedback) s.addFeedback(feedback); return s.inspect(); }
  fail(sessionId: string, error: unknown): AIExperienceSessionSnapshot { this.get(sessionId).setResult({ error }, 'FAILED'); return this.get(sessionId).inspect(); }
  cancel(sessionId: string, reason?: string): AIExperienceSessionSnapshot { this.get(sessionId).setResult({ reason }, 'CANCELLED'); return this.get(sessionId).inspect(); }
  feedback(sessionId: string, feedback: Omit<ExperienceFeedback, 'createdAt'>): ExperienceFeedback { return this.get(sessionId).addFeedback(feedback); }
  inspect(sessionId: string): AIExperienceSessionSnapshot { return this.get(sessionId).inspect(); }
  debug(sessionId: string) { const s = this.inspect(sessionId); return { command: { id: s.commandId, userId: s.userId, projectId: s.projectId }, intent: s.intent, workflow: { value: s.workflow, explanation: s.explanations.workflow }, progress: s.progress, decision: s.decisions, result: s.result, feedback: s.feedback, history: s.history }; }

  explainWorkflow(workflowId: string, intent: unknown): string { return workflowId === 'virtual-try-on' ? 'Выбран Virtual Try-On, потому что обнаружена одежда и запрос связан с каталогом.' : `Выбран ${workflowId}, потому что он соответствует намерению ${String(intent)}.`; }
  explainProvider(provider: string): string { return provider.toUpperCase() === 'FASHN' ? 'Используется FASHN: лучшее качество примерки одежды.' : `Используется ${provider}: оптимальный провайдер для выбранного workflow.`; }
  private workflowId(workflow: unknown): string { return typeof workflow === 'string' ? workflow : (workflow as { id?: string } | null)?.id ?? 'generic'; }
  private get(sessionId: string): AIExperienceSession { const session = this.sessions.get(sessionId); if (!session) throw new Error(`Experience session not found: ${sessionId}`); return session; }
}

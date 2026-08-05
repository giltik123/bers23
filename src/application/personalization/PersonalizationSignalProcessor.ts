import {
  createPersonalizationSignalId,
  immutable,
  type PersonalizationContext,
  type PersonalizationPreferenceCategory,
  type PersonalizationSignal,
} from './PersonalizationModel';

export class PersonalizationSignalProcessor {
  process(context: PersonalizationContext): readonly PersonalizationSignal[] {
    return immutable([
      ...this.#fromFeedback(context),
      ...this.#fromMemoryProposals(context),
      ...this.#fromWorkflowHistory(context),
      ...this.#fromInteractionHistory(context),
    ]);
  }

  #fromFeedback(context: PersonalizationContext): PersonalizationSignal[] {
    return (context.feedbackSignals || []).map((signal) => {
      const key = String(signal.key || 'feedback_preference');
      const isBackground = key.includes('background') || String(signal.reason || '').toLowerCase().includes('background');
      return this.#signal(
        context,
        'feedback',
        isBackground ? 'STYLE' : this.#categoryFromKey(key),
        isBackground ? 'background_style_preference' : key,
        signal.value,
        Number(signal.confidenceDelta || 0.15),
        String(signal.reason || 'Feedback signal converted into personalization preference.'),
        [String(signal.id || key)],
      );
    });
  }

  #fromMemoryProposals(context: PersonalizationContext): PersonalizationSignal[] {
    return (context.memoryProposals || []).map((proposal) => this.#signal(
      context,
      'memory_proposal',
      this.#categoryFromMemory(String(proposal.category || 'PREFERENCE_MEMORY')),
      String(proposal.key || 'memory_preference'),
      proposal.value,
      Number(proposal.confidence || 0.1),
      String(proposal.reason || 'Memory proposal converted into personalization signal.'),
      (proposal.evidence as readonly string[] | undefined) || [String(proposal.id || proposal.key || 'memory_proposal')],
    ));
  }

  #fromWorkflowHistory(context: PersonalizationContext): PersonalizationSignal[] {
    const counts = new Map<string, number>();

    for (const workflow of context.workflowHistory || []) {
      counts.set(workflow, (counts.get(workflow) || 0) + 1);
    }

    return [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([workflow, count]) => this.#signal(
        context,
        'workflow_history',
        'WORKFLOW',
        'preferred_workflow',
        workflow,
        Math.min(0.2, count * 0.04),
        `Workflow ${workflow} appears repeatedly in history.`,
        [workflow],
      ));
  }

  #fromInteractionHistory(context: PersonalizationContext): PersonalizationSignal[] {
    const automaticCount = (context.interactionHistory || []).filter((item) => item === 'auto_continue' || item === 'approve_fast').length;

    if (automaticCount < 2) {
      return [];
    }

    return [this.#signal(
      context,
      'interaction_history',
      'INTERACTION',
      'prefers_automatic_execution',
      true,
      0.1,
      'Interaction history indicates fast approvals or auto-continue behavior.',
      ['interaction_history'],
    )];
  }

  #categoryFromKey(key: string): PersonalizationPreferenceCategory {
    if (key.includes('style') || key.includes('lighting') || key.includes('background')) return 'STYLE';
    if (key.includes('workflow')) return 'WORKFLOW';
    if (key.includes('quality') || key.includes('resolution')) return 'QUALITY';
    if (key.includes('speed')) return 'SPEED';
    if (key.includes('cost')) return 'COST';
    return 'INTERACTION';
  }

  #categoryFromMemory(category: string): PersonalizationPreferenceCategory {
    if (category.includes('STYLE')) return 'STYLE';
    if (category.includes('WORKFLOW')) return 'WORKFLOW';
    if (category.includes('QUALITY')) return 'QUALITY';
    return 'INTERACTION';
  }

  #signal(
    context: PersonalizationContext,
    source: PersonalizationSignal['source'],
    category: PersonalizationPreferenceCategory,
    key: string,
    value: unknown,
    confidenceDelta: number,
    reason: string,
    evidence: readonly string[],
  ): PersonalizationSignal {
    return immutable({
      id: createPersonalizationSignalId(),
      userId: context.userId,
      tenantId: context.tenantId,
      source,
      category,
      key,
      value,
      confidenceDelta,
      reason,
      evidence: [...evidence],
    });
  }
}

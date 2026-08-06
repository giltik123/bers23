import type { CreativeDecisionMemorySignal, CreativeDecisionMemorySuggestion } from './types';

export class CreativeDecisionMemory {
  private readonly signals: CreativeDecisionMemorySignal[] = [];

  record(signal: CreativeDecisionMemorySignal): CreativeDecisionMemorySignal {
    this.signals.push(Object.freeze(signal));
    return signal;
  }

  suggest(): CreativeDecisionMemorySuggestion {
    const luxurySignals = this.signals.filter((signal) => signal.decision === 'style' && signal.value === 'luxury');
    const darkSignals = this.signals.filter((signal) => signal.decision === 'background' && signal.value === 'dark');
    const softSignals = this.signals.filter((signal) => signal.decision === 'lighting' && signal.value === 'soft');
    const confidence = Math.min(0.95, (luxurySignals.length + darkSignals.length + softSignals.length) / 5);
    return { message: confidence >= 0.8 ? 'Похоже, вам нравится премиальный стиль. Использовать его автоматически?' : 'Недостаточно creative decision history для автоматического применения стиля.', autoApply: confidence >= 0.8, confidence, signals: [...this.signals] };
  }
}

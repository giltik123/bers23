import type { CreativePreferenceSignal, EditOperation } from './types';

export class PreferenceSignalExtractor {
  extract(operations: EditOperation[]): CreativePreferenceSignal[] {
    const signals: CreativePreferenceSignal[] = [];
    if (operations.some((operation) => operation.type === 'lighting')) signals.push({ signal: 'prefers_soft_lighting', confidence: 0.7, reason: 'User selected lighting-focused edits.' });
    if (operations.every((operation) => operation.mode === 'LOCAL')) signals.push({ signal: 'prefers_minimal_ai', confidence: 0.72, reason: 'User stayed on local editing path.' });
    if (operations.some((operation) => operation.type === 'color')) signals.push({ signal: 'prefers_color_polish', confidence: 0.68, reason: 'User selected color correction.' });
    return signals;
  }
}

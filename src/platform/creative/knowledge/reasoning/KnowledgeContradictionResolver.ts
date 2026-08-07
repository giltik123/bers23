import { clamp, deepFreeze, normalize } from '../immutable';
import type { ContradictionCandidate, ContradictionResolution } from './types';

export class KnowledgeContradictionResolver {
  detect(candidates: readonly ContradictionCandidate[]): readonly (readonly [string, string])[] {
    const result: [string, string][] = [];
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const a = normalize(candidates[left].value);
        const b = normalize(candidates[right].value);
        if (a === `not ${b}` || b === `not ${a}` || a === `avoid ${b}` || b === `avoid ${a}`) {
          result.push([candidates[left].id, candidates[right].id]);
        }
      }
    }
    return deepFreeze(result);
  }

  resolve(candidates: readonly ContradictionCandidate[]): ContradictionResolution {
    if (candidates.length === 0) {
      return deepFreeze({ losers: [], reason: 'No candidates', confidence: 0 });
    }
    const ranked = candidates.slice().sort((a, b) => {
      const aScore = a.priority * 0.5 + a.confidence * 30 + a.support;
      const bScore = b.priority * 0.5 + b.confidence * 30 + b.support;
      return bScore - aScore || a.id.localeCompare(b.id);
    });
    const winner = ranked[0];
    const runnerUp = ranked[1];
    const winnerScore = winner.priority * 0.5 + winner.confidence * 30 + winner.support;
    const runnerScore = runnerUp
      ? runnerUp.priority * 0.5 + runnerUp.confidence * 30 + runnerUp.support
      : 0;
    return deepFreeze({
      winner,
      losers: ranked.slice(1),
      reason: 'Highest deterministic priority, confidence and support score',
      confidence: clamp(winner.confidence * (runnerUp ? 0.75 + Math.min(0.25, (winnerScore - runnerScore) / 100) : 1)),
    });
  }
}

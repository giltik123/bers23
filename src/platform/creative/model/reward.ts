import { clamp } from './immutable';
import type { ActualDecisionOutcome, DecisionContextV1, RewardPolicy } from './types';
export const DEFAULT_REWARD_POLICY: RewardPolicy = Object.freeze({ goalCompletion: 2, quality: 2, satisfaction: 1.5, costEfficiency: 1, speed: 1, privacy: 1, risk: 2, unnecessaryAI: 1 });
export const calculateReward = (outcome: ActualDecisionOutcome, context: DecisionContextV1, weights: Partial<RewardPolicy> = {}) => {
  const policy = { ...DEFAULT_REWARD_POLICY, ...weights };
  const costEfficiency = 1 - clamp(outcome.cost / Math.max(context.budget, .01));
  const speed = 1 - clamp(outcome.latency / Math.max(context.latencyTarget, 1));
  const privacy = ['LOCAL_ONLY', 'OFFLINE_ONLY'].includes(context.privacyMode) ? Number(outcome.cost === 0) : 1;
  return policy.goalCompletion * clamp(outcome.goalCompletion ?? Number(outcome.success)) + policy.quality * clamp(outcome.quality) + policy.satisfaction * clamp(outcome.satisfaction ?? Number(outcome.accepted)) + policy.costEfficiency * costEfficiency + policy.speed * speed + policy.privacy * privacy - policy.risk * clamp(outcome.risk ?? 0) - policy.unnecessaryAI * Number(Boolean(outcome.unnecessaryAI));
};
export const decisionRegret = (chosenReward: number, bestAvailableReward: number) => Math.max(0, bestAvailableReward - chosenReward);

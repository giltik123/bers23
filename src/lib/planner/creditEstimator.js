// CreditEstimator — predicts credit cost before execution. Pure math, no APIs.

const STEP_COSTS = {
  segmentation: 1,
  editing: 2,
  tryon: 4,
};

// Returns { credits, breakdown[] }
export function estimateCredits({ plan, project }) {
  const breakdown = [];

  if (plan?.needs?.segmentation) breakdown.push({ item: 'Object segmentation', credits: STEP_COSTS.segmentation });
  if (plan?.needs?.tryon) breakdown.push({ item: 'Virtual try-on', credits: STEP_COSTS.tryon });
  if (plan?.needs?.editing) breakdown.push({ item: 'AI edit', credits: STEP_COSTS.editing });

  // Large images cost one extra credit.
  const pixels = (project?.width || 0) * (project?.height || 0);
  if (pixels > 4_000_000) breakdown.push({ item: 'High resolution', credits: 1 });

  const credits = breakdown.reduce((sum, b) => sum + b.credits, 0);
  return { credits, breakdown };
}
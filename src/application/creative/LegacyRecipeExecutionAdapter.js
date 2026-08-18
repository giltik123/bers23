import { chainRunner } from '@/lib/recipes/chainRunner';
import { creditsEngine } from '@/lib/credits/creditsEngine';
import { creditsCalculator } from '@/lib/credits/creditsCalculator';

/** @deprecated LEGACY recipe-chain authority. Single edits must never use this adapter. */
export const legacyRecipeExecutionAdapter = Object.freeze({
  estimate: (chain) => creditsCalculator.estimateChain(chain).credits,
  cancel: () => chainRunner.cancel(),
  execute: ({ chain, project, objects, onProgress, onStepCommitted }) => creditsEngine.run({
    operation: `chain:${chain.name}`,
    provider: 'reve',
    credits: creditsCalculator.estimateChain(chain).credits,
    projectId: project.id,
    execute: () => chainRunner.run({ chain, project, objects, onProgress, onStepCommitted }),
  }),
});

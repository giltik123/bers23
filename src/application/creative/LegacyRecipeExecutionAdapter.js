import { creditsCalculator } from '@/lib/credits/creditsCalculator';

export const RECIPE_CHAIN_EXECUTION_NOT_WIRED = 'RECIPE_CHAIN_EXECUTION_NOT_WIRED';

/**
 * @deprecated Compatibility planning facade only.
 * Multi-step recipe execution requires the canonical server Execution Fabric.
 */
export const legacyRecipeExecutionAdapter = Object.freeze({
  estimate: (chain) => creditsCalculator.estimateChain(chain).credits,
  cancel: () => undefined,
  async execute() {
    const error = new Error('Recipe-chain execution is not wired to the canonical server Execution Fabric.');
    error.code = RECIPE_CHAIN_EXECUTION_NOT_WIRED;
    error.retryable = false;
    throw error;
  },
});

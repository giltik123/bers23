import type { CreativeExecutionPlatformDependencies } from '../../../src/platform/creative/canonical/contracts.ts';
import type { TransactionStore } from '../../transactions/application/ports.ts';
import { TransactionService } from '../../transactions/application/transactionService.ts';
import { CreativeExecutionService, type CreativeExecutionServiceDependencies } from '../application/creativeExecutionService.ts';
import { TransactionBillingAuthorityAdapter } from '../billing/TransactionBillingAuthorityAdapter.ts';
import { createCreativeExecuteHandler } from '../http/creativeExecuteHandler.ts';
import { createCreativeLifecycleHandlers } from '../http/creativeLifecycleHandlers.ts';

export type CreativeCoreCompositionInput = Readonly<{
  canonical: Omit<CreativeExecutionPlatformDependencies, 'billing'>;
  transactions: TransactionService;
  transactionStore: TransactionStore;
  ownsArtifacts: CreativeExecutionServiceDependencies['ownsArtifacts'];
  creditsPerEdit?: number;
  hardBudgetCredits?: number;
}>;

/** Server composition root. Concrete Fal/runtime ports are supplied by server bootstrap; no provider secret crosses this boundary. */
export function createCreativeCore(input: CreativeCoreCompositionInput) {
  const billing = new TransactionBillingAuthorityAdapter(input.transactions, input.transactionStore, 'fal');
  const service = new CreativeExecutionService({
    platform: { ...input.canonical, billing },
    ownsArtifacts: input.ownsArtifacts,
    creditsPerEdit: input.creditsPerEdit,
    hardBudgetCredits: input.hardBudgetCredits,
  });
  return Object.freeze({ service, execute: createCreativeExecuteHandler(service), lifecycle: createCreativeLifecycleHandlers(service) });
}

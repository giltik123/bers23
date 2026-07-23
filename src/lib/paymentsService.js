// Payments service layer — single gateway for all billing/credits logic.
// Business logic intentionally not implemented yet; no external APIs connected.

export const paymentsService = {
  // Returns the current user's credit balance.
  getBalance: async () => {
    throw new Error('Payments not implemented yet');
  },

  // Returns available plans / credit packs.
  getPlans: async () => {
    throw new Error('Payments not implemented yet');
  },

  // Starts a checkout flow for a plan or credit pack.
  checkout: async (_planId) => {
    throw new Error('Payments not implemented yet');
  },
};
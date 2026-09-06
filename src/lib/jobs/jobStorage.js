const persistenceDisabled = () => {
  throw new Error('Client job persistence is disabled; use canonical ExecutionRun recovery for durable execution state');
};

export const jobStorage = Object.freeze({
  save: persistenceDisabled,
  list: persistenceDisabled,
});
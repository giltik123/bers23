// PlannerLogger — records every planning request (in-memory ring buffer + console).

const MAX_LOGS = 100;
const logs = [];

export function logPlan(entry) {
  const record = { timestamp: new Date().toISOString(), ...entry };
  logs.push(record);
  if (logs.length > MAX_LOGS) logs.shift();
  console.debug('[AIPlanner]', record);
  return record;
}

export function getPlannerLogs() {
  return [...logs];
}
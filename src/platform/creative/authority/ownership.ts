export const AUTHORITY_DECISION_TABLE = Object.freeze([
  ['Select operation', 'Decision/Execution policy'], ['Validate operation', 'Operation Library'], ['Estimate cost', 'Cost Engine'],
  ['Authorize execution', 'Authorization Policy'], ['Reserve credits', 'Billing/Transaction'], ['Execute provider', 'Provider Runtime'],
  ['Execute local model', 'Local Runtime'], ['Verify artifact', 'Verification'], ['Report provider cost', 'Provider'],
  ['Calculate billable amount', 'Billing'], ['Commit credits', 'Billing/Transaction'], ['Release reservation', 'Billing/Transaction'],
  ['Learn from outcome', 'Learning'], ['Change security policy', 'Security/Policy only'],
] as const);

export const AUTHORITY_GRAPH = Object.freeze({ Decision: 'recommends', Planning: 'plans', Execution: 'prepares', Workflow: 'orchestrates', Provider: 'executes', Runtime: 'transports', Verification: 'evaluates', Billing: 'charges' } as const);

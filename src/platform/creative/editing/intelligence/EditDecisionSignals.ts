import type { EditDecision, EditDecisionSignal } from './types';

export class EditDecisionSignals {
  record(decision: EditDecision): EditDecisionSignal {
    const confidenceDelta = decision === 'confirmed_ai' ? 0.08 : decision === 'preferred_free_editing' ? 0.1 : decision === 'declined_ai' ? -0.05 : 0;
    return { decision, confidenceDelta, reason: `User decision captured: ${decision}` };
  }
}

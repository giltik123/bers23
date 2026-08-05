import type { EditDecision, EditRequest } from './CreativeOperation';
import { EditCapabilityResolver } from './EditCapabilityResolver';

export class EditDecisionEngine {
  constructor(private readonly resolver = new EditCapabilityResolver()) {}
  decide(request: EditRequest): EditDecision { return this.resolver.resolve(request); }
}

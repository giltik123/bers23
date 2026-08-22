import type { CanonicalDecisionPort, CreativeDecision, CreativeRequest } from '../contracts';

/**
 * Pure advisory decision boundary for production composition.
 * It interprets request intent but owns no execution, security, artifact or billing authority.
 */
export class CanonicalDecisionService implements CanonicalDecisionPort {
  async decide(request: CreativeRequest): Promise<CreativeDecision> {
    return Object.freeze({
      requestId: request.id,
      goal: request.intent,
      constraints: Object.freeze([] as string[]),
    });
  }
}

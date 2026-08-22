import type {
  CanonicalPlanningPort,
  CreativeDecision,
  CreativeOperation,
  CreativePlan,
  CreativePlanArtifactSnapshot,
  CreativePlanProvenance,
  CreativeRequest,
} from '../contracts';

export const CANONICAL_PLANNER_VERSION = '6.40A.1';

/**
 * Pure advisory production planner. It proposes operations but has no provider,
 * execution, persistence, authentication, ownership or financial authority.
 */
export class CanonicalPlanningService implements CanonicalPlanningPort {
  readonly #plannerVersion: string;

  constructor(options: Readonly<{ plannerVersion?: string }> = {}) {
    this.#plannerVersion = options.plannerVersion ?? CANONICAL_PLANNER_VERSION;
  }

  async plan(request: CreativeRequest, decision: CreativeDecision): Promise<CreativePlan> {
    const artifacts = Object.freeze((request.inputArtifacts ?? []).map(artifact => Object.freeze({
      id: artifact.id,
      kind: artifact.kind,
      role: artifact.role,
    } satisfies CreativePlanArtifactSnapshot)));
    const selectedObjectIds = request.metadata?.selectedObjectIds as readonly unknown[] | undefined;
    const controlled = request.metadata?.editCapability === 'CONTROLLED_LOCAL_EDIT'
      && artifacts.some(artifact => artifact.role === 'ORIGINAL')
      && artifacts.some(artifact => artifact.role === 'MASK')
      && Boolean(selectedObjectIds?.length);
    const input = controlled
      ? Object.freeze({
          instruction: request.intent,
          preserveMode: request.metadata?.preserveMode ?? 'STRICT',
          correlationId: request.metadata?.correlationId,
        })
      : Object.freeze({
          prompt: request.intent,
          correlationId: request.metadata?.correlationId,
        });
    const operation = Object.freeze({
      id: 'creative-image-edit',
      type: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'image-edit',
      providerId: 'fal',
      requiredArtifacts: Object.freeze(artifacts.map(artifact => artifact.id)),
      produces: Object.freeze(['image']),
      input,
    } satisfies CreativeOperation);
    const reasons = Object.freeze([
      controlled ? 'controlled-edit-prerequisites-satisfied' : 'global-edit-compatible-fallback',
      'canonical-artifact-identities-carried-forward',
    ]);
    const provenance = Object.freeze({
      plannerVersion: this.#plannerVersion,
      decisionGoal: decision.goal,
      inputArtifacts: artifacts,
      reasons,
    } satisfies CreativePlanProvenance);

    return Object.freeze({
      requestId: request.id,
      operations: Object.freeze([operation]),
      proposalId: `${this.#plannerVersion}:${request.id}`,
      plannerVersion: this.#plannerVersion,
      goal: decision.goal,
      assumptions: Object.freeze([] as string[]),
      constraints: Object.freeze([...decision.constraints]),
      provenance,
    });
  }
}
